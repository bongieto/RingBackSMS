import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { pushOrderToPos } from '@/lib/server/services/orderService';
import { apiSuccess, apiError } from '@/lib/server/response';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';

/**
 * POST /api/integrations/[provider]/repush-order?tenantId=...
 * Body: { orderId: string }
 *
 * Manually re-pushes a paid order to the POS. Used to recover orders
 * that failed to push on the Stripe webhook (e.g. due to a transient
 * SDK error). Idempotent — Square ignores duplicate idempotencyKeys
 * and returns the same order id.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { provider: string } },
) {
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const body = await request.json().catch(() => ({}));
  const orderId = typeof body.orderId === 'string' ? body.orderId : null;
  if (!orderId) return apiError('orderId is required', 400);

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    select: {
      id: true,
      conversationId: true,
      items: true,
      total: true,
      tipAmount: true,
      stripePaymentId: true,
      customerName: true,
      pickupTime: true,
      squareOrderId: true,
    },
  });
  if (!order) return apiError('Order not found', 404);

  if (order.squareOrderId) {
    return apiSuccess({ alreadyPushed: true, squareOrderId: order.squareOrderId });
  }

  const items = Array.isArray(order.items)
    ? (order.items as Array<{ menuItemId: string; name: string; quantity: number; price: number }>)
    : [];

  const totalCents = Math.round(
    (Number(order.total) + Number(order.tipAmount ?? 0)) * 100,
  );

  try {
    await pushOrderToPos(order.id, tenantId, order.conversationId, items, {
      totalCents,
      externalSource: 'Stripe',
      externalSourceId: order.stripePaymentId ?? undefined,
      customerName: order.customerName ?? null,
      pickupTime: order.pickupTime ?? null,
    });

    const updated = await prisma.order.findUnique({
      where: { id: orderId },
      select: { squareOrderId: true },
    });

    logger.info('Manual POS repush succeeded', { orderId, tenantId, squareOrderId: updated?.squareOrderId });
    return apiSuccess({ repushed: true, squareOrderId: updated?.squareOrderId });
  } catch (err: any) {
    logger.error('Manual POS repush failed', { orderId, tenantId, err: err?.message });
    return apiError(`POS push failed: ${err?.message ?? 'unknown error'}`, 500);
  }
}
