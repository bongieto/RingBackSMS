import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(request: NextRequest, { params }: { params: { tenantId: string } }) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  const days = parseInt(new URL(request.url).searchParams.get('days') ?? '30', 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { tenantId } = params;
  const [totalMissedCalls, totalConversations, totalOrders, totalMeetings, recentUsage] = await Promise.all([
    prisma.missedCall.count({ where: { tenantId, occurredAt: { gte: since } } }),
    prisma.conversation.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.order.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.meeting.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.usageLog.groupBy({ by: ['type'], where: { tenantId, createdAt: { gte: since } }, _count: { id: true } }),
  ]);
  const usage = Object.fromEntries(recentUsage.map((u) => [u.type, u._count.id]));
  return apiSuccess({ period: { days, since }, missedCalls: totalMissedCalls, conversations: totalConversations, orders: totalOrders, meetings: totalMeetings, usage });
}
