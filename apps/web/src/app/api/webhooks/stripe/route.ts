import { NextRequest } from 'next/server';
import { constructStripeEvent, handleSubscriptionUpdated, handleSubscriptionDeleted } from '@/lib/server/services/billingService';
import { sendPaymentFailedEmail } from '@/lib/server/services/emailService';
import { sendSms } from '@/lib/server/services/twilioService';
import { createOrder, pushOrderToPos } from '@/lib/server/services/orderService';
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

  // Idempotency: Stripe guarantees at-least-once delivery, and their
  // Dashboard has a manual "Resend" button. Replaying a checkout event
  // without dedup would create duplicate Order rows + re-send "Payment
  // received!" SMS. Check a processed-events log before handling.
  try {
    await prisma.webhookEventLog.create({
      data: { id: event.id, provider: 'stripe', eventType: event.type },
    });
  } catch (err: any) {
    // P2002 = unique constraint violation → we've processed this event already
    if (err?.code === 'P2002') {
      logger.info('Duplicate Stripe webhook event, skipping', { eventId: event.id, type: event.type });
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Any other DB error: log but continue (better to process than lose events)
    logger.warn('WebhookEventLog insert failed, proceeding anyway', { eventId: event.id, err: err?.message });
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
                patch.nameSearchHash = hashForSearch(customerName, tenantId);
              }
              if (!existing.email && customerEmail) {
                patch.email = encryptNullable(customerEmail);
                patch.emailSearchHash = hashForSearch(customerEmail, tenantId);
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
          // Pay-after-order flow: order already exists, just mark as paid.
          // If the /pay interstitial set a tip, metadata.tipAmount is the
          // authoritative value — persist it here so reports and receipts
          // reflect exactly what the customer paid.
          const tipFromMeta = session.metadata?.tipAmount
            ? Number(session.metadata.tipAmount)
            : null;
          const paidOrder = await prisma.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: 'PAID',
              stripePaymentId: paymentIntentId,
              ...(tipFromMeta != null && tipFromMeta > 0 ? { tipAmount: tipFromMeta } : {}),
            },
            select: {
              id: true,
              conversationId: true,
              items: true,
              total: true,
              tipAmount: true,
              customerName: true,
              squareOrderId: true,
            },
          });
          logger.info('Order payment completed', { orderId, tenantId });

          // Push to POS now that payment is confirmed. Skipped at
          // createOrder time for PENDING orders. If the order was
          // previously pushed (e.g. resubmitted), the adapter's
          // idempotencyKey + presence of squareOrderId guards against
          // double-push — Square will just return the same order.
          if (!paidOrder.squareOrderId) {
            const items = Array.isArray(paidOrder.items)
              ? (paidOrder.items as unknown as Array<{
                  menuItemId: string;
                  name: string;
                  quantity: number;
                  price: number;
                }>)
              : [];
            const totalCents = Math.round(
              (Number(paidOrder.total) + Number(paidOrder.tipAmount ?? 0)) * 100,
            );
            pushOrderToPos(paidOrder.id, tenantId, paidOrder.conversationId, items, {
              totalCents,
              externalSource: 'Stripe',
              externalSourceId: paymentIntentId,
              customerName: paidOrder.customerName ?? null,
            }).catch((err) =>
              logger.error('POS push after payment failed', { err, orderId }),
            );
          }
          if (callerPhone) {
            const order = await prisma.order.findUnique({
              where: { id: orderId },
              select: { orderNumber: true, customerName: true },
            });
            const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://ringbacksms.com').replace(/\/+$/, '');
            const trackerUrl = `${appBase}/o/${orderId}`;
            const firstName = order?.customerName?.trim().split(/\s+/)[0];
            const greet = firstName ? `Hi ${firstName}! ` : '';
            sendSms(tenantId, callerPhone, `${greet}Payment received for order #${order?.orderNumber ?? ''}. Thanks! Track it: ${trackerUrl}`).catch((err) =>
              logger.error('Failed to send payment confirmation SMS', { err, orderId })
            );
          }
        } else if (tenantId && callerPhone) {
          // Payment-first flow: create the order now
          const callerState = await getCallerState(tenantId, callerPhone);
          if (callerState?.paymentPending?.stripeSessionId === session.id && callerState.orderDraft) {
            const pickupTime = session.metadata?.pickupTime ?? callerState.paymentPending.pickupTime;
            const notes = session.metadata?.notes ?? callerState.paymentPending.notes;
            // Prefer the breakdown we stashed in session metadata when the
            // checkout was created. Fall back to recomputing items-only
            // subtotal for older sessions without metadata.
            const parseDollars = (v?: string) => (v ? Number(v) : undefined);
            const subtotalMeta = parseDollars(session.metadata?.subtotal);
            const taxMeta = parseDollars(session.metadata?.taxAmount);
            const feeMeta = parseDollars(session.metadata?.feeAmount);
            const totalMeta = parseDollars(session.metadata?.total);
            const itemsSubtotal = callerState.orderDraft.items.reduce(
              (sum, item) => sum + item.price * item.quantity,
              0,
            );
            const total = totalMeta ?? itemsSubtotal;

            const order = await createOrder({
              tenantId,
              conversationId: callerState.conversationId!,
              callerPhone,
              items: callerState.orderDraft.items,
              total,
              subtotal: subtotalMeta ?? itemsSubtotal,
              taxAmount: taxMeta ?? 0,
              feeAmount: feeMeta ?? 0,
              pickupTime,
              notes,
              customerName:
                (callerState as { customerName?: string | null }).customerName ?? null,
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
            const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://ringbacksms.com').replace(/\/+$/, '');
            const trackerUrl = `${appBase}/o/${order.id}`;
            const firstName = order.customerName?.trim().split(/\s+/)[0];
            const greet = firstName ? `Hi ${firstName}! ` : '';
            sendSms(tenantId, callerPhone, `${greet}Payment received! Order #${order.orderNumber} confirmed. Pickup: ${pickupTime}. Track: ${trackerUrl}`).catch((err) =>
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
