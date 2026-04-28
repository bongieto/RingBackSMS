import { isSuperAdmin } from '@/lib/server/agency';
import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { BusinessType, Plan } from '@prisma/client';
import { prisma } from '@/lib/server/db';
import { apiError, apiPaginated, apiCreated } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';
import { createTenant } from '@/lib/server/services/tenantService';
import { buildConsentMessage } from '@/lib/server/services/consentService';

const BUSINESS_TYPE_TO_TEMPLATE: Record<string, string> = {
  RESTAURANT: 'restaurant',
  FOOD_TRUCK: 'food_truck',
  SERVICE: 'salon',
  CONSULTANT: 'consultant',
  MEDICAL: 'medical',
  RETAIL: 'retail',
  OTHER: 'restaurant',
};

const blankToUndefined = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

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
    plan: z.nativeEnum(Plan).default('FREE'),
    ownerEmail: z.preprocess(blankToUndefined, z.string().email().optional()),
    ownerPhone: z.preprocess(blankToUndefined, z.string().optional()),
    greeting: z.preprocess(blankToUndefined, z.string().optional()),
  });

  let body: z.infer<typeof CreateSchema>;
  try {
    body = CreateSchema.parse(await request.json());
  } catch (err: any) {
    return apiError(err.message ?? 'Invalid body', 400);
  }

  const tenant = await createTenant({
    name: body.name,
    businessType: body.businessType,
    plan: body.plan,
    ownerEmail: body.ownerEmail,
    ownerPhone: body.ownerPhone,
  });

  const templateKey = BUSINESS_TYPE_TO_TEMPLATE[body.businessType] ?? 'restaurant';
  const template = await prisma.industryTemplate.findUnique({
    where: { industryKey: templateKey },
    select: { followupOpenerDefault: true, voiceGreetingDefault: true },
  });
  const followupOpener = template?.followupOpenerDefault ?? `Thanks! How can ${body.name} help you today?`;
  const voiceGreeting = template?.voiceGreetingDefault?.replace(/\{business_name\}/gi, body.name) ?? null;

  await prisma.tenantConfig.update({
    where: { tenantId: tenant.id },
    data: {
      ...(body.greeting ? { greeting: body.greeting } : {}),
      industryTemplateKey: templateKey,
      consentMessage: buildConsentMessage(body.name),
      followupOpener,
      voiceGreeting,
    },
  });

  logger.info('Admin created tenant', { adminAction: true, tenantId: tenant.id, name: body.name });
  return apiCreated(tenant);
}
