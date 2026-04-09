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
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (!customerId) break;
        const tenant = await prisma.tenant.findUnique({
          where: { stripeCustomerId: customerId },
          select: { id: true, agencyId: true },
        });
        if (!tenant?.agencyId) break;

        // Idempotent on stripeInvoiceId (unique index). Stripe retries
        // webhooks; a duplicate insert throws P2002 which we swallow.
        const agency = await prisma.agency.findUnique({
          where: { id: tenant.agencyId },
          select: { defaultRevSharePct: true },
        });
        if (!agency) break;
        const pct = Number(agency.defaultRevSharePct);
        const amountCents = invoice.amount_paid ?? 0;
        if (amountCents <= 0 || pct <= 0) break;
        const commissionCents = Math.floor((amountCents * pct) / 100);

        try {
          await prisma.commissionLedger.create({
            data: {
              agencyId: tenant.agencyId,
              tenantId: tenant.id,
              stripeInvoiceId: invoice.id,
              invoiceAmountCents: amountCents,
              commissionPct: pct,
              commissionAmountCents: commissionCents,
              currency: invoice.currency ?? 'usd',
              status: 'PENDING',
            },
          });
          logger.info('Agency commission accrued', {
            agencyId: tenant.agencyId,
            tenantId: tenant.id,
            commissionCents,
          });
        } catch (err: any) {
          if (err?.code === 'P2002') {
            logger.info('Duplicate invoice, commission already accrued', {
              stripeInvoiceId: invoice.id,
            });
          } else {
            throw err;
          }
        }
        break;
      }
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

        // Enrich the Contact with whatever Stripe knows about this customer.
        // Only fills blank fields so we never clobber manually-edited data.
        if (tenantId && callerPhone) {
          const stripeCustomerId = typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id ?? null;
          const customerEmail = session.customer_details?.email ?? null;
          const customerName = session.customer_details?.name ?? null;

          try {
            const existing = await prisma.contact.findFirst({
              where: { tenantId, phone: callerPhone },
              select: { id: true, name: true, email: true, stripeCustomerId: true },
            });
            if (existing) {
              const { encryptNullable, hashForSearch } = await import('@/lib/server/encryption');
              const patch: {
                name?: string | null;
                email?: string | null;
                nameSearchHash?: string | null;
                emailSearchHash?: string | null;
                stripeCustomerId?: string;
              } = {};
              if (!existing.name && customerName) {
                patch.name = encryptNullable(customerName);
                patch.nameSearchHash = hashForSearch(customerName);
              }
              if (!existing.email && customerEmail) {
                patch.email = encryptNullable(customerEmail);
                patch.emailSearchHash = hashForSearch(customerEmail);
              }
              if (!existing.stripeCustomerId && stripeCustomerId) patch.stripeCustomerId = stripeCustomerId;
              if (Object.keys(patch).length > 0) {
                await prisma.contact.update({ where: { id: existing.id }, data: patch });
                logger.info('Contact enriched from Stripe checkout', {
                  tenantId,
                  contactId: existing.id,
                  filled: Object.keys(patch),
                });
              }
            }
          } catch (err) {
            logger.warn('Contact enrichment from Stripe failed', { err, tenantId });
          }
        }

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
