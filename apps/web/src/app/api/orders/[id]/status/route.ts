import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { OrderStatus } from '@prisma/client';
import { getOrderById, updateOrderStatus } from '@/lib/server/services/orderService';
import { refundOrderPayment } from '@/lib/server/services/paymentService';
import { sendSms, sendSmsWithRetry } from '@/lib/server/services/twilioService';
import { looksEncrypted } from '@/lib/server/encryption';
import { sms as i18nSms } from '@/lib/server/i18n';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';
import { waitUntil } from '@/lib/server/waitUntil';

const STATUS_TRANSITIONS: Record<string, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY, OrderStatus.CANCELLED],
  READY: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://ringbacksms.com').replace(/\/+$/, '');
}

function buildStatusSms(
  status: OrderStatus,
  orderId: string,
  orderNumber: string,
  businessName: string,
  prepMins: number | null,
  customerName: string | null,
  lang: string | null | undefined,
): string | null {
  // Pull just the first name so "Rolando Cabral" becomes "Rolando" — keeps
  // SMS copy conversational and under the 160-char GSM limit.
  // Defensive: if the stored value happens to look like an AES blob (from
  // a prior bug), skip the greeting rather than text it to the customer.
  const safeName =
    customerName && !looksEncrypted(customerName) ? customerName : null;
  const firstName = safeName?.trim().split(/\s+/)[0];
  const trackerUrl = `${appUrl()}/o/${orderId}`;
  const receiptUrl = `${appUrl()}/r/${orderId}`;
  const vars = { firstName, orderNumber, businessName, prepMins, trackerUrl, receiptUrl };
  switch (status) {
    case OrderStatus.CONFIRMED:
      return prepMins
        ? i18nSms('statusConfirmedWithPrep', lang, vars)
        : i18nSms('statusConfirmed', lang, vars);
    case OrderStatus.PREPARING:
      return i18nSms('statusPreparing', lang, vars);
    case OrderStatus.READY:
      return i18nSms('statusReady', lang, vars);
    case OrderStatus.CANCELLED:
      return i18nSms('statusCancelled', lang, vars);
    default:
      return null;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { status, tenantId } = z
      .object({ status: z.nativeEnum(OrderStatus), tenantId: z.string().min(1) })
      .parse(await req.json());
    const authResult = await verifyTenantAccess(tenantId);
    if (isNextResponse(authResult)) return authResult;

    const order = await getOrderById(params.id, tenantId);
    if (!order) return apiError('Order not found', 404);
    const allowed = STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(status)) return apiError(`Cannot transition from ${order.status} to ${status}`, 400);
    const updated = await updateOrderStatus(params.id, tenantId, status);

    // If the operator cancelled a paid order, auto-issue a Stripe refund.
    // We fire this inside waitUntil so the KDS request returns fast; the
    // customer gets a follow-up SMS once the refund lands. Non-fatal — if
    // Stripe rejects (already refunded, expired, etc.) we log and leave
    // the operator to retry manually from the Stripe dashboard.
    const shouldRefund =
      status === OrderStatus.CANCELLED &&
      order.paymentStatus === 'PAID' &&
      !!order.stripePaymentId &&
      !order.stripeRefundId;

    // Fire-and-forget: send customer SMS notification on status change.
    // Look up the caller's stored preferredLanguage so the SMS lands in
    // the same language the agent's been speaking in.
    waitUntil(
      (async () => {
        try {
          const [tenant, contact] = await Promise.all([
            prisma.tenant.findUnique({
              where: { id: tenantId },
              select: { name: true, config: { select: { defaultPrepTimeMinutes: true } } },
            }),
            prisma.contact.findFirst({
              where: { tenantId, phone: order.callerPhone },
              select: { preferredLanguage: true },
            }),
          ]);
          if (!tenant) return;
          const sms = buildStatusSms(
            status,
            order.id,
            order.orderNumber,
            tenant.name,
            tenant.config?.defaultPrepTimeMinutes ?? null,
            order.customerName ?? null,
            contact?.preferredLanguage ?? null,
          );
          if (sms) {
            // Status transitions are time-sensitive (READY = "come pick
            // it up now"), so retry on transient Twilio failures.
            await sendSmsWithRetry(tenantId, order.callerPhone, sms, 2);
            logger.info('Order status SMS sent', { tenantId, orderId: order.id, status });
          }
        } catch (err) {
          logger.error('Failed to send order status SMS', { err, tenantId, orderId: order.id });
        }
      })()
    );

    // Review-prompt dispatch moved to /api/cron/review-prompts (runs
    // every 15 min). The previous setTimeout-in-waitUntil approach was
    // unreliable on Vercel — lambdas die before 2h. The cron picks up
    // any COMPLETED order older than 2h without an existing review.

    if (shouldRefund && order.stripePaymentId) {
      const stripePaymentId = order.stripePaymentId;
      waitUntil(
        (async () => {
          try {
            const refundId = await refundOrderPayment(stripePaymentId);
            await prisma.order.update({
              where: { id: order.id },
              data: { stripeRefundId: refundId, paymentStatus: 'REFUNDED' },
            });
            // Refund notifications are high-stakes — if Twilio drops the
            // first attempt, retry so the customer knows about the
            // refund. Without this, a silent drop means the customer
            // thinks they were charged without refund recourse.
            const contactLang = await prisma.contact
              .findFirst({
                where: { tenantId, phone: order.callerPhone },
                select: { preferredLanguage: true },
              })
              .then((c) => c?.preferredLanguage ?? null)
              .catch(() => null);
            await sendSmsWithRetry(
              tenantId,
              order.callerPhone,
              i18nSms('refundIssued', contactLang, { orderNumber: order.orderNumber }),
              2,
            );
            logger.info('Order refund issued', { tenantId, orderId: order.id, refundId });
          } catch (err: any) {
            logger.error('Order refund failed', {
              err: err?.message,
              tenantId,
              orderId: order.id,
              stripePaymentId,
            });
          }
        })()
      );
    }

    return apiSuccess(updated);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    return apiError('Internal server error', 500);
  }
}
