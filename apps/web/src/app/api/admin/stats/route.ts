import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

function isSuperAdmin(userId: string | null): boolean {
  const adminId = process.env.SUPER_ADMIN_CLERK_USER_ID?.trim();
  return !!userId && !!adminId && userId === adminId;
}

export async function GET(_request: NextRequest) {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalTenants,
    activeTenants,
    totalConversations,
    activeConversations,
    totalOrders,
    totalContacts,
    totalMeetings,
    smsSentLast30Days,
    planBreakdown,
    newTenantsLast30Days,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { isActive: true } }),
    prisma.conversation.count(),
    prisma.conversation.count({ where: { isActive: true } }),
    prisma.order.count(),
    prisma.contact.count(),
    prisma.meeting.count(),
    prisma.usageLog.count({
      where: { type: 'SMS_SENT', createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.tenant.groupBy({
      by: ['plan'],
      _count: { plan: true },
    }),
    prisma.tenant.count({
      where: { createdAt: { gte: thirtyDaysAgo } },
    }),
  ]);

  const planCounts: Record<string, number> = {};
  for (const row of planBreakdown) {
    planCounts[row.plan] = row._count.plan;
  }

  return apiSuccess({
    tenants: { total: totalTenants, active: activeTenants, newLast30Days: newTenantsLast30Days },
    conversations: { total: totalConversations, active: activeConversations },
    orders: totalOrders,
    contacts: totalContacts,
    meetings: totalMeetings,
    sms: { sentLast30Days: smsSentLast30Days },
    plans: planCounts,
  });
}
