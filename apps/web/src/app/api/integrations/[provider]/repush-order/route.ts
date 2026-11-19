import { NextRequest } from 'next/server';
import { TenantMemberRole } from '@prisma/client';
import { requireTenantRole, isNextResponse } from '@/lib/server/auth';
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
  { params: _params }: { params: { provider: string } },
) {
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  const authResult = await requireTenantRole(tenantId, [
    TenantMemberRole.OWNER,
    TenantMemberRole.MANAGER,
  ]);
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
      taxAmount: true,
      feeAmount: true,
      stripePaymentId: true,
      customerName: true,
      pickupTime: true,
      squareOrderId: true,
      tenant: { select: { config: { select: { timezone: true } } } },
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
  // Mirror the Stripe webhook's push exactly. Without tax / fee / tip the
  // adapter builds a Square order for the items subtotal only, so the
  // recovered order under-reports tax and drops the tip.
  const taxCents = Math.round(Number(order.taxAmount ?? 0) * 100);
  const feeCents = Math.round(Number(order.feeAmount ?? 0) * 100);
  const tipCents = Math.round(Number(order.tipAmount ?? 0) * 100);

  try {
    await pushOrderToPos(order.id, tenantId, order.conversationId, items, {
      totalCents,
      taxCents: taxCents > 0 ? taxCents : undefined,
      feeCents: feeCents > 0 ? feeCents : undefined,
      tipCents: tipCents > 0 ? tipCents : undefined,
      externalSource: 'Stripe',
      externalSourceId: order.stripePaymentId ?? undefined,
      customerName: order.customerName ?? null,
      pickupTime: order.pickupTime ?? null,
      tenantTimezone: order.tenant?.config?.timezone ?? null,
    });

    const updated = await prisma.order.findUnique({
      where: { id: orderId },
      select: { squareOrderId: true },
    });

    // pushOrderToPos returns quietly when it skips (no POS connected, or no
    // item linked to the POS catalog). Don't report that as a success.
    if (!updated?.squareOrderId) {
      logger.warn('Manual POS repush skipped — order still has no POS id', { orderId, tenantId });
      return apiError(
        'Order was not sent to the POS. Check that the POS is connected and every item is linked to the POS catalog.',
        422,
      );
    }

    logger.info('Manual POS repush succeeded', { orderId, tenantId, squareOrderId: updated?.squareOrderId });
    return apiSuccess({ repushed: true, squareOrderId: updated?.squareOrderId });
  } catch (err: any) {
    logger.error('Manual POS repush failed', { orderId, tenantId, err: err?.message });
    return apiError(`POS push failed: ${err?.message ?? 'unknown error'}`, 500);
  }
}
