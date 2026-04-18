import { runFlowEngine, TenantContext, detectEscalationIntent, type CallerMemory, type ChatFn, type ChatWithToolsFn } from '@ringback/flow-engine';
import { chatCompletion, chatWithTools } from './aiClient';
import { getCallerContext } from './callerContextService';
import { FlowType, SideEffect } from '@ringback/shared-types';
import { getCallerState, setCallerState, isDuplicate } from './stateService';
import { createOrder } from './orderService';
import { createMeeting } from './schedulingService';
import { sendNotification } from './notificationService';
import { createTask } from './taskService';
import { sendSms } from './twilioService';
import { matchesLocationKeyword, buildLocationReply } from './foodTruckLocationService';
import { createOrderPaymentSession } from './paymentService';
import { incrementSmsUsage } from './usageMeterService';
import { logger } from '../logger';
import { isWithinBusinessHours, getBusinessHoursDisplay, getNextOpenDisplay, getTodayHoursDisplay } from '../businessHours';
import { getActiveOrderCount } from './queueService';
import { prisma } from '../db';
import { encryptMessages, decryptMessages } from '../encryption';
import { ensureTenantSlug } from '../slugify';
import { Prisma } from '@prisma/client';

export interface ProcessInboundSmsInput {
  tenantId: string;
  callerPhone: string;
  inboundMessage: string;
  messageSid: string;
}

