import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { OrderStatus } from '@prisma/client';
import { getOrderById, updateOrderStatus } from '@/lib/server/services/orderService';
import { refundOrderPayment } from '@/lib/server/services/paymentService';
import { sendSms } from '@/lib/server/services/twilioService';
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
): string | null {
  // Pull just the first name so "Rolando Cabral" becomes "Rolando" — keeps
  // SMS copy conversational and under the 160-char GSM limit.
  const firstName = customerName?.trim().split(/\s+/)[0];
  const greet = firstName ? `Hi ${firstName}! ` : '';
  const trackerUrl = `${appUrl()}/o/${orderId}`;
  const receiptUrl = `${appUrl()}/r/${orderId}`;
  switch (status) {
    case OrderStatus.CONFIRMED:
      return prepMins
        ? `${greet}${businessName} got your order #${orderNumber}. Ready in ~${prepMins} min. Track it: ${trackerUrl}`
        : `${greet}${businessName} got your order #${orderNumber}. Track it: ${trackerUrl}`;
    case OrderStatus.PREPARING:
      return `${greet}${businessName} is preparing your order #${orderNumber} now!`;
    case OrderStatus.READY:
      return `${greet}Your order #${orderNumber} from ${businessName} is READY for pickup! Receipt: ${receiptUrl}`;
    case OrderStatus.CANCELLED:
      return `${greet}Sorry — your order #${orderNumber} from ${businessName} has been cancelled. Please call us if you have questions.`;
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

    // Fire-and-forget: send customer SMS notification on status change
    waitUntil(
      (async () => {
        try {
          const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true, config: { select: { defaultPrepTimeMinutes: true } } },
          });
          if (!tenant) return;
          const sms = buildStatusSms(
            status,
            order.id,
            order.orderNumber,
            tenant.name,
            tenant.config?.defaultPrepTimeMinutes ?? null,
            order.customerName ?? null,
          );
          if (sms) {
            await sendSms(tenantId, order.callerPhone, sms);
            logger.info('Order status SMS sent', { tenantId, orderId: order.id, status });
          }
        } catch (err) {
          logger.error('Failed to send order status SMS', { err, tenantId, orderId: order.id });
        }
      })()
    );

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
            await sendSms(
              tenantId,
              order.callerPhone,
              `A refund has been issued for order #${order.orderNumber}. It may take 5-10 days to appear on your card.`,
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
