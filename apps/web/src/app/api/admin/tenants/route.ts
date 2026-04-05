import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { BusinessType, Plan } from '@prisma/client';
import { prisma } from '@/lib/server/db';
import { apiError, apiPaginated, apiCreated } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

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

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  const CreateSchema = z.object({
    name: z.string().min(1).max(255),
    businessType: z.nativeEnum(BusinessType),
    plan: z.nativeEnum(Plan).default('STARTER'),
    ownerEmail: z.string().email().optional(),
    ownerPhone: z.string().optional(),
    greeting: z.string().optional(),
  });

  let body: z.infer<typeof CreateSchema>;
  try {
    body = CreateSchema.parse(await request.json());
  } catch (err: any) {
    return apiError(err.message ?? 'Invalid body', 400);
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: body.name,
      businessType: body.businessType,
      plan: body.plan,
      isActive: true,
    },
  });

  // Auto-create config if contact info provided
  if (body.ownerEmail || body.ownerPhone || body.greeting) {
    await prisma.tenantConfig.create({
      data: {
        tenantId: tenant.id,
        greeting: body.greeting ?? `Hi! Thanks for calling ${body.name}. We missed your call but we're here to help via text!`,
        ownerEmail: body.ownerEmail ?? null,
        ownerPhone: body.ownerPhone ?? null,
        businessDays: [1, 2, 3, 4, 5],
      },
    });
  }

  logger.info('Admin created tenant', { adminAction: true, tenantId: tenant.id, name: body.name });
  return apiCreated(tenant);
}
