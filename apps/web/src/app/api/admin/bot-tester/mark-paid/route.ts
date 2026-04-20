import { NextRequest } from 'next/server';
import { requireBotTesterAdmin, isNextResponse } from '@/lib/server/auth';
import { apiSuccess, apiError } from '@/lib/server/response';
import { getCallerState, setCallerState } from '@/lib/server/services/stateService';
import { sms as i18nSms } from '@/lib/server/i18n';
import { prisma } from '@/lib/server/db';
import { encryptMessages, decryptMessages } from '@/lib/server/encryption';
import { logger } from '@/lib/server/logger';
import { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_SENTINEL =
  process.env.BOT_TESTER_SENTINEL_PHONE ?? '+19990000001';

/**
 * POST /api/admin/bot-tester/mark-paid
 * Body: { tenantId: string, callerPhone?: string }
 *
 * Simulates the Stripe `checkout.session.completed` webhook for the
 * most recent PENDING Order on the tester session. Mirrors the prod
 * webhook logic:
 *   - flip Order.paymentStatus PENDING → PAID (fake payment id)
 *   - advance CallerState flowStep → ORDER_COMPLETE, clear orderDraft
 *   - build the same confirmation SMS the webhook would have sent
 *   - append it to the Conversation (user-side: "[Simulated payment]")
 *   - return the reply + a SIMULATED_POS_PUSH descriptor so the UI can
 *     show what would have pushed to Square
 *
 * No real Stripe call, no real Twilio SMS, no real POS push.
 */
export async function POST(request: NextRequest) {
  const auth = await requireBotTesterAdmin();
  if (isNextResponse(auth)) return auth;

  let body: { tenantId?: unknown; callerPhone?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid JSON body', 400);
  }

  const tenantId = typeof body.tenantId === 'string' ? body.tenantId : '';
  const callerPhone =
    typeof body.callerPhone === 'string' && body.callerPhone.trim().length > 0
      ? body.callerPhone.trim()
      : DEFAULT_SENTINEL;
  if (!tenantId) return apiError('tenantId is required', 400);

  // Find the most recent PENDING order for this sentinel session.
  const pending = await prisma.order.findFirst({
    where: { tenantId, callerPhone, paymentStatus: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orderNumber: true,
      conversationId: true,
      items: true,
      total: true,
      tipAmount: true,
      customerName: true,
      pickupTime: true,
      squareOrderId: true,
    },
  });

  if (!pending) {
    return apiError(
      'No PENDING order to mark paid. Place an order first (e.g. "order: 1 #A1" → "yes confirm").',
      404,
    );
  }

  const fakePaymentIntent = `pi_test_${Date.now().toString(36)}`;

  await prisma.order.update({
    where: { id: pending.id },
    data: { paymentStatus: 'PAID', stripePaymentId: fakePaymentIntent },
  });

  // Advance caller state so the bot doesn't keep thinking the cart is live.
  const state = await getCallerState(tenantId, callerPhone);
  if (state) {
    await setCallerState({
      ...state,
      flowStep: 'ORDER_COMPLETE',
      orderDraft: null,
      paymentPending: null,
      lastMessageAt: Date.now(),
    });
  }

  // Build the same confirmation SMS the prod webhook would produce.
  const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://ringbacksms.com').replace(/\/+$/, '');
  const trackerUrl = `${appBase}/o/${pending.id}`;
  const contactLang = await prisma.contact
    .findFirst({
      where: { tenantId, phone: callerPhone },
      select: { preferredLanguage: true },
    })
    .then((c) => c?.preferredLanguage ?? null)
    .catch(() => null);
  const firstName = pending.customerName?.trim().split(/\s+/)[0];
  const reply = i18nSms('paymentReceivedTracker', contactLang, {
    firstName,
    orderNumber: pending.orderNumber,
    trackerUrl,
  });

  // Append synthetic user + bot messages to Conversation so the tester
  // transcript shows a complete flow.
  try {
    if (pending.conversationId) {
      const conv = await prisma.conversation.findUnique({
        where: { id: pending.conversationId },
        select: { messages: true },
      });
      const messages = decryptMessages(conv?.messages);
      const updated = [
        ...messages,
        {
          role: 'user',
          content: '[Simulated payment completed]',
          timestamp: new Date(),
          sender: 'customer',
        },
        { role: 'assistant', content: reply, timestamp: new Date(), sender: 'bot' },
      ];
      await prisma.conversation.update({
        where: { id: pending.conversationId },
        data: {
          messages: encryptMessages(updated) as unknown as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });
    }
  } catch (err) {
    logger.warn('Failed to append simulated-payment messages to conversation', { err });
  }

  // Describe what the prod webhook would have pushed to the POS. We
  // don't actually push — this is for the UI badge.
  const wouldPushPos = !pending.squareOrderId;
  const sideEffects = [
    {
      type: 'SIMULATE_PAYMENT',
      payload: {
        orderId: pending.id,
        orderNumber: pending.orderNumber,
        total: Number(pending.total),
        fakePaymentIntent,
      },
    },
    ...(wouldPushPos
      ? [
          {
            type: 'SIMULATE_POS_PUSH',
            payload: {
              orderId: pending.id,
              items: pending.items,
              totalCents: Math.round(
                (Number(pending.total) + Number(pending.tipAmount ?? 0)) * 100,
              ),
            },
          },
        ]
      : []),
  ];

  logger.info('Bot tester simulated payment', {
    tenantId,
    callerPhone,
    orderId: pending.id,
    orderNumber: pending.orderNumber,
  });

  return apiSuccess({
    reply,
    sideEffects,
    flowType: 'ORDER',
    flowStep: 'ORDER_COMPLETE',
    orderId: pending.id,
    orderNumber: pending.orderNumber,
    callerPhone,
  });
}
