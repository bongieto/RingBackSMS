import { isSuperAdmin } from '@/lib/server/agency';
import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { Plan, BusinessType } from '@prisma/client';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';
import { sanitizeTenantResponse } from '@/lib/server/services/tenantService';
import { invalidateTenantContext } from '@/lib/server/services/tenantContextCache';
import { checkAuthRateLimit } from '@/lib/server/rateLimit';
import { recordConfigAudit, diffRecords, actorFromClerk } from '@/lib/server/services/configAuditLog';


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
  const safeTenant = sanitizeTenantResponse(tenant as any);

  return apiSuccess({
    ...safeTenant,
    smsLast30Days,
    recentConversations,
  });
}

const UpdateSchema = z.object({
  plan: z.nativeEnum(Plan).optional(),
  businessType: z.nativeEnum(BusinessType).optional(),
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
  // Per-user rate limit on admin mutations — protects against a
  // compromised admin session being used to scrape or grief at scale.
  const limited = await checkAuthRateLimit(userId, request.headers, 'admin-tenant-mutate');
  if (limited) return limited;

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

  // Cache invalidation — admin edits are the operator's most direct
  // way to change live config, so propagating immediately (instead of
  // waiting for the 60s TTL) matters here especially.
  await invalidateTenantContext(params.id);

  // Audit — super-admin edits are the highest-trust mutation path, so
  // an explicit trail is non-negotiable. Diff against the pre-update
  // Tenant row so we record exactly which fields an admin touched.
  const tenantDiff = diffRecords(
    existing as unknown as Record<string, unknown>,
    { ...(existing as unknown as Record<string, unknown>), ...(tenantFields as Record<string, unknown>) },
    { only: Object.keys(tenantFields) },
  );
  await recordConfigAudit({
    tenantId: params.id,
    actor: actorFromClerk(userId),
    action: 'tenant.update',
    entity: 'Tenant',
    entityId: params.id,
    changes: tenantDiff,
  });
  if (Object.keys(configUpdate).length > 0) {
    await recordConfigAudit({
      tenantId: params.id,
      actor: actorFromClerk(userId),
      action: 'config.update',
      entity: 'TenantConfig',
      entityId: params.id,
      // We don't have a pre-image of TenantConfig for the admin path
      // (upsert → might be creating). Record the target values; a
      // follow-up pass can add a findUnique for diffs.
      changes: Object.fromEntries(
        Object.entries(configUpdate).map(([k, v]) => [k, { before: null, after: v }]),
      ),
    });
  }

  logger.info('Admin updated tenant', {
    adminAction: true,
    tenantId: params.id,
    changes: body,
  });

  return apiSuccess(sanitizeTenantResponse(tenant));
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
