import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { Plan } from '@prisma/client';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

function isSuperAdmin(userId: string | null): boolean {
  const adminId = process.env.SUPER_ADMIN_CLERK_USER_ID?.trim();
  return !!userId && !!adminId && userId === adminId;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      config: true,
      agency: {
        select: {
          id: true,
          name: true,
          clerkUserId: true,
          defaultRevSharePct: true,
        },
      },
      _count: {
        select: {
          conversations: true,
          orders: true,
          contacts: true,
          meetings: true,
          missedCalls: true,
          usageLogs: true,
        },
      },
    },
  });

  if (!tenant) return apiError('Tenant not found', 404);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const smsLast30Days = await prisma.usageLog.count({
    where: {
      tenantId: tenant.id,
      type: 'SMS_SENT',
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  const recentConversations = await prisma.conversation.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, callerPhone: true, flowType: true, isActive: true, createdAt: true },
  });

  // Remove sensitive encrypted fields from response
  const { squareAccessToken, squareRefreshToken, posAccessToken, posRefreshToken, twilioAuthToken, ...safeTenant } = tenant as any;

  return apiSuccess({
    ...safeTenant,
    smsLast30Days,
    recentConversations,
  });
}

const UpdateSchema = z.object({
  plan: z.nativeEnum(Plan).optional(),
  isActive: z.boolean().optional(),
  name: z.string().min(1).optional(),
  agencyId: z.string().uuid().nullable().optional(),
  // Config fields
  greeting: z.string().optional(),
  ownerEmail: z.string().email().nullable().optional(),
  ownerPhone: z.string().nullable().optional(),
  businessHoursStart: z.string().optional(),
  businessHoursEnd: z.string().optional(),
  timezone: z.string().optional(),
  aiPersonality: z.string().nullable().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  let body: z.infer<typeof UpdateSchema>;
  try {
    body = UpdateSchema.parse(await request.json());
  } catch {
    return apiError('Invalid request body', 400);
  }

  const existing = await prisma.tenant.findUnique({ where: { id: params.id } });
  if (!existing) return apiError('Tenant not found', 404);

  const { greeting, ownerEmail, ownerPhone, businessHoursStart, businessHoursEnd, timezone, aiPersonality, ...tenantFields } = body;

  const tenant = await prisma.tenant.update({
    where: { id: params.id },
    data: tenantFields,
  });

  const configFields = ['ownerEmail', 'ownerPhone', 'greeting', 'businessHoursStart', 'businessHoursEnd', 'timezone', 'aiPersonality'];
  const configUpdate = Object.fromEntries(
    Object.entries(body).filter(([k]) => configFields.includes(k)).map(([k, v]) => [k, v])
  );
  if (Object.keys(configUpdate).length > 0) {
    await prisma.tenantConfig.upsert({
      where: { tenantId: params.id },
      update: configUpdate,
      create: {
        tenantId: params.id,
        greeting: (configUpdate.greeting as string) ?? `Welcome! We missed your call.`,
        businessDays: [1, 2, 3, 4, 5],
        ...configUpdate,
      },
    });
  }

  logger.info('Admin updated tenant', {
    adminAction: true,
    tenantId: params.id,
    changes: body,
  });

  return apiSuccess(tenant);
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  const existing = await prisma.tenant.findUnique({ where: { id: params.id } });
  if (!existing) return apiError('Tenant not found', 404);

  // Hard delete — cascades to all related records via Prisma schema
  await prisma.tenant.delete({ where: { id: params.id } });

  logger.info('Admin deleted tenant', { adminAction: true, tenantId: params.id, name: existing.name });
  return apiSuccess({ deleted: true, id: params.id, name: existing.name });
}
