import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

function isSuperAdmin(userId: string | null): boolean {
  const adminId = process.env.SUPER_ADMIN_USER_ID?.trim();
  return !!userId && !!adminId && userId === adminId;
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  const limit = parseInt(new URL(request.url).searchParams.get('limit') ?? '50', 10);

  const [recentConversations, recentOrders, recentTenants] = await Promise.all([
    prisma.conversation.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        tenantId: true,
        callerPhone: true,
        flowType: true,
        createdAt: true,
        tenant: { select: { name: true } },
      },
    }),
    prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.floor(limit / 2),
      select: {
        id: true,
        tenantId: true,
        orderNumber: true,
        total: true,
        status: true,
        createdAt: true,
        tenant: { select: { name: true } },
      },
    }),
    prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, name: true, plan: true, businessType: true, createdAt: true },
    }),
  ]);

  return apiSuccess({ recentConversations, recentOrders, recentTenants });
}
