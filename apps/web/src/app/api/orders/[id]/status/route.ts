import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { OrderStatus } from '@prisma/client';
import { getOrderById, updateOrderStatus } from '@/lib/server/services/orderService';
import { sendSms } from '@/lib/server/services/twilioService';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';

const STATUS_TRANSITIONS: Record<string, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY, OrderStatus.CANCELLED],
  READY: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

function buildStatusSms(
  status: OrderStatus,
  orderNumber: string,
  businessName: string,
  prepMins: number | null,
): string | null {
  switch (status) {
    case OrderStatus.CONFIRMED:
      return prepMins
        ? `${businessName} got your order #${orderNumber}! Estimated ready in ~${prepMins} min.`
        : `${businessName} got your order #${orderNumber}! We'll let you know when it's ready.`;
    case OrderStatus.PREPARING:
      return `${businessName} is preparing your order #${orderNumber} now!`;
    case OrderStatus.READY:
      return `Your order #${orderNumber} from ${businessName} is READY for pickup!`;
    case OrderStatus.CANCELLED:
      return `Sorry, your order #${orderNumber} from ${businessName} has been cancelled. Please call us if you have questions.`;
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

    // Fire-and-forget: send customer SMS notification on status change
    (async () => {
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, config: { select: { defaultPrepTimeMinutes: true } } },
        });
        if (!tenant) return;
        const sms = buildStatusSms(
          status,
          order.orderNumber,
          tenant.name,
          tenant.config?.defaultPrepTimeMinutes ?? null,
        );
        if (sms) {
          await sendSms(tenantId, order.callerPhone, sms);
          logger.info('Order status SMS sent', { tenantId, orderId: order.id, status });
        }
      } catch (err) {
        logger.error('Failed to send order status SMS', { err, tenantId, orderId: order.id });
      }
    })();

    return apiSuccess(updated);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    return apiError('Internal server error', 500);
  }
}
