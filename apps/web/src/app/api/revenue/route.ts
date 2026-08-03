import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { apiSuccess, apiError } from '@/lib/server/response';
import { prisma } from '@/lib/server/db';
import { isRecognizedRevenue } from '@/lib/server/commerce/financialProjection';

/**
 * Revenue dashboard data: PAID-or-completed orders across a windowed
 * period, aggregated into daily series, top items, hour-of-day histogram,
 * and headline totals. Scoped to a tenant via verifyTenantAccess.
 *
 * Query:   /api/revenue?tenantId=...&days=30
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId required', 400);
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const days = Math.min(365, Math.max(1, parseInt(searchParams.get('days') ?? '30', 10) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [orders, externalSales] = await Promise.all([
    prisma.order.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
        financialOwner: 'ringbacksms',
        paymentStatus: { in: ['PAID', 'REFUNDED'] },
      },
      select: { total: true, tipAmount: true, items: true, createdAt: true, paymentStatus: true },
    }),
    prisma.externalSale.findMany({
      where: {
        tenantId,
        occurredAt: { gte: since },
        status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
      },
      select: {
        grossCents: true,
        refundCents: true,
        netCents: true,
        tipCents: true,
        items: true,
        occurredAt: true,
        status: true,
      },
    }),
  ]);

  const revenueOrders = orders.map((order) => {
    const grossCents = Math.round(Number(order.total) * 100);
    const refundCents = order.paymentStatus === 'REFUNDED' ? grossCents : 0;
    return {
      grossCents,
      refundCents,
      netCents: grossCents - refundCents,
      tipCents: Math.round(Number(order.tipAmount ?? 0) * 100),
      items: order.items,
      occurredAt: order.createdAt,
    };
  });
  const projectedSales = externalSales.filter((sale) => isRecognizedRevenue(sale.status));
  const allSales = [
    ...revenueOrders,
    ...projectedSales.map((sale) => ({
      grossCents: sale.grossCents,
      refundCents: sale.refundCents,
      netCents: sale.netCents,
      tipCents: sale.tipCents,
      items: sale.items,
      occurredAt: sale.occurredAt,
    })),
  ];
  const totalGrossCents = allSales.reduce((sum, sale) => sum + sale.grossCents, 0);
  const totalRefundCents = allSales.reduce((sum, sale) => sum + sale.refundCents, 0);
  const totalRevenueCents = allSales.reduce((sum, sale) => sum + sale.netCents, 0);
  const totalTipCents = allSales.reduce((sum, sale) => sum + sale.tipCents, 0);
  const avgTicketCents = allSales.length ? Math.round(totalRevenueCents / allSales.length) : 0;

  // Daily series — iterate the windowed range so zero-days still render.
  const dayBuckets = new Map<string, { revenue: number; orders: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    dayBuckets.set(key, { revenue: 0, orders: 0 });
  }
  for (const sale of allSales) {
    const key = sale.occurredAt.toISOString().slice(0, 10);
    const bucket = dayBuckets.get(key);
    if (bucket) {
      bucket.revenue += sale.netCents / 100;
      bucket.orders += 1;
    }
  }
  const dailySeries = Array.from(dayBuckets.entries()).map(([date, v]) => ({
    date,
    revenueCents: Math.round(v.revenue * 100),
    orders: v.orders,
  }));

  // Top items by count across revenue orders. items JSON is an array of
  // { name, quantity, price } — sum by name.
  const itemCounts = new Map<string, { count: number; revenue: number }>();
  for (const sale of allSales) {
    if (sale.netCents <= 0) continue;
    const items = Array.isArray(sale.items)
      ? (sale.items as Array<{
          name: string;
          quantity: number;
          price?: number;
          netCents?: number;
        }>)
      : [];
    for (const it of items) {
      if (!it?.name) continue;
      const bucket = itemCounts.get(it.name) ?? { count: 0, revenue: 0 };
      bucket.count += it.quantity;
      bucket.revenue +=
        typeof it.netCents === 'number' ? it.netCents / 100 : Number(it.price ?? 0) * it.quantity;
      itemCounts.set(it.name, bucket);
    }
  }
  const topItems = Array.from(itemCounts.entries())
    .map(([name, v]) => ({ name, count: v.count, revenueCents: Math.round(v.revenue * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Hour-of-day histogram — helps operators see peak demand.
  const hourBuckets: number[] = new Array(24).fill(0);
  for (const sale of allSales) {
    hourBuckets[sale.occurredAt.getHours()] += 1;
  }

  return apiSuccess({
    totals: {
      orders: allSales.length,
      grossCents: totalGrossCents,
      refundCents: totalRefundCents,
      netCents: totalRevenueCents,
      revenueCents: totalRevenueCents,
      tipCents: totalTipCents,
      avgTicketCents,
    },
    dailySeries,
    topItems,
    hourHistogram: hourBuckets.map((orders, hour) => ({ hour, orders })),
  });
}