export async function processInboundSms(input: ProcessInboundSmsInput): Promise<void> {
  const { tenantId, callerPhone, inboundMessage, messageSid } = input;

  // Dedup check
  const duplicate = await isDuplicate(tenantId, messageSid);
  if (duplicate) {
    logger.warn('Duplicate message received, skipping', { tenantId, messageSid });
    return;
  }

  // Check if conversation is in HUMAN handoff mode
  let currentState = await getCallerState(tenantId, callerPhone);

  // Stale-state guard: if the caller's last interaction was > 30 min ago,
  // treat this message as the start of a fresh conversation rather than
  // replaying yesterday's cart. Redis TTL is 24h, so without this we'd
  // happily load an abandoned AWAITING_PAYMENT draft and the agent would
  // summarize it as if it were active.
  const STALE_STATE_MINUTES = 30;
  if (
    currentState?.lastMessageAt &&
    Date.now() - currentState.lastMessageAt > STALE_STATE_MINUTES * 60 * 1000
  ) {
    logger.info('Discarding stale caller state', {
      tenantId,
      callerPhone,
      ageMinutes: Math.round((Date.now() - currentState.lastMessageAt) / 60000),
      flowStep: currentState.flowStep,
    });
    currentState = null;
  }

  const existingConversationId = currentState?.conversationId ?? null;

  if (existingConversationId) {
    const existingConv = await prisma.conversation.findUnique({
      where: { id: existingConversationId },
      select: { handoffStatus: true, tenantId: true, messages: true },
    });

    if (existingConv?.handoffStatus === 'HUMAN') {
      // Save message but skip AI — human is handling this conversation
      const messages = decryptMessages(existingConv.messages);
      const updatedMessages = [
        ...messages,
        { role: 'user', content: inboundMessage, timestamp: new Date(), sender: 'customer' },
      ];
      await prisma.conversation.update({
        where: { id: existingConversationId },
        data: {
          messages: encryptMessages(updatedMessages) as unknown as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });

      // Notify owner about new message during handoff
      await sendNotification({
        tenantId,
        subject: 'New message during human handoff',
        message: `Customer ${callerPhone} sent a message while in human handoff mode: "${inboundMessage.substring(0, 100)}"`,
        channel: 'email',
      }).catch((err) => logger.warn('Failed to send handoff notification', { error: err }));

      logger.info('Message received during human handoff, skipping AI', { tenantId, callerPhone });
      return;
    }
  }

  // Food-truck short-circuit: "where are you?" → reply with today's spot
  // without running the full flow engine / LLM roundtrip.
  if (matchesLocationKeyword(inboundMessage)) {
    const ftTenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { businessType: true, config: { select: { timezone: true } } },
    });
    if (ftTenant?.businessType === 'FOOD_TRUCK') {
      const reply = await buildLocationReply(
        tenantId,
        new Date(),
        ftTenant.config?.timezone ?? 'America/Chicago'
      ).catch((err) => {
        logger.error('buildLocationReply failed', { err, tenantId });
        return null;
      });
      if (reply) {
        await sendSms(tenantId, callerPhone, reply).catch((err) =>
          logger.error('Failed to send food-truck location SMS', { err, tenantId })
        );

        // Persist the exchange to a conversation so it shows up in the dashboard.
        try {
          const newMessages = [
            { role: 'user', content: inboundMessage, timestamp: new Date(), sender: 'customer' },
            { role: 'assistant', content: reply, timestamp: new Date(), sender: 'bot' },
          ];
          if (existingConversationId) {
            const existing = await prisma.conversation.findUnique({
              where: { id: existingConversationId },
              select: { messages: true },
            });
            const messages = decryptMessages(existing?.messages);
            await prisma.conversation.update({
              where: { id: existingConversationId },
              data: {
                messages: encryptMessages([...messages, ...newMessages]) as unknown as Prisma.InputJsonValue,
                updatedAt: new Date(),
              },
            });
          } else {
            const conv = await prisma.conversation.create({
              data: {
                tenantId,
                callerPhone,
                messages: encryptMessages(newMessages) as unknown as Prisma.InputJsonValue,
                isActive: true,
              },
            });
            await setCallerState({
              tenantId,
              callerPhone,
              conversationId: conv.id,
              currentFlow: null,
              flowStep: null,
              orderDraft: null,
              lastMessageAt: Date.now(),
              messageCount: 1,
              dedupKey: messageSid,
            });
          }
        } catch (err) {
          logger.error('Failed to persist food-truck location conversation', { err, tenantId });
        }
        logger.info('Food-truck location reply sent', { tenantId, callerPhone });
        return;
      }
    }
  }

  // Load tenant context and caller context in parallel — these are independent
  // queries, and the caller context has historically been a noticeable serial
  // step on every inbound SMS. Parallelizing saves ~200-300ms per reply.
  const [tenant, callerContext] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        config: true,
        flows: { where: { isEnabled: true } },
        menuItems: {
          where: { isAvailable: true },
          include: {
            modifierGroups: {
              include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    }),
    getCallerContext(tenantId, callerPhone).catch((err) => {
      logger.warn('getCallerContext failed in processInboundSms', { err, tenantId });
      return null;
    }),
  ]);

  if (!tenant || !tenant.config) {
    logger.error('Tenant or config not found', { tenantId });
    return;
  }

  // Lazily backfill slug for tenants that pre-date the slug feature
  const tenantSlug = tenant.slug ?? (await ensureTenantSlug(tenant.id).catch(() => null));

  const tenantContext: TenantContext = {
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug,
    tenantPhoneNumber: tenant.twilioPhoneNumber,
    config: {
      ...tenant.config,
      businessDays: tenant.config.businessDays as number[],
      businessSchedule: tenant.config.businessSchedule as Record<string, { open: string; close: string }> | null | undefined,
      closedDates: tenant.config.closedDates as string[],
      // Decimal → number for serializable shared-types shape.
      salesTaxRate: tenant.config.salesTaxRate != null ? Number(tenant.config.salesTaxRate) : null,
    },
    flows: tenant.flows.map((f) => ({
      id: f.id,
      tenantId: f.tenantId,
      type: f.type as unknown as FlowType,
      isEnabled: f.isEnabled,
      config: (f.config ?? null) as Record<string, unknown> | null,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
    menuItems: tenant.menuItems.map((m) => ({
      ...m,
      price: Number(m.price),
      squareCatalogId: m.squareCatalogId,
      squareVariationId: m.squareVariationId,
      lastSyncedAt: m.lastSyncedAt,
      modifierGroups: (m.modifierGroups ?? []).map((g) => ({
        ...g,
        selectionType: g.selectionType as 'SINGLE' | 'MULTIPLE',
        modifiers: g.modifiers.map((mod) => ({
          ...mod,
          priceAdjust: Number(mod.priceAdjust),
        })),
      })),
    })),
  };

  // Check after-hours
  const hoursConfig = {
    businessHoursStart: tenant.config.businessHoursStart,
    businessHoursEnd: tenant.config.businessHoursEnd,
    businessDays: tenant.config.businessDays as number[],
    businessSchedule: tenant.config.businessSchedule as Record<string, { open: string; close: string }> | null,
    closedDates: tenant.config.closedDates as string[],
    timezone: tenant.config.timezone,
  };
  const withinBusinessHours = isWithinBusinessHours(hoursConfig);

  // Attach business-hours context so the ORDER agent can schedule future
  // pickups when we're closed (instead of dead-ending the conversation).
  tenantContext.hoursInfo = {
    openNow: withinBusinessHours,
    nextOpenDisplay: withinBusinessHours ? null : getNextOpenDisplay(hoursConfig),
    todayHoursDisplay: getTodayHoursDisplay(hoursConfig),
    weeklyHoursDisplay: getBusinessHoursDisplay(hoursConfig),
  };

  // If we're closed AND the tenant has opted out of accepting closed-hour
  // orders, disable the ORDER flow for this turn so the engine routes
  // message to FALLBACK (which can still answer questions). Leave other
  // flows (INQUIRY/MEETING/FALLBACK) intact.
  const acceptClosedHourOrders =
    (tenant.config as { acceptClosedHourOrders?: boolean }).acceptClosedHourOrders ?? true;
  if (!withinBusinessHours && !acceptClosedHourOrders) {
    tenantContext.flows = tenantContext.flows.map((f) =>
      f.type === FlowType.ORDER ? { ...f, isEnabled: false } : f,
    );
  }

  // Build caller memory so the AI can greet by name and reference prior orders.
  // `callerContext` was fetched in parallel with the tenant lookup above.
  let callerMemory: CallerMemory | undefined;
  if (callerContext) {
    const contactName: string | null = callerContext.contact?.name ?? null;

    let lastOrderSummary: string | null = null;
    let lastOrderItems: CallerMemory['lastOrderItems'] = undefined;
    if (callerContext.lastOrder) {
      const daysAgo = Math.max(
        1,
        Math.round((Date.now() - callerContext.lastOrder.createdAt.getTime()) / (24 * 60 * 60 * 1000))
      );
      const total = (callerContext.lastOrder.totalCents / 100).toFixed(2);
      lastOrderSummary = `order #${callerContext.lastOrder.orderNumber}, $${total}, ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`;

      // Shape the JSON items column into the CallerMemory type, dropping
      // anything that isn't a well-formed menu item reference.
      try {
        const rawItems = Array.isArray(callerContext.lastOrder.items)
          ? (callerContext.lastOrder.items as unknown[])
          : [];
        lastOrderItems = rawItems
          .map((r) => {
            const item = r as {
              menuItemId?: unknown;
              name?: unknown;
              quantity?: unknown;
              price?: unknown;
            };
            if (
              typeof item.menuItemId === 'string' &&
              typeof item.name === 'string' &&
              typeof item.quantity === 'number' &&
              typeof item.price === 'number'
            ) {
              return {
                menuItemId: item.menuItemId,
                name: item.name,
                quantity: item.quantity,
                price: item.price,
              };
            }
            return null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
        if (lastOrderItems.length === 0) lastOrderItems = undefined;
      } catch {
        lastOrderItems = undefined;
      }
    }

    callerMemory = {
      contactName,
      contactStatus: callerContext.contact?.status ?? null,
      tier: callerContext.tier,
      lastOrderSummary,
      lastOrderItems,
      lastConversationPreview: callerContext.lastConversation?.lastMessagePreview ?? null,
    };
  }

  // Run flow engine with the AI client. chatCompletion handles the
  // Claude-primary / MiniMax-backup fallback chain internally. If
  // neither AI provider is configured it throws, which we catch in the
  // error boundary below and send a generic fallback.
  // Thread tenantId so AI usage is attributed per tenant. Purpose lets us
  // break down cost by feature (intent classifier vs. order agent etc.)
  // in later reports.
  const chatFn: ChatFn = (params) =>
    chatCompletion({ ...params, tenantId, purpose: 'flow_engine_chat' });
  const chatWithToolsFn: ChatWithToolsFn = (params) =>
    chatWithTools({ ...params, tenantId, purpose: 'order_agent' });

  // Fetch a short conversation history only when we'll use the AI agent,
  // so we don't pay the decrypt cost for every tenant.
  let recentMessages: Array<{ role: 'user' | 'assistant'; content: string }> | undefined;
  if (
    (tenantContext.config as { aiOrderAgentEnabled?: boolean }).aiOrderAgentEnabled &&
    existingConversationId
  ) {
    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: existingConversationId },
        select: { messages: true },
      });
      if (conv) {
        const msgs = decryptMessages(conv.messages) as Array<{ role: string; content: string }>;
        recentMessages = msgs
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-6)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      }
    } catch (err) {
      logger.warn('Failed to load recent messages for AI agent', { err });
    }
  }

  const result = await runFlowEngine({
    tenantContext,
    callerPhone,
    inboundMessage,
    currentState,
    chatFn,
    chatWithToolsFn,
    recentMessages,
    callerMemory,
    getActiveOrderCount,
  });

  // cal.com async side effects that mutate the outgoing SMS before it
  // ships. Handled here (not in processSideEffect) because they need to
  // override `result.smsReply` and `result.nextState.meetingDraft`.
  // Narrow tenant.config once for this block — we already guaranteed it's
  // non-null at line 162 above.
  const calConfig = tenant.config!;
  for (const effect of result.sideEffects) {
    if (effect.type === 'FETCH_CALCOM_SLOTS') {
      try {
        const { listAvailableSlots } = await import('./calcomService');
        const hasTokens = Boolean(calConfig.calcomAccessToken && calConfig.calcomEventTypeId);
        const eventTypeId = calConfig.calcomEventTypeId;
        if (hasTokens && eventTypeId) {
          const slots = await listAvailableSlots(
            tenantId,
            eventTypeId,
            effect.payload.startUtc,
            effect.payload.endUtc,
            calConfig.timezone ?? 'America/Chicago',
          );
          const top = slots.slice(0, 6);
          if (top.length === 0) {
            result.smsReply = `Sorry, no open slots on ${effect.payload.dateLabel}. What other day works?`;
            // Step back so the customer can pick another day.
            result.nextState.flowStep = 'MEETING_DATE_PROMPT';
          } else {
            const lines = top.map((s, i) => {
              const t = new Intl.DateTimeFormat('en-US', {
                timeZone: calConfig.timezone ?? 'America/Chicago',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              }).format(new Date(s.start));
              return `${i + 1}. ${t}`;
            });
            result.smsReply = `Here are open slots for ${effect.payload.dateLabel}:\n${lines.join('\n')}\n\nReply with the number you want.`;
            result.nextState.meetingDraft = {
              ...(result.nextState.meetingDraft ?? {}),
              slots: top.map((s) => ({ start: s.start, end: s.end })),
            };
          }
        } else {
          result.smsReply = `cal.com isn't configured for this account — please contact us directly.`;
          result.nextState.flowStep = 'MEETING_GREETING';
        }
      } catch (err) {
        logger.error('FETCH_CALCOM_SLOTS failed', { tenantId, err });
        result.smsReply = `Sorry, I had trouble checking availability. Please try again in a moment.`;
      }
    } else if (effect.type === 'CREATE_CALCOM_BOOKING') {
      try {
        const { createBooking } = await import('./calcomService');
        const { createMeeting } = await import('./schedulingService');
        const hasTokens = Boolean(calConfig.calcomAccessToken && calConfig.calcomEventTypeId);
        const eventTypeId = calConfig.calcomEventTypeId;
        if (hasTokens && eventTypeId) {
          const booking = await createBooking(tenantId, {
            eventTypeId,
            start: effect.payload.start,
            attendeeName: effect.payload.name,
            attendeeEmail: effect.payload.email,
            attendeePhone: effect.payload.callerPhone,
            timeZone: calConfig.timezone ?? 'America/Chicago',
            metadata: {
              ringbackTenantId: tenantId,
              ringbackCallerPhone: effect.payload.callerPhone,
            },
          });
          // Meeting row is created here; the webhook will also see this
          // booking and upsert onto the same row via calcomBookingUid.
          await createMeeting({
            tenantId,
            conversationId: existingConversationId ?? '',
            callerPhone: effect.payload.callerPhone,
            scheduledAt: new Date(effect.payload.start),
            notes: `Booked via SMS: ${effect.payload.name} <${effect.payload.email}>`,
            calcomBookingId: String(booking.id),
            calcomBookingUid: booking.uid,
            status: 'CONFIRMED',
          }).catch((err) =>
            logger.warn('createMeeting after cal.com booking failed', { err, tenantId }),
          );
          const friendly = new Intl.DateTimeFormat('en-US', {
            timeZone: calConfig.timezone ?? 'America/Chicago',
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }).format(new Date(effect.payload.start));
          result.smsReply = `Booked! You're on the calendar for ${friendly}. You'll get a confirmation email with the meeting link shortly.`;
          // Clear meeting draft
          result.nextState.meetingDraft = null;
        } else {
          result.smsReply = `cal.com isn't configured — please contact us directly.`;
        }
      } catch (err: any) {
        logger.error('CREATE_CALCOM_BOOKING failed', { tenantId, err: err?.message });
        result.smsReply = `Sorry, I couldn't book that slot — it may have just been taken. Please reply with another day to try again.`;
        // Back to date prompt
        result.nextState.flowStep = 'MEETING_DATE_PROMPT';
        result.nextState.meetingDraft = { ...(result.nextState.meetingDraft ?? {}), slots: undefined, pickedSlotStart: undefined };
      }
    }
  }

  // Prepend after-hours notice ONLY on the first message of a new
  // conversation. Repeating it on every turn spams the customer (and
  // confuses the AI agent when it's mid-flow).
  const isFirstTurn = !existingConversationId;
  if (!withinBusinessHours && isFirstTurn) {
    const hoursDisplay = getBusinessHoursDisplay({
      businessHoursStart: tenant.config.businessHoursStart,
      businessHoursEnd: tenant.config.businessHoursEnd,
      businessDays: tenant.config.businessDays as number[],
      businessSchedule: tenant.config.businessSchedule as Record<string, { open: string; close: string }> | null,
      timezone: tenant.config.timezone,
    });
    const afterHoursNotice = `Thanks for reaching out! We're currently closed. Our hours are ${hoursDisplay}. We'll get back to you when we open. In the meantime, feel free to text us your question!`;
    result.smsReply = `${afterHoursNotice}\n\n${result.smsReply}`;
  }

  // Check for escalation intent
  const isEscalation = detectEscalationIntent(inboundMessage);
  if (isEscalation) {
    result.smsReply = "I'm connecting you with a team member who can help. Someone will follow up with you shortly!";
    logger.info('Escalation detected, handing off to human', { tenantId, callerPhone });
  }

  // Upsert conversation FIRST so we can save state with the real
  // conversationId atomically. The old flow did two writes:
  //   1) setCallerState({...nextState, dedupKey}) with conversationId=null
  //   2) setCallerState({...nextState, conversationId, dedupKey}) after create
  // Any inbound SMS that arrived between (1) and (2) would read state with
  // conversationId=null and create a duplicate Conversation row. That bug
  // produced two conversations within 47 seconds for the same caller on
  // 2026-04-18; the closed-hours notice also re-prepended because
  // `!existingConversationId` became true on the second SMS.
  let conversationId: string | null = existingConversationId;
  const newMessages = [
    { role: 'user', content: inboundMessage, timestamp: new Date(), sender: 'customer' },
    { role: 'assistant', content: result.smsReply, timestamp: new Date(), sender: 'bot' },
  ];

  if (!conversationId) {
    const conversation = await prisma.conversation.create({
      data: {
        tenantId,
        callerPhone,
        flowType: result.flowType,
        messages: encryptMessages(newMessages) as unknown as Prisma.InputJsonValue,
        isActive: true,
        ...(isEscalation && { handoffStatus: 'HUMAN', handoffAt: new Date() }),
      },
    });
    conversationId = conversation.id;
  } else {
    // Append messages to existing conversation
    const existing = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { messages: true },
    });

    const messages = decryptMessages(existing?.messages);
    const updatedMessages = [...messages, ...newMessages];
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        messages: encryptMessages(updatedMessages) as unknown as Prisma.InputJsonValue,
        flowType: result.flowType,
        updatedAt: new Date(),
        ...(isEscalation && { handoffStatus: 'HUMAN', handoffAt: new Date() }),
      },
    });
  }

  // Single state write, always with a resolved conversationId.
  await setCallerState({ ...result.nextState, conversationId, dedupKey: messageSid });

  // Mark firstReplyAt on the most recent missed call from this caller (idempotent).
  try {
    const recentMissedCall = await prisma.missedCall.findFirst({
      where: { tenantId, callerPhone, firstReplyAt: null },
      orderBy: { occurredAt: 'desc' },
      select: { id: true },
    });
    if (recentMissedCall) {
      await prisma.missedCall.update({
        where: { id: recentMissedCall.id },
        data: { firstReplyAt: new Date() },
      });
    }
  } catch (err) {
    logger.error('Failed to set firstReplyAt', { err, tenantId, callerPhone });
  }

  // Notify owner if escalation
  if (isEscalation) {
    await sendNotification({
      tenantId,
      subject: 'Customer requested human assistance',
      message: `Customer ${callerPhone} requested to speak with a human. Please check the conversation in your dashboard.`,
      channel: 'email',
    }).catch((err) => logger.warn('Failed to send escalation notification', { error: err }));

    // Create an action item for the owner
    await createTask({
      tenantId,
      source: 'CONVERSATION',
      title: `Reply needed: ${callerPhone}`,
      description: inboundMessage,
      priority: 'HIGH',
      callerPhone,
      conversationId: conversationId as string,
    }).catch((err) => logger.warn('Failed to create handoff task', { error: err }));
  }

  // Process side effects + send SMS + record usage, wrapped in an error
  // boundary so a crash after state is saved (line 432) doesn't silently
  // leave the customer stuck. On failure we send a generic fallback and
  // reset the flow to FALLBACK so the next message doesn't re-run the
  // same failed step.
  try {
    // Send the main agent reply FIRST, then fire side effects. A side
    // effect like CREATE_PAYMENT_LINK sends its own follow-up SMS
    // ("Pay securely here: …"); if we fire side effects first, the Stripe
    // link lands before the agent's summary, which reads backwards.
    // Empty smsReply = intentional silence (e.g. "ok" / emoji closure).
    if (result.smsReply && result.smsReply.trim().length > 0) {
      await sendSms(tenantId, callerPhone, result.smsReply);
    }

    // Process side effects (context passes data between effects, e.g. orderId from SAVE_ORDER to CREATE_PAYMENT_LINK)
    const sideEffectContext: Record<string, any> = {};
    for (const effect of result.sideEffects) {
      await processSideEffect(effect, tenantId, conversationId as string, callerPhone, sideEffectContext);
    }

    // Record usage
    const tenantMeta = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, stripeSubscriptionId: true },
    });

    if (tenantMeta) {
      await incrementSmsUsage(tenantId, tenantMeta.stripeSubscriptionId, tenantMeta.plan);
    }

    logger.info('Inbound SMS processed', {
      tenantId,
      flowType: result.flowType,
      sideEffects: result.sideEffects.length,
    });

    // Upsert contact record for CRM
    try {
      const orderEffects = result.sideEffects.filter((e) => e.type === 'SAVE_ORDER');
      const orderIncrement = orderEffects.length;
      const spentIncrement = orderEffects.reduce(
        (sum, e) => sum + Math.round((e.payload.total ?? 0) * 100),
        0
      );

      await prisma.contact.upsert({
        where: { tenantId_phone: { tenantId, phone: callerPhone } },
        create: {
          tenantId,
          phone: callerPhone,
          lastContactAt: new Date(),
          totalOrders: orderIncrement,
          totalSpent: spentIncrement,
        },
        update: {
          lastContactAt: new Date(),
          ...(orderIncrement > 0 && {
            totalOrders: { increment: orderIncrement },
            totalSpent: { increment: spentIncrement },
          }),
        },
      });
    } catch (err) {
      logger.error('Failed to upsert contact', { tenantId, error: err });
    }
  } catch (err) {
    logger.error('processInboundSms crash after state save', { tenantId, error: err });
    // Reset flow state so the next message doesn't re-run the crashed step.
    try {
      await setCallerState({
        tenantId,
        callerPhone,
        conversationId: conversationId ?? null,
        currentFlow: null,
        flowStep: null,
        orderDraft: null,
        lastMessageAt: Date.now(),
        messageCount: (currentState?.messageCount ?? 0) + 1,
        dedupKey: messageSid,
      });
    } catch { /* best-effort */ }
    // Send a generic fallback SMS so the customer isn't silently abandoned.
    try {
      await sendSms(
        tenantId,
        callerPhone,
        `Sorry, something went wrong on our end. A team member has been notified and will follow up with you shortly.`,
      );
    } catch { /* best-effort */ }
    // Notify the owner
    await sendNotification({
      tenantId,
      subject: 'Flow engine error',
      message: `An error occurred while processing a message from ${callerPhone}. The customer has been notified.`,
      channel: 'email',
    }).catch(() => {});
  }
}

