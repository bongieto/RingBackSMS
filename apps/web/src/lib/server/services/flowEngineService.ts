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
import { isWithinBusinessHours, getBusinessHoursDisplay, getNextOpenDisplay, getTodayHoursDisplay, getMinutesUntilClose, getClosesAtDisplay } from '../businessHours';
import { getActiveOrderCount } from './queueService';
import { prisma } from '../db';
import { encryptMessages, decryptMessages } from '../encryption';
import { ensureTenantSlug } from '../slugify';
import { Prisma } from '@prisma/client';
import { recordDecision, mergeDecisions, currentTurnId, setTurnSnapshots } from '../turn/TurnContext';
import { withTurn } from '../turn/withTurn';
import type { DecisionDraft, TurnOutcome } from '@ringback/shared-types';

export interface ProcessInboundSmsInput {
  tenantId: string;
  callerPhone: string;
  inboundMessage: string;
  messageSid: string;
}

export interface ProcessInboundSmsOptions {
  /**
   * Bot-tester mode: run the full compute path (flow engine, persistence,
   * caller state, contact upsert) but DO NOT send any outbound SMS and
   * DO NOT execute side effects (SAVE_ORDER, CREATE_PAYMENT_LINK,
   * NOTIFY_OWNER, etc). The computed reply + raw side-effect descriptors
   * are returned to the caller instead. Used by /admin/bot-tester to
   * simulate conversations without touching Twilio, Stripe, or Square.
   */
  testMode?: boolean;
}

export interface ProcessInboundSmsTestResult {
  reply: string;
  sideEffects: SideEffect[];
  nextState: Awaited<ReturnType<typeof runFlowEngine>>['nextState'];
  flowType: FlowType;
}

export async function processInboundSms(
  input: ProcessInboundSmsInput,
  options?: ProcessInboundSmsOptions,
): Promise<void | ProcessInboundSmsTestResult> {
  // Turn Record wrapper: when TURN_RECORD_ENABLED=1, opens an ALS scope so
  // pre-handler + flow-engine decisions land on a single Turn row. When
  // disabled (default), this is a passthrough — no ALS, no DB write.
  //
  // The wrapper seeds outcome=ERROR_UNHANDLED and replaces it with what
  // the inner body returns via `__turnOutcome`. Bot-tester returns
  // ProcessInboundSmsTestResult; prod returns void — both paths converge
  // through the same wrapper so Turn bookkeeping is identical.
  return withTurn(
    {
      tenantId: input.tenantId,
      callerPhone: input.callerPhone,
      inboundMessageSid: input.messageSid,
      inboundBody: input.inboundMessage,
      inboundReceivedAt: new Date(),
    },
    async () => {
      const result = await processInboundSmsInner(input, options);
      // Shape the return into a TurnResult while preserving the caller's
      // expected void | ProcessInboundSmsTestResult. The `outcome` fields
      // land on the Turn row; the extra keys are ignored by testMode
      // consumers at the edges.
      const turnOutcome: TurnOutcome =
        result && 'reply' in result
          ? result.reply === ''
            ? 'SUPPRESSED_COMPLIANCE'
            : 'REPLIED'
          : 'REPLIED';
      const replyBody = result && 'reply' in result ? result.reply : undefined;
      // We cast through `any` because withTurn's type signature requires
      // TurnResult, but our public signature is `void | TestResult` — the
      // extra `outcome`/`replyBody` fields are harmless to testMode
      // consumers (they don't read them).
      return Object.assign(result ?? {}, {
        outcome: turnOutcome,
        replyBody,
      }) as any;
    },
  ) as Promise<void | ProcessInboundSmsTestResult>;
}

