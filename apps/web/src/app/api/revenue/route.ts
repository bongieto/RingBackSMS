import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { apiSuccess, apiError } from '@/lib/server/response';
import { prisma } from '@/lib/server/db';

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

  // We count every non-cancelled order, but only sum revenue on ones that
  // actually finalized (PAID or COMPLETED). Unpaid pending orders don't
  // count toward revenue — they'd double-count if the operator later
  // marks them paid.
  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      createdAt: { gte: since },
      status: { not: 'CANCELLED' },
    },
    select: {
      id: true,
      total: true,
      tipAmount: true,
      items: true,
      createdAt: true,
      status: true,
      paymentStatus: true,
    },
  });

  const revenueOrders = orders.filter(
    (o) => o.status === 'COMPLETED' || o.paymentStatus === 'PAID',
  );
  const totalRevenueCents = revenueOrders.reduce(
    (s, o) => s + Math.round(Number(o.total) * 100),
    0,
  );
  const totalTipCents = revenueOrders.reduce(
    (s, o) => s + Math.round(Number(o.tipAmount ?? 0) * 100),
    0,
  );
  const avgTicketCents = revenueOrders.length
    ? Math.round(totalRevenueCents / revenueOrders.length)
    : 0;

  // Daily series — iterate the windowed range so zero-days still render.
  const dayBuckets = new Map<string, { revenue: number; orders: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    dayBuckets.set(key, { revenue: 0, orders: 0 });
  }
  for (const o of revenueOrders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const bucket = dayBuckets.get(key);
    if (bucket) {
      bucket.revenue += Number(o.total);
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
  for (const o of revenueOrders) {
    const items = Array.isArray(o.items)
      ? (o.items as Array<{ name: string; quantity: number; price: number }>)
      : [];
    for (const it of items) {
      if (!it?.name) continue;
      const bucket = itemCounts.get(it.name) ?? { count: 0, revenue: 0 };
      bucket.count += it.quantity;
      bucket.revenue += it.price * it.quantity;
      itemCounts.set(it.name, bucket);
    }
  }
  const topItems = Array.from(itemCounts.entries())
    .map(([name, v]) => ({ name, count: v.count, revenueCents: Math.round(v.revenue * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Hour-of-day histogram — helps operators see peak demand.
  const hourBuckets: number[] = new Array(24).fill(0);
  for (const o of revenueOrders) {
    hourBuckets[o.createdAt.getHours()] += 1;
  }

  return apiSuccess({
    totals: {
      orders: revenueOrders.length,
      revenueCents: totalRevenueCents,
      tipCents: totalTipCents,
      avgTicketCents,
    },
    dailySeries,
    topItems,
    hourHistogram: hourBuckets.map((orders, hour) => ({ hour, orders })),
  });
}
