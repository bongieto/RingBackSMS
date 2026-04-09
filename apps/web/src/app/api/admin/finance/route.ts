import { isSuperAdmin } from '@/lib/server/agency';
import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { PLAN_MRR } from '@/lib/server/planPricing';


export async function GET(_request: NextRequest) {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // Get all active tenants with their plans
  const [activeTenants, allTenants, newThisMonth, lostThisMonth, smsLast30, ordersLast30, planBreakdown] = await Promise.all([
    prisma.tenant.findMany({
      where: { isActive: true },
      select: { plan: true, createdAt: true, stripeSubscriptionId: true },
    }),
    prisma.tenant.count(),
    prisma.tenant.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.tenant.count({ where: { isActive: false, updatedAt: { gte: thirtyDaysAgo } } }),
    prisma.usageLog.count({ where: { type: 'SMS_SENT', createdAt: { gte: thirtyDaysAgo } } }),
    prisma.order.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.tenant.groupBy({
      by: ['plan'],
      where: { isActive: true },
      _count: { plan: true },
    }),
  ]);

  // Calculate MRR
  const mrr = activeTenants.reduce((sum, t) => sum + (PLAN_MRR[t.plan] ?? 0), 0);
  const arr = mrr * 12;

  // Revenue by plan
  const revenueByPlan = planBreakdown.map((p) => ({
    plan: p.plan,
    count: p._count.plan,
    mrr: p._count.plan * (PLAN_MRR[p.plan] ?? 0),
  }));

  // Paying customers (non-STARTER active)
  const payingCustomers = activeTenants.filter((t) => t.plan !== 'STARTER').length;
  const freeCustomers = activeTenants.filter((t) => t.plan === 'STARTER').length;

  // New MRR from tenants added this month
  const newMrr = activeTenants
    .filter((t) => new Date(t.createdAt) >= thirtyDaysAgo)
    .reduce((sum, t) => sum + (PLAN_MRR[t.plan] ?? 0), 0);

  // Month-over-month revenue from last period
  const prevPeriodTenants = await prisma.tenant.findMany({
    where: { isActive: true, createdAt: { lt: thirtyDaysAgo } },
    select: { plan: true },
  });
  const prevMrr = prevPeriodTenants.reduce((sum, t) => sum + (PLAN_MRR[t.plan] ?? 0), 0);
  const mrrGrowth = prevMrr > 0 ? Math.round(((mrr - prevMrr) / prevMrr) * 100) : 0;

  // Monthly revenue trend (last 6 months, estimated from tenant createdAt)
  const monthlyTrend: Array<{ month: string; mrr: number; tenants: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const monthTenants = await prisma.tenant.findMany({
      where: { createdAt: { lte: end }, OR: [{ isActive: true }, { updatedAt: { gte: end } }] },
      select: { plan: true, isActive: true, createdAt: true },
    });
    const monthMrr = monthTenants.reduce((sum, t) => sum + (PLAN_MRR[t.plan] ?? 0), 0);
    monthlyTrend.push({
      month: start.toLocaleString('default', { month: 'short', year: '2-digit' }),
      mrr: monthMrr,
      tenants: monthTenants.length,
    });
  }

  return apiSuccess({
    mrr,
    arr,
    mrrGrowth,
    newMrr,
    revenueByPlan,
    payingCustomers,
    freeCustomers,
    totalActive: activeTenants.length,
    totalTenants: allTenants,
    newThisMonth,
    lostThisMonth,
    smsLast30Days: smsLast30,
    ordersLast30Days: ordersLast30,
    monthlyTrend,
    planPricing: PLAN_MRR,
    note: 'MRR is estimated based on plan prices. Connect Stripe for live revenue data.',
  });
}
