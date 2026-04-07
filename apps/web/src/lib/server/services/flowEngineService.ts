import { runFlowEngine, TenantContext, detectEscalationIntent } from '@ringback/flow-engine';
import { FlowType, SideEffect } from '@ringback/shared-types';
import { getCallerState, setCallerState, isDuplicate } from './stateService';
import { createOrder } from './orderService';
import { createMeeting } from './schedulingService';
import { sendNotification } from './notificationService';
import { sendSms } from './twilioService';
import { createOrderPaymentSession } from './paymentService';
import { incrementSmsUsage } from './usageMeterService';
import { logger } from '../logger';
import { isWithinBusinessHours, getBusinessHoursDisplay } from '../businessHours';
import { prisma } from '../db';
import { encryptMessages, decryptMessages } from '../encryption';
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
  const currentState = await getCallerState(tenantId, callerPhone);
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

  // Load tenant context
  const tenant = await prisma.tenant.findUnique({
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
  });

  if (!tenant || !tenant.config) {
    logger.error('Tenant or config not found', { tenantId });
    return;
  }

  const tenantContext: TenantContext = {
    tenantId: tenant.id,
    tenantName: tenant.name,
    config: {
      ...tenant.config,
      businessDays: tenant.config.businessDays as number[],
      businessSchedule: tenant.config.businessSchedule as Record<string, { open: string; close: string }> | null | undefined,
      closedDates: tenant.config.closedDates as string[],
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
  const withinBusinessHours = isWithinBusinessHours({
    businessHoursStart: tenant.config.businessHoursStart,
    businessHoursEnd: tenant.config.businessHoursEnd,
    businessDays: tenant.config.businessDays as number[],
    businessSchedule: tenant.config.businessSchedule as Record<string, { open: string; close: string }> | null,
    closedDates: tenant.config.closedDates as string[],
    timezone: tenant.config.timezone,
  });

  // Run flow engine
  const result = await runFlowEngine({
    tenantContext,
    callerPhone,
    inboundMessage,
    currentState,
    aiApiKey: process.env.MINIMAX_API_KEY ?? '',
  });

  // Prepend after-hours notice if outside business hours
  if (!withinBusinessHours) {
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

  // Save next state
  await setCallerState({ ...result.nextState, dedupKey: messageSid });

  // Upsert conversation
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

    // Update state with conversation ID
    await setCallerState({ ...result.nextState, conversationId, dedupKey: messageSid });
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
  }

  // Process side effects (context passes data between effects, e.g. orderId from SAVE_ORDER to CREATE_PAYMENT_LINK)
  const sideEffectContext: Record<string, any> = {};
  for (const effect of result.sideEffects) {
    await processSideEffect(effect, tenantId, conversationId as string, callerPhone, sideEffectContext);
  }

  // Send SMS reply
  await sendSms(tenantId, callerPhone, result.smsReply);

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
    logger.error('Failed to upsert contact', { tenantId, callerPhone, error: err });
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
