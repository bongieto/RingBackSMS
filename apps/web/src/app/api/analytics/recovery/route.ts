import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

/**
 * GET /api/analytics/recovery?tenantId=...&from=ISO&to=ISO
 *
 * Returns the missed-call recovery funnel for the requested window:
 * missed → SMS sent → caller replied → owner responded → order/booking.
 */
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId required', 400);

  const auth = await verifyTenantAccess(tenantId);
  if (isNextResponse(auth)) return auth;

  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam = req.nextUrl.searchParams.get('to');
  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const windowMs = to.getTime() - from.getTime();
  const prevTo = from;
  const prevFrom = new Date(from.getTime() - windowMs);

  const baseWhere = { tenantId, occurredAt: { gte: from, lte: to } } as const;

  const [
    missedCalls,
    smsSent,
    callerReplied,
    ownerResponded,
    avgRow,
    ordersCreated,
    meetingsBooked,
    prevMissedCalls,
    prevOrdersCreated,
  ] = await Promise.all([
    prisma.missedCall.count({ where: baseWhere }),
    prisma.missedCall.count({ where: { ...baseWhere, smsSent: true } }),
    prisma.missedCall.count({ where: { ...baseWhere, firstReplyAt: { not: null } } }),
    prisma.missedCall.count({ where: { ...baseWhere, ownerRespondedAt: { not: null } } }),
    prisma.$queryRaw<{ avg: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM ("ownerRespondedAt" - "occurredAt")))::float AS avg
      FROM "MissedCall"
      WHERE "tenantId" = ${tenantId}
        AND "occurredAt" >= ${from}
        AND "occurredAt" <= ${to}
        AND "ownerRespondedAt" IS NOT NULL
    `,
    prisma.order.count({
      where: { tenantId, createdAt: { gte: from, lte: to } },
    }),
    prisma.meeting.count({
      where: { tenantId, createdAt: { gte: from, lte: to } },
    }),
    prisma.missedCall.count({
      where: { tenantId, occurredAt: { gte: prevFrom, lte: prevTo } },
    }),
    prisma.order.count({
      where: { tenantId, createdAt: { gte: prevFrom, lte: prevTo } },
    }),
  ]);

  const conversionRate = missedCalls > 0 ? ordersCreated / missedCalls : 0;
  const prevConversionRate = prevMissedCalls > 0 ? prevOrdersCreated / prevMissedCalls : 0;

  return apiSuccess({
    window: { from: from.toISOString(), to: to.toISOString() },
    missedCalls,
    smsSent,
    callerReplied,
    ownerResponded,
    ordersCreated,
    meetingsBooked,
    avgResponseTimeSeconds: Math.round(avgRow[0]?.avg ?? 0),
    conversionRate,
    weekOverWeek: {
      missedCalls: missedCalls - prevMissedCalls,
      conversionRate: conversionRate - prevConversionRate,
    },
  });
}
