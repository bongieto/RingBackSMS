import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { apiSuccess, apiError } from '@/lib/server/response';
import { prisma } from '@/lib/server/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId required', 400);
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const reviews = await prisma.orderReview.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const orderIds = reviews.map((r) => r.orderId);
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: { id: true, orderNumber: true, customerName: true, total: true, createdAt: true },
  });
  const byId = new Map(orders.map((o) => [o.id, o]));

  const totalCount = reviews.length;
  const avg =
    totalCount === 0
      ? 0
      : reviews.reduce((s, r) => s + r.rating, 0) / totalCount;
  const distribution = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: reviews.filter((r) => r.rating === rating).length,
  }));

  return apiSuccess({
    totals: {
      count: totalCount,
      avg: Math.round(avg * 10) / 10,
      distribution,
    },
    rows: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      order: byId.get(r.orderId) ?? null,
    })),
  });
}
