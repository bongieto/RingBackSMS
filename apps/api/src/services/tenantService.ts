import { PrismaClient, BusinessType, Plan } from '@prisma/client';
import { FlowType } from '@ringback/shared-types';
import { logger } from '../utils/logger';
import { NotFoundError } from '../utils/errors';

const prisma = new PrismaClient();

export interface CreateTenantInput {
  name: string;
  businessType: BusinessType;
  plan?: Plan;
  clerkOrgId?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  timezone?: string;
}

export async function createTenant(input: CreateTenantInput) {
  const tenant = await prisma.tenant.create({
    data: {
      name: input.name,
      businessType: input.businessType,
      plan: input.plan ?? Plan.STARTER,
      clerkOrgId: input.clerkOrgId,
      isActive: true,
    },
  });

  // Create default config
  await prisma.tenantConfig.create({
    data: {
      tenantId: tenant.id,
      greeting: `Hi! Sorry we missed your call from ${input.name}. How can we help you today?`,
      timezone: input.timezone ?? 'America/Chicago',
      businessDays: [1, 2, 3, 4, 5], // Mon-Fri
      businessHoursStart: '09:00',
      businessHoursEnd: '17:00',
      ownerEmail: input.ownerEmail,
      ownerPhone: input.ownerPhone,
    },
  });

  // Create default FALLBACK flow
  await prisma.flow.create({
    data: {
      tenantId: tenant.id,
      type: FlowType.FALLBACK,
      isEnabled: true,
    },
  });

  logger.info('Tenant created', { tenantId: tenant.id, name: tenant.name });
  return tenant;
}

export async function getTenantById(id: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      config: true,
      flows: true,
    },
  });

  if (!tenant) throw new NotFoundError('Tenant');
  return tenant;
}

export async function getTenantByClerkOrg(clerkOrgId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { clerkOrgId },
    include: {
      config: true,
      flows: { where: { isEnabled: true } },
      menuItems: { where: { isAvailable: true } },
    },
  });

  if (!tenant) throw new NotFoundError('Tenant');
  return tenant;
}

export async function updateTenantConfig(
  tenantId: string,
  updates: Partial<{
    greeting: string;
    timezone: string;
    businessHoursStart: string;
    businessHoursEnd: string;
    businessDays: number[];
    businessSchedule: Record<string, { open: string; close: string }> | null;
    closedDates: string[];
    aiPersonality: string;
    calcomLink: string;
    slackWebhook: string;
    ownerEmail: string;
    ownerPhone: string;
    businessAddress: string;
    websiteUrl: string;
    squareSyncEnabled: boolean;
    squareAutoSync: boolean;
  }>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.tenantConfig.update({
    where: { tenantId },
    data: updates as any,
  });
}

export async function listTenants(page = 1, pageSize = 20) {
  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        businessType: true,
        plan: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.tenant.count(),
  ]);

  return { tenants, total };
}

export async function getTenantMenuItems(tenantId: string) {
  return prisma.menuItem.findMany({
    where: { tenantId, isAvailable: true },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
}

export async function upsertMenuItem(
  tenantId: string,
  item: {
    id?: string;
    name: string;
    description?: string;
    price: number;
    category?: string;
    isAvailable?: boolean;
  }
) {
  if (item.id) {
    return prisma.menuItem.update({
      where: { id: item.id },
      data: {
        name: item.name,
        description: item.description,
        price: item.price,
        category: item.category,
        isAvailable: item.isAvailable ?? true,
      },
    });
  }

  return prisma.menuItem.create({
    data: {
      tenantId,
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category,
      isAvailable: item.isAvailable ?? true,
    },
  });
}
