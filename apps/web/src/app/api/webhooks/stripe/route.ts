import { NextRequest } from 'next/server';
import { constructStripeEvent, handleSubscriptionUpdated, handleSubscriptionDeleted } from '@/lib/server/services/billingService';
import { sendPaymentFailedEmail } from '@/lib/server/services/emailService';
import { sendSms } from '@/lib/server/services/twilioService';
import { createOrder } from '@/lib/server/services/orderService';
import { getCallerState, setCallerState } from '@/lib/server/services/stateService';
import { logger } from '@/lib/server/logger';
import { prisma } from '@/lib/server/db';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/server/rateLimit';
import Stripe from 'stripe';

export async function POST(request: NextRequest) {
  // Rate limit as belt-and-suspenders on top of signature verification
  const ip = getClientIp(request.headers);
  const rl = await checkRateLimit(`stripe:${ip}`, 120, 60);
  if (!rl.allowed) return rateLimitResponse(rl);

  const rawBody = Buffer.from(await request.arrayBuffer());
  const sig = request.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = constructStripeEvent(rawBody, sig);
  } catch (err) {
    logger.warn('Stripe webhook signature verification failed', { err });
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.created':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          const tenant = await prisma.tenant.findUnique({ where: { stripeCustomerId: customerId } });
          if (tenant) {
            sendPaymentFailedEmail(tenant.id).catch((err) =>
              logger.error('Failed to send payment failed email', { err, tenantId: tenant.id })
            );
          }
        }
        break;
      }
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        const tenantId = session.metadata?.tenantId;
        const callerPhone = session.metadata?.callerPhone;
        const paymentIntentId = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? session.id;

        if (orderId && tenantId) {
          // Pay-after-order flow: order already exists, just mark as paid
          await prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: 'PAID', stripePaymentId: paymentIntentId },
          });
          logger.info('Order payment completed', { orderId, tenantId });
          if (callerPhone) {
            const order = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
            sendSms(tenantId, callerPhone, `Payment received for order #${order?.orderNumber ?? ''}. Thank you!`).catch((err) =>
              logger.error('Failed to send payment confirmation SMS', { err, orderId })
            );
          }
        } else if (tenantId && callerPhone) {
          // Payment-first flow: create the order now
          const callerState = await getCallerState(tenantId, callerPhone);
          if (callerState?.paymentPending?.stripeSessionId === session.id && callerState.orderDraft) {
            const pickupTime = session.metadata?.pickupTime ?? callerState.paymentPending.pickupTime;
            const notes = session.metadata?.notes ?? callerState.paymentPending.notes;
            const total = callerState.orderDraft.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

            const order = await createOrder({
              tenantId,
              conversationId: callerState.conversationId!,
              callerPhone,
              items: callerState.orderDraft.items,
              total,
              pickupTime,
              notes,
              stripePaymentId: paymentIntentId,
              paymentStatus: 'PAID',
            });

            // Clear payment state, advance to ORDER_COMPLETE
            await setCallerState({
              ...callerState,
              flowStep: 'ORDER_COMPLETE',
              orderDraft: null,
              paymentPending: null,
              lastMessageAt: Date.now(),
            });

            logger.info('Payment-first order created', { orderId: order.id, tenantId });
            sendSms(tenantId, callerPhone, `Payment received! Order #${order.orderNumber} confirmed. Pickup: ${pickupTime}. See you soon!`).catch((err) =>
              logger.error('Failed to send payment confirmation SMS', { err, tenantId })
            );
          } else {
            logger.warn('checkout.session.completed: no matching paymentPending state', { tenantId, callerPhone, sessionId: session.id });
          }
        }
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        const tenantId = session.metadata?.tenantId;
        const callerPhone = session.metadata?.callerPhone;

        if (orderId) {
          // Pay-after-order: mark existing order as expired
          await prisma.order.update({
            where: { id: orderId },
            data: { paymentStatus: 'EXPIRED' },
          });
          logger.info('Checkout session expired', { orderId });
        } else if (tenantId && callerPhone) {
          // Payment-first: clear pending state, notify customer
          const callerState = await getCallerState(tenantId, callerPhone);
          if (callerState?.paymentPending?.stripeSessionId === session.id) {
            await setCallerState({
              ...callerState,
              flowStep: 'ORDER_COMPLETE',
              paymentPending: null,
              orderDraft: null,
              lastMessageAt: Date.now(),
            });
            sendSms(tenantId, callerPhone, 'Your payment link has expired. Text us to start a new order.').catch((err) =>
              logger.error('Failed to send expiry SMS', { err, tenantId })
            );
          }
          logger.info('Payment-first checkout expired', { tenantId, callerPhone });
        }
        break;
      }

      default:
        logger.debug('Unhandled Stripe event', { type: event.type });
    }
    return Response.json({ received: true });
  } catch (err) {
    logger.error('Stripe webhook error', { err, eventType: event.type });
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
