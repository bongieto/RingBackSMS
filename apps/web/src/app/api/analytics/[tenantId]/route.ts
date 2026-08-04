import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess } from '@/lib/server/response';

const EMERGENCY_TERMS = [
  '911',
  'emergency',
  'urgent',
  'gas',
  'leak',
  'fire',
  'smoke',
  'fell',
  'fall',
  'injury',
  'danger',
  'burst',
  'flood',
  'carbon monoxide',
  'chest pain',
];

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

  const [
    totalMissedCalls,
    totalConversations,
    totalOrders,
    totalMeetings,
    recentUsage,
    orderRevenue,
    monthlyUsage,
    dailyStats,
    contactCount,
    missedCallsRecovered,
    appointmentsBooked,
    ordersPlaced,
    estimatedRevenue,
    quoteRequestRows,
    emergenciesEscalated,
    unresolvedUrgentLeads,
    avgResponseRows,
  ] = await Promise.all([
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
    prisma.missedCall.count({
      where: { tenantId, occurredAt: { gte: since }, smsSent: true },
    }),
    prisma.meeting.count({
      where: { tenantId, createdAt: { gte: since }, status: { not: 'CANCELLED' } },
    }),
    prisma.order.count({
      where: { tenantId, createdAt: { gte: since }, status: { not: 'CANCELLED' } },
    }),
    prisma.order.aggregate({
      where: { tenantId, createdAt: { gte: since }, status: { not: 'CANCELLED' } },
      _sum: { total: true },
    }),
    // quoteRequestsCaptured: Conversation.messages is AES-GCM encrypted at
    // rest, so the old ILIKE '%quote%' scan could never match — it full-
    // scanned every conversation row on each analytics load and always
    // returned 0. Report 0 without the scan until the metric is tracked
    // properly (e.g. a flag written by the flow engine at message time).
    Promise.resolve([{ count: 0 }] as Array<{ count: number }>),
    prisma.escalationEvent.count({
      where: {
        tenantId,
        createdAt: { gte: since },
        OR: EMERGENCY_TERMS.flatMap((term) => [
          { triggerKeyword: { contains: term, mode: 'insensitive' as const } },
          { messageBody: { contains: term, mode: 'insensitive' as const } },
        ]),
      },
    }),
    prisma.task.count({
      where: {
        tenantId,
        status: { in: ['OPEN', 'SNOOZED'] },
        priority: { in: ['URGENT', 'HIGH'] },
      },
    }),
    prisma.$queryRaw<Array<{ avg: number | null }>>(Prisma.sql`
      SELECT AVG(EXTRACT(EPOCH FROM ("ownerRespondedAt" - "occurredAt")))::float AS avg
      FROM "MissedCall"
      WHERE "tenantId" = ${tenantId}
        AND "occurredAt" >= ${since}
        AND "ownerRespondedAt" IS NOT NULL
    `).catch(() => [{ avg: null }]),
  ]);
  const usage = Object.fromEntries(recentUsage.map((u) => [u.type, u._count.id]));
  const monthUsage = Object.fromEntries(monthlyUsage.map((u) => [u.type, u._count.id]));
  const revenue = Number(orderRevenue._sum.total ?? 0);
  const estimatedRevenueDollars = Number(estimatedRevenue._sum.total ?? 0);
  const avgResponseTimeSeconds = Math.round(avgResponseRows[0]?.avg ?? 0);

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
    valueMetrics: {
      missedCallsRecovered,
      appointmentsBooked,
      quoteRequestsCaptured: quoteRequestRows[0]?.count ?? 0,
      emergenciesEscalated,
      ordersPlaced,
      estimatedRevenueDollars,
      avgResponseTimeSeconds,
      unresolvedUrgentLeads,
    },
  });
}
