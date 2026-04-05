import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { apiError, apiPaginated } from '@/lib/server/response';
import { Plan } from '@prisma/client';

function isSuperAdmin(userId: string | null): boolean {
  const adminId = process.env.SUPER_ADMIN_USER_ID?.trim();
  return !!userId && !!adminId && userId === adminId;
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);
  const search = searchParams.get('search') ?? undefined;
  const planParam = searchParams.get('plan') ?? undefined;
  const plan = planParam as Plan | undefined;
  const isActiveParam = searchParams.get('isActive');
  const isActive = isActiveParam !== null ? isActiveParam === 'true' : undefined;

  const where = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { clerkOrgId: { contains: search } },
      ],
    }),
    ...(plan && { plan }),
    ...(isActive !== undefined && { isActive }),
  };

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        businessType: true,
        plan: true,
        isActive: true,
        clerkOrgId: true,
        twilioPhoneNumber: true,
        posProvider: true,
        createdAt: true,
        _count: {
          select: {
            conversations: true,
            orders: true,
            contacts: true,
          },
        },
      },
    }),
    prisma.tenant.count({ where }),
  ]);

  return apiPaginated(tenants, total, page, pageSize);
}