async function processInboundSmsInner(
  input: ProcessInboundSmsInput,
  options?: ProcessInboundSmsOptions,
): Promise<void | ProcessInboundSmsTestResult> {
  const { tenantId, callerPhone, inboundMessage, messageSid } = input;
  const testMode = options?.testMode === true;
  const startTs = Date.now();

  // Dedup check
  const duplicate = await isDuplicate(tenantId, messageSid);
  if (duplicate) {
    recordDecision({
      handler: 'dedup',
      phase: 'PRE_HANDLER',
      outcome: 'suppressed_duplicate',
      evidence: { messageSid },
      durationMs: Date.now() - startTs,
    });
    logger.warn('Duplicate message received, skipping', { tenantId, messageSid });
    return;
  }
  recordDecision({
    handler: 'dedup',
    phase: 'PRE_HANDLER',
    outcome: 'miss',
    durationMs: Date.now() - startTs,
  });

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
    recordDecision({
      handler: 'staleStateGuard',
      phase: 'PRE_HANDLER',
      outcome: 'discarded',
      evidence: {
        ageMinutes: Math.round((Date.now() - currentState.lastMessageAt) / 60000),
        flowStep: currentState.flowStep,
      },
      durationMs: 0,
    });
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
      if (!testMode) {
        await sendNotification({
          tenantId,
          subject: 'New message during human handoff',
          message: `Customer ${callerPhone} sent a message while in human handoff mode: "${inboundMessage.substring(0, 100)}"`,
          channel: 'email',
        }).catch((err) => logger.warn('Failed to send handoff notification', { error: err }));
      }

      recordDecision({
        handler: 'humanHandoff',
        phase: 'PRE_HANDLER',
        outcome: 'handed_off_to_human',
        evidence: { conversationId: existingConversationId },
        durationMs: 0,
      });
      logger.info('Message received during human handoff, skipping AI', { tenantId, callerPhone, testMode });
      if (testMode) {
        return {
          reply: '',
          sideEffects: [],
          nextState: (currentState as unknown as ProcessInboundSmsTestResult['nextState']),
          flowType: FlowType.FALLBACK,
        };
      }
      return;
    }
  }

  // ── ENGLISH-ONLY GATE ─────────────────────────────────────────────────
  // We don't support replies in languages other than English. When an
  // inbound message is clearly in another language (Spanish or Tagalog
  // today, by marker-word heuristic), send a fixed English apology and
  // short-circuit the pipeline. This runs AFTER compliance/HUMAN-handoff
  // checks (so STOP/HELP/START still work on a suppressed account) and
  // BEFORE the flow engine / LLM, so no prompt ever sees a non-English
  // message that might destabilize its reasoning.
  //
  // Why a gate instead of in-language replies: four rounds of
  // multilingual patches kept moving the bug around (markers colliding
  // with menu names, bilingual sentences flipping the session, LLM
  // behavior varying under multilingual prompt load). Pulling back to
  // English-only is a policy decision: say it clearly, let customers
  // retry in English, and stop chasing translation fidelity.
  //
  // If the detector returns null, we treat the message as English (or
  // too-short-to-judge) and fall through. The detector's marker lists
  // are conservative by design — short English messages containing no
  // Spanish or Tagalog function words won't trigger this branch.
  {
    const { detectLanguage } = await import('@ringback/flow-engine');
    const nonEnglish = detectLanguage(inboundMessage, null);
    if (nonEnglish === 'es' || nonEnglish === 'tl') {
      const reply =
        `Sorry, we only speak English here. Please text us in English and we'll help you out!`;
      // Persist the turn so the conversation dashboard still shows
      // the customer's message and our reply.
      try {
        const newMessages = [
          { role: 'user', content: inboundMessage, timestamp: new Date(), sender: 'customer' },
          { role: 'assistant', content: reply, timestamp: new Date(), sender: 'bot' },
        ];
        let convoId = existingConversationId;
        if (convoId) {
          const existing = await prisma.conversation.findUnique({
            where: { id: convoId },
            select: { messages: true },
          });
          const messages = decryptMessages(existing?.messages);
          await prisma.conversation.update({
            where: { id: convoId },
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
          convoId = conv.id;
        }
        await setCallerState({
          tenantId,
          callerPhone,
          conversationId: convoId,
          currentFlow: null,
          flowStep: null,
          orderDraft: null,
          lastMessageAt: Date.now(),
          messageCount: (currentState?.messageCount ?? 0) + 1,
          dedupKey: messageSid,
        });
      } catch (err) {
        logger.error('Failed to persist English-only gate turn', { err, tenantId });
      }
      if (!testMode) {
        await sendSms(tenantId, callerPhone, reply).catch((err) =>
          logger.error('Failed to send English-only gate SMS', { err, tenantId }),
        );
      }
      logger.info('English-only gate fired', { tenantId, callerPhone, detected: nonEnglish });
      if (testMode) {
        const st = await getCallerState(tenantId, callerPhone);
        return {
          reply,
          sideEffects: [],
          nextState: (st as unknown as ProcessInboundSmsTestResult['nextState']),
          flowType: FlowType.FALLBACK,
        };
      }
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
        if (!testMode) {
          await sendSms(tenantId, callerPhone, reply).catch((err) =>
            logger.error('Failed to send food-truck location SMS', { err, tenantId })
          );
        }

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
        logger.info('Food-truck location reply sent', { tenantId, callerPhone, testMode });
        if (testMode) {
          const st = await getCallerState(tenantId, callerPhone);
          return {
            reply,
            sideEffects: [],
            nextState: (st as unknown as ProcessInboundSmsTestResult['nextState']),
            flowType: FlowType.FALLBACK,
          };
        }
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
          // Include category availability so we can filter below — Prisma
          // doesn't support OR on relation fields inline, so we filter
          // after the query rather than at the SQL layer.
          where: { isAvailable: true, posDeletedAt: null },
          include: {
            categoryRef: { select: { isAvailable: true } },
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

  // Populate the Turn's snapshot fields now that we have the tenant in
  // hand. Passing `currentState` on the contact snapshot ensures replays
  // can see the caller's flowStep at the moment of the turn.
  setTurnSnapshots({
    tenantConfigSnapshot: tenant.config,
    contactStateSnapshot: {
      flowStep: currentState?.flowStep ?? null,
      currentFlow: currentState?.currentFlow ?? null,
      conversationId: currentState?.conversationId ?? null,
    },
  });

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
    // Filter out items whose category has been hidden. The per-item
    // availability filter runs in SQL; category-level is post-filter
    // because Prisma can't express "item.isAvailable AND (categoryRef IS
    // NULL OR categoryRef.isAvailable = true)" in a single relation `where`.
    menuItems: tenant.menuItems
      .filter((m) => (m as { categoryRef?: { isAvailable: boolean } }).categoryRef?.isAvailable !== false)
      .map((m) => ({
      ...m,
      price: Number(m.price),
      squareCatalogId: m.squareCatalogId,
      squareVariationId: m.squareVariationId,
      lastSyncedAt: m.lastSyncedAt,
      modifierGroups: (m.modifierGroups ?? []).map((g) => ({
        ...g,
        // QUANTITY / PIZZA / MIXED are stored but not yet honored by the SMS
        // agent — downgrade them to SINGLE so the prompt stays understandable.
        selectionType: (g.selectionType === 'MULTIPLE' ? 'MULTIPLE' : 'SINGLE') as 'SINGLE' | 'MULTIPLE',
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
  const minutesUntilClose = withinBusinessHours ? getMinutesUntilClose(hoursConfig) : null;
  // Default last-orders grace — the operator can override per-tenant via
  // config.lastOrdersGraceMinutes once we expose it in settings. 15 min
  // is the industry default (matches Toast, Square).
  const lastOrdersGrace =
    (tenant.config as { lastOrdersGraceMinutes?: number | null }).lastOrdersGraceMinutes ?? 15;
  tenantContext.hoursInfo = {
    openNow: withinBusinessHours,
    nextOpenDisplay: withinBusinessHours ? null : getNextOpenDisplay(hoursConfig),
    todayHoursDisplay: getTodayHoursDisplay(hoursConfig),
    weeklyHoursDisplay: getBusinessHoursDisplay(hoursConfig),
    minutesUntilClose,
    closesAtDisplay: withinBusinessHours ? getClosesAtDisplay(hoursConfig) : null,
    closingSoon:
      minutesUntilClose != null && minutesUntilClose > 0 && minutesUntilClose <= lastOrdersGrace,
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

  // ── Pre-flow-engine handlers ────────────────────────────────────────────
  // Intercept specific message classes BEFORE we invoke the LLM. These
  // cover compliance (STOP/HELP/START), safety (allergy), operational
  // integrity (pause-orders), arrival validation ("I'm here"), and
  // dedicated intents that the FALLBACK LLM has been handling badly
  // (HOURS). See preHandlers.ts for rationale on each.
  //
  // Order matters: suppression → compliance keyword → ops → allergy →
  // arrival → hours. Compliance keywords win even if the caller is
  // suppressed (so a STOP re-confirms, a START unsuppresses).
  {
    const { handleComplianceKeyword, checkSuppression, handleOpsCommand,
      handleAllergyIntent, handleArrivalIntent, handleHoursIntent } =
      await import('./preHandlers');
    const preCtx = {
      tenantId,
      tenantName: tenant.name,
      tenantPhoneNumber: tenant.twilioPhoneNumber ?? null,
      callerPhone,
    };
    const compliance = await handleComplianceKeyword(inboundMessage, preCtx);
    const preResult =
      compliance ??
      (await checkSuppression(preCtx)) ??
      handleOpsCommand(inboundMessage, preCtx) ??
      handleAllergyIntent(inboundMessage, preCtx) ??
      (await handleArrivalIntent(inboundMessage, preCtx)) ??
      handleHoursIntent(inboundMessage, {
        ...preCtx,
        openNow: tenantContext.hoursInfo!.openNow,
        todayHoursDisplay: tenantContext.hoursInfo!.todayHoursDisplay,
        nextOpenDisplay: tenantContext.hoursInfo!.nextOpenDisplay,
        weeklyHoursDisplay: tenantContext.hoursInfo!.weeklyHoursDisplay,
        closesAtDisplay: tenantContext.hoursInfo!.closesAtDisplay ?? null,
      });

    if (!preResult) {
      logger.info('Pre-handler miss', {
        tenantId,
        callerPhone,
        body: inboundMessage.slice(0, 80),
        hoursInfoPresent: tenantContext.hoursInfo != null,
      });
    }

    if (preResult) {
      logger.info('Pre-handler short-circuit', {
        tenantId,
        callerPhone,
        reply: preResult.reply.slice(0, 80),
      });
      // Persist the turn so it shows up in the dashboard, then return
      // without running the flow engine or emitting side effects
      // through processSideEffect (testMode behavior mirrors this).
      const newMessages = [
        { role: 'user', content: inboundMessage, timestamp: new Date(), sender: 'customer' },
        ...(preResult.reply
          ? [{ role: 'assistant', content: preResult.reply, timestamp: new Date(), sender: 'bot' } as const]
          : []),
      ];
      try {
        let convoId = existingConversationId;
        if (convoId) {
          const existing = await prisma.conversation.findUnique({
            where: { id: convoId },
            select: { messages: true },
          });
          const messages = decryptMessages(existing?.messages);
          await prisma.conversation.update({
            where: { id: convoId },
            data: {
              messages: encryptMessages([...messages, ...newMessages]) as unknown as Prisma.InputJsonValue,
              updatedAt: new Date(),
            },
          });
        } else if (preResult.reply) {
          const conv = await prisma.conversation.create({
            data: {
              tenantId,
              callerPhone,
              flowType: preResult.flowType,
              messages: encryptMessages(newMessages) as unknown as Prisma.InputJsonValue,
              isActive: true,
            },
          });
          convoId = conv.id;
        }
        if (convoId) {
          await setCallerState({
            tenantId,
            callerPhone,
            conversationId: convoId,
            currentFlow: preResult.flowType,
            flowStep: null,
            orderDraft: null,
            lastMessageAt: Date.now(),
            messageCount: (currentState?.messageCount ?? 0) + 1,
            dedupKey: messageSid,
          });
        }
      } catch (err) {
        logger.error('Failed to persist pre-handler turn', { err, tenantId });
      }

      if (!testMode && preResult.reply) {
        await sendSms(tenantId, callerPhone, preResult.reply).catch((err) =>
          logger.error('Failed to send pre-handler SMS', { err, tenantId }),
        );
      }
      logger.info('Turn complete', {
        tenantId,
        callerPhone,
        inboundLen: inboundMessage.length,
        path: `pre_handler:${preResult.flowType}`,
        replyLen: preResult.reply?.length ?? 0,
        latencyMs: Date.now() - startTs,
        testMode,
      });
      if (testMode) {
        const st = await getCallerState(tenantId, callerPhone);
        return {
          reply: preResult.reply,
          sideEffects: preResult.sideEffects,
          nextState: (st as unknown as ProcessInboundSmsTestResult['nextState']),
          flowType: preResult.flowType,
        };
      }
      return;
    }
  }

  // Build caller memory so the AI can greet by name and reference prior orders.
  // `callerContext` was fetched in parallel with the tenant lookup above.
  let callerMemory: CallerMemory | undefined;
  if (callerContext) {
    // Contact.name is stored encrypted (AES-256-GCM) — decrypt here before
    // exposing as plain text to the rest of the flow engine. Older rows
    // may still be legacy plaintext; decryptMaybePlaintext handles both.
    let contactName: string | null = null;
    if (callerContext.contact?.name) {
      try {
        const { decryptMaybePlaintext } = await import('../encryption');
        contactName = decryptMaybePlaintext(callerContext.contact.name);
      } catch {
        contactName = null;
      }
    }

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

    // Language detection + sticky preferredLanguage persistence used
    // to live here. We dropped foreign-language support — inbound
    // non-English messages are now intercepted earlier (see the
    // English-only gate above) and the agent replies in English only.
    // Contact.preferredLanguage still exists as a Prisma column for
    // historical data but is no longer read or written here.

    // Active order: find the most recent non-terminal Order for this
    // caller. Lets fallback/chat replies quote the REAL pickup ETA
    // instead of making one up from conversation context.
    let activeOrder: CallerMemory['activeOrder'] = null;
    try {
      const inflight = await prisma.order.findFirst({
        where: {
          tenantId,
          callerPhone,
          status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          orderNumber: true,
          status: true,
          estimatedReadyTime: true,
          pickupTime: true,
          items: true,
          total: true,
        },
      });
      if (inflight) {
        const rawItems = Array.isArray(inflight.items)
          ? (inflight.items as Array<{ name?: unknown; quantity?: unknown }>)
          : [];
        const itemsSummary = rawItems
          .map((i) =>
            typeof i.name === 'string' && typeof i.quantity === 'number'
              ? `${i.quantity}× ${i.name}`
              : null,
          )
          .filter(Boolean)
          .slice(0, 5)
          .join(', ');
        activeOrder = {
          orderNumber: inflight.orderNumber,
          status: inflight.status,
          estimatedReadyTime: inflight.estimatedReadyTime?.toISOString() ?? null,
          pickupTime: inflight.pickupTime ?? null,
          itemsSummary: itemsSummary || null,
          total: Number(inflight.total),
        };
      }
    } catch (err) {
      logger.warn('Failed to fetch active order for callerMemory', { err });
    }

    callerMemory = {
      contactName,
      contactStatus: callerContext.contact?.status ?? null,
      tier: callerContext.tier,
      lastOrderSummary,
      lastOrderItems,
      lastConversationPreview: callerContext.lastConversation?.lastMessagePreview ?? null,
      activeOrder,
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

  // Sink for Decision drafts pushed by flow-engine handlers. Merged into
  // the ALS-backed Turn context so all decisions land on the same Turn
  // row. Safe when Turn Record is disabled — mergeDecisions no-ops.
  const flowDecisions: DecisionDraft[] = [];

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
    decisions: flowDecisions,
  });
  mergeDecisions(flowDecisions);

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
  // Skip the hours notice when the first turn is an ORDER — the agent
  // itself decides whether to accept the cart or schedule it for next
  // open window, and prepending "We're currently closed…" on top of an
  // "Added: 1× #A1" reply is both redundant and confusing.
  if (!withinBusinessHours && isFirstTurn && result.flowType !== FlowType.ORDER) {
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

  // Strip emoji + non-GSM-7 pictographs before sending. A single emoji
  // bumps the whole SMS to UCS-2 encoding, halving the 160-char
  // segment size and doubling cost. LLM replies regularly leak
  // (e.g. "Order ready! ") despite prompt instructions — this is
  // the belt-and-suspenders filter.
  {
    const { stripEmoji } = await import('./preHandlers');
    result.smsReply = stripEmoji(result.smsReply);
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
        causingTurnId: currentTurnId() ?? null,
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
        causingTurnId: currentTurnId() ?? null,
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
  if (isEscalation && !testMode) {
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
    if (result.smsReply && result.smsReply.trim().length > 0 && !testMode) {
      await sendSms(tenantId, callerPhone, result.smsReply);
    }

    // Process side effects. Each is wrapped in its own try/catch so a
    // failure in one effect doesn't cascade and silently drop subsequent
    // effects. Two classes of effects:
    //   - CRITICAL effects (SAVE_ORDER, CREATE_PAYMENT_LINK): failure
    //     means the customer is stuck — we abort the rest of the chain
    //     and send an apology SMS.
    //   - CONVENIENCE effects (NOTIFY_OWNER, CREATE_POS_ORDER when the
    //     customer hasn't paid yet): failure is non-fatal; log and move
    //     on so the customer gets their payment link even if the owner
    //     didn't get their Slack ping.
    const CRITICAL_EFFECTS = new Set(['SAVE_ORDER', 'CREATE_PAYMENT_LINK']);
    const sideEffectContext: Record<string, any> = {};
    let criticalFailure: { effect: string; error: string } | null = null;
    // In testMode, selectively execute DB-only effects so the admin bot
    // tester can simulate payment webhooks against a real Order row.
    // Everything that talks to external systems (Stripe, Square, Twilio,
    // email/Slack notifications) stays skipped.
    const TEST_MODE_EXECUTABLE = new Set(['SAVE_ORDER']);
    for (const effect of result.sideEffects) {
      if (criticalFailure) break; // abort chain once a critical effect fails
      if (testMode && !TEST_MODE_EXECUTABLE.has(effect.type)) continue;
      try {
        await processSideEffect(effect, tenantId, conversationId as string, callerPhone, sideEffectContext);
      } catch (effectErr: any) {
        const msg = effectErr?.message ?? String(effectErr);
        if (CRITICAL_EFFECTS.has(effect.type)) {
          criticalFailure = { effect: effect.type, error: msg };
          logger.error('Critical side effect failed — aborting chain', {
            tenantId,
            effect: effect.type,
            err: msg,
          });
        } else {
          logger.warn('Non-critical side effect failed — continuing', {
            tenantId,
            effect: effect.type,
            err: msg,
          });
        }
      }
    }

    if (criticalFailure) {
      // Customer got the agent's "you'll get a payment link shortly"
      // reply already. If the link generation tanked, tell them now.
      const { sms: i18nSms } = await import('@/lib/server/i18n');
      if (!testMode) {
        await sendSms(
          tenantId,
          callerPhone,
          i18nSms('orderProcessingFailed', null, {}),
        ).catch(() => {});
      }
      // Mark any partially-created order as UNPAID (not stuck in PENDING)
      // so operator-facing dashboards show it didn't finalize.
      if (sideEffectContext.orderId) {
        await prisma.order
          .updateMany({
            where: { id: sideEffectContext.orderId, paymentStatus: 'PENDING' },
            data: { paymentStatus: 'UNPAID' },
          })
          .catch(() => {});
      }
    }

    // Record usage
    const tenantMeta = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, stripeSubscriptionId: true },
    });

    if (tenantMeta && !testMode) {
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
    if (!testMode) {
      try {
        await sendSms(
          tenantId,
          callerPhone,
          `Sorry, something went wrong on our end. A team member has been notified and will follow up with you shortly.`,
        );
      } catch { /* best-effort */ }
    }
    // Notify the owner
    if (!testMode) {
      await sendNotification({
        tenantId,
        subject: 'Flow engine error',
        message: `An error occurred while processing a message from ${callerPhone}. The customer has been notified.`,
        channel: 'email',
      }).catch(() => {});
    }
  }

  logger.info('Turn complete', {
    tenantId,
    callerPhone,
    inboundLen: inboundMessage.length,
    path: `flow:${result.flowType}`,
    replyLen: result.smsReply?.length ?? 0,
    sideEffectCount: result.sideEffects.length,
    latencyMs: Date.now() - startTs,
    testMode,
  });

  if (testMode) {
    return {
      reply: result.smsReply ?? '',
      sideEffects: result.sideEffects,
      nextState: result.nextState,
      flowType: result.flowType,
    };
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
        customerName: effect.payload.customerName,
        paymentStatus: effect.payload.paymentStatus,
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
      // Belt-and-suspenders: the caller wraps us in a try/catch, but
      // also log here so the warning names NOTIFY_OWNER specifically
      // rather than the generic "non-critical side effect failed".
      try {
        await sendNotification({
          tenantId,
          subject: effect.payload.subject,
          message: effect.payload.message,
          channel: effect.payload.channel,
        });
      } catch (err: any) {
        logger.warn('NOTIFY_OWNER send failed (non-fatal, customer flow continues)', {
          tenantId,
          subject: effect.payload.subject,
          err: err?.message ?? String(err),
        });
      }
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

        // For pay-after-order, route through our tip-jar interstitial so
        // the customer picks a tip before Stripe. Payment-first keeps the
        // direct Stripe URL — there's no Order row yet to hang /pay off of.
        const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://ringbacksms.com').replace(/\/+$/, '');
        const payLink = context.orderId ? `${appBase}/pay/${context.orderId}` : url;
        await sendSms(tenantId, callerPhone, `Pay securely here: ${payLink}`);
        logger.info('Payment link sent', { tenantId, orderId: context.orderId ?? 'pending', sessionId });
      } catch (err) {
        logger.error('CREATE_PAYMENT_LINK failed', { tenantId, error: err });
        // Re-throw so the caller's critical-effect handler knows to
        // abort the chain and send a user-visible apology. Previously
        // we swallowed here, leaving the customer with a "you'll get a
        // link shortly" reply that never arrived.
        throw err;
      }
      break;
    }

    default:
      logger.warn('Unknown side effect type', { effect });
  }
}