async function processSideEffect(
  effect: SideEffect,
  tenantId: string,
  conversationId: string,
  callerPhone: string,
  context: Record<string, any> = {}
): Promise<void> {
  switch (effect.type) {
    case 'SAVE_ORDER': {
      const order = await createOrder({
        tenantId,
        conversationId,
        callerPhone,
        items: effect.payload.items,
        total: effect.payload.total,
        subtotal: effect.payload.subtotal,
        taxAmount: effect.payload.taxAmount,
        feeAmount: effect.payload.feeAmount,
        pickupTime: effect.payload.pickupTime,
        notes: effect.payload.notes,
      });
      context.orderId = order.id;
      context.orderNumber = order.orderNumber;
      break;
    }

    case 'BOOK_MEETING':
      await createMeeting({
        tenantId,
        conversationId,
        callerPhone,
        preferredTime: effect.payload.preferredTime,
        notes: effect.payload.notes,
      });
      break;

    case 'NOTIFY_OWNER':
      await sendNotification({
        tenantId,
        subject: effect.payload.subject,
        message: effect.payload.message,
        channel: effect.payload.channel,
      });
      break;

    case 'CREATE_SQUARE_ORDER': {
      // Legacy — delegate to generic POS order creation
      try {
        const { posRegistry } = await import('../pos/registry');
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { posProvider: true, posLocationId: true },
        });
        if (tenant?.posProvider && tenant.posLocationId) {
          const adapter = posRegistry.get(tenant.posProvider);
          const posItems = effect.payload.items
            .filter((i: any) => i.squareVariationId || i.posVariationId)
            .map((i: any) => ({
              externalVariationId: i.squareVariationId || i.posVariationId,
              quantity: i.quantity,
            }));
          if (posItems.length > 0) {
            const result = await adapter.createOrder(tenantId, posItems, {
              locationId: effect.payload.locationId || tenant.posLocationId,
              idempotencyKey: `ringback-${conversationId}-${Date.now()}`,
            });
            logger.info('POS order created (via legacy CREATE_SQUARE_ORDER)', { tenantId, externalOrderId: result.externalOrderId });
          }
        }
      } catch (err) {
        logger.error('CREATE_SQUARE_ORDER side effect failed', { tenantId, error: err });
      }
      break;
    }

    case 'CREATE_POS_ORDER': {
      try {
        const { posRegistry } = await import('../pos/registry');
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { posProvider: true, posLocationId: true },
        });
        if (!tenant?.posProvider || !tenant.posLocationId) {
          logger.warn('CREATE_POS_ORDER: tenant has no POS configured', { tenantId });
          break;
        }
        const adapter = posRegistry.get(tenant.posProvider);
        const posItems = effect.payload.items
          .filter((i: any) => i.posVariationId || i.squareVariationId)
          .map((i: any) => ({
            externalVariationId: i.posVariationId || i.squareVariationId,
            quantity: i.quantity,
          }));
        if (posItems.length === 0) {
          logger.warn('CREATE_POS_ORDER: no items with POS variation IDs', { tenantId });
          break;
        }
        const result = await adapter.createOrder(tenantId, posItems, {
          locationId: tenant.posLocationId,
          idempotencyKey: `ringback-${conversationId}-${Date.now()}`,
        });
        logger.info('POS order created', { tenantId, provider: tenant.posProvider, externalOrderId: result.externalOrderId });
      } catch (err) {
        logger.error('CREATE_POS_ORDER failed', { tenantId, error: err });
      }
      break;
    }

    case 'CREATE_PAYMENT_LINK': {
      try {
        const { sessionId, url } = await createOrderPaymentSession({
          tenantId,
          orderId: context.orderId,
          orderNumber: context.orderNumber,
          items: effect.payload.items,
          total: effect.payload.total,
          subtotal: effect.payload.subtotal,
          taxAmount: effect.payload.taxAmount,
          feeAmount: effect.payload.feeAmount,
          callerPhone,
          pickupTime: effect.payload.pickupTime,
          notes: effect.payload.notes,
        });

        if (context.orderId) {
          // Order already exists (pay-after-order flow) — update it
          await prisma.order.update({
            where: { id: context.orderId },
            data: {
              stripePaymentId: sessionId,
              stripePaymentUrl: url,
              paymentStatus: 'PENDING',
            },
          });
        } else {
          // Payment-first flow — store pending payment in Redis
          const currentState = await getCallerState(tenantId, callerPhone);
          if (currentState) {
            await setCallerState({
              ...currentState,
              paymentPending: {
                pickupTime: effect.payload.pickupTime ?? '',
                notes: effect.payload.notes ?? null,
                stripeSessionId: sessionId,
                createdAt: Date.now(),
              },
            });
          }
        }

        // Send payment link as follow-up SMS
        await sendSms(tenantId, callerPhone, `Pay securely here: ${url}`);
        logger.info('Payment link sent', { tenantId, orderId: context.orderId ?? 'pending', sessionId });
      } catch (err) {
        logger.error('CREATE_PAYMENT_LINK failed', { tenantId, error: err });
      }
      break;
    }

    default:
      logger.warn('Unknown side effect type', { effect });
  }
}
