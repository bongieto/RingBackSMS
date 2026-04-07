import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess } from '@/lib/server/response';

export async function GET(request: NextRequest, { params }: { params: { tenantId: string } }) {
  const authResult = await verifyTenantAccess(params.tenantId);
  if (isNextResponse(authResult)) return authResult;

  const days = parseInt(new URL(request.url).searchParams.get('days') ?? '30', 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { tenantId } = params;
  // Current billing month usage (always from start of current month)
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [totalMissedCalls, totalConversations, totalOrders, totalMeetings, recentUsage, orderRevenue, monthlyUsage, dailyStats, contactCount] = await Promise.all([
    prisma.missedCall.count({ where: { tenantId, occurredAt: { gte: since } } }),
    prisma.conversation.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.order.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.meeting.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.usageLog.groupBy({ by: ['type'], where: { tenantId, createdAt: { gte: since } }, _count: { id: true } }),
    prisma.order.aggregate({ where: { tenantId, createdAt: { gte: since } }, _sum: { total: true } }),
    prisma.usageLog.groupBy({ by: ['type'], where: { tenantId, createdAt: { gte: monthStart } }, _count: { id: true } }),
    // Daily breakdown for trend charts
    prisma.$queryRaw<Array<{ date: Date; conversations: bigint }>>(Prisma.sql`
      SELECT
        DATE("createdAt") as date,
        COUNT(*)::bigint as conversations
      FROM "Conversation"
      WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${since}
      GROUP BY DATE("createdAt")
      ORDER BY date
    `).catch(() => [] as Array<{ date: Date; conversations: bigint }>),
    prisma.contact.count({ where: { tenantId } }),
  ]);
  const usage = Object.fromEntries(recentUsage.map((u) => [u.type, u._count.id]));
  const monthUsage = Object.fromEntries(monthlyUsage.map((u) => [u.type, u._count.id]));
  const revenue = Number(orderRevenue._sum.total ?? 0);

  // Build daily trend data
  const dailyTrend = dailyStats.map((d) => ({
    date: String(d.date).slice(0, 10),
    conversations: Number(d.conversations),
  }));

  return apiSuccess({
    period: { days, since },
    missedCalls: totalMissedCalls,
    conversations: totalConversations,
    orders: totalOrders,
    meetings: totalMeetings,
    revenue,
    usage,
    monthUsage,
    contactCount,
    dailyTrend,
  });
}
