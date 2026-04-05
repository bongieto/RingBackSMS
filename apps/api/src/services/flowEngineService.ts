import { PrismaClient } from '@prisma/client';
import { runFlowEngine, TenantContext } from '@ringback/flow-engine';
import { FlowType } from '@ringback/shared-types';
import { getCallerState, setCallerState, isDuplicate } from './stateService';
import { createOrder } from './orderService';
import { createMeeting } from './schedulingService';
import { sendNotification } from './notificationService';
import { sendSms } from './twilioService';
import { incrementSmsUsage } from '../middleware/usageMeter';
import { logger } from '../utils/logger';
import { isWithinBusinessHours, getBusinessHoursDisplay } from '../utils/businessHours';
import { SideEffect } from '@ringback/shared-types';

const prisma = new PrismaClient();

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

  // Load tenant context
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      config: true,
      flows: { where: { isEnabled: true } },
      menuItems: { where: { isAvailable: true } },
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
    })),
  };

  // Check after-hours
  const withinBusinessHours = isWithinBusinessHours({
    businessHoursStart: tenant.config.businessHoursStart,
    businessHoursEnd: tenant.config.businessHoursEnd,
    businessDays: tenant.config.businessDays as number[],
    timezone: tenant.config.timezone,
  });

  // Get current caller state
  const currentState = await getCallerState(tenantId, callerPhone);

  // Run flow engine
  const result = await runFlowEngine({
    tenantContext,
    callerPhone,
    inboundMessage,
    currentState,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  });

  // Prepend after-hours notice if outside business hours
  if (!withinBusinessHours) {
    const hoursDisplay = getBusinessHoursDisplay({
      businessHoursStart: tenant.config.businessHoursStart,
      businessHoursEnd: tenant.config.businessHoursEnd,
      businessDays: tenant.config.businessDays as number[],
      timezone: tenant.config.timezone,
    });
    const afterHoursNotice = `Thanks for reaching out! We're currently closed. Our hours are ${hoursDisplay}. We'll get back to you when we open. In the meantime, feel free to text us your question!`;
    result.smsReply = `${afterHoursNotice}\n\n${result.smsReply}`;
  }

  // Save next state
  await setCallerState({ ...result.nextState, dedupKey: messageSid });

  // Upsert conversation
  let conversationId: string | null = currentState?.conversationId ?? null;
  if (!conversationId) {
    const conversation = await prisma.conversation.create({
      data: {
        tenantId,
        callerPhone,
        flowType: result.flowType,
        messages: [
          { role: 'user', content: inboundMessage, timestamp: new Date() },
          { role: 'assistant', content: result.smsReply, timestamp: new Date() },
        ],
        isActive: true,
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

    const messages = Array.isArray(existing?.messages) ? existing.messages : [];
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        messages: [
          ...messages,
          { role: 'user', content: inboundMessage, timestamp: new Date() },
          { role: 'assistant', content: result.smsReply, timestamp: new Date() },
        ],
        flowType: result.flowType,
        updatedAt: new Date(),
      },
    });
  }

  // Process side effects
  for (const effect of result.sideEffects) {
    await processSideEffect(effect, tenantId, conversationId as string, callerPhone);
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
  callerPhone: string
): Promise<void> {
  switch (effect.type) {
    case 'SAVE_ORDER':
      await createOrder({
        tenantId,
        conversationId,
        callerPhone,
        items: effect.payload.items,
        total: effect.payload.total,
        pickupTime: effect.payload.pickupTime,
        notes: effect.payload.notes,
      });
      break;

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

    case 'CREATE_SQUARE_ORDER':
      // Square order creation is handled async after order is saved
      logger.info('CREATE_SQUARE_ORDER side effect — deferring to Square service', { tenantId });
      break;

    default:
      logger.warn('Unknown side effect type', { effect });
  }
}
