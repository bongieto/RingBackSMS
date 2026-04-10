import { BusinessType, Plan } from '@prisma/client';
import { FlowType } from '@ringback/shared-types';
import { clerkClient } from '@clerk/nextjs/server';
import { logger } from '../logger';
import { NotFoundError } from '../errors';
import { prisma } from '../db';
import { createStripeCustomer } from './billingService';
import { getProfile } from '@/lib/businessTypeProfile';

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
  const profile = getProfile(input.businessType);

  const tenant = await prisma.tenant.create({
    data: {
      name: input.name,
      businessType: input.businessType,
      plan: input.plan ?? Plan.STARTER,
      clerkOrgId: input.clerkOrgId,
      isActive: true,
    },
  });

  // Create default config seeded from business-type profile
  await prisma.tenantConfig.create({
    data: {
      tenantId: tenant.id,
      greeting: profile.defaultGreeting(input.name),
      aiPersonality: profile.aiPersonalityHint,
      timezone: input.timezone ?? 'America/Chicago',
      businessDays: profile.defaultHours.days,
      businessHoursStart: profile.defaultHours.start,
      businessHoursEnd: profile.defaultHours.end,
      ownerEmail: input.ownerEmail,
      ownerPhone: input.ownerPhone,
    },
  });

  // Enable flows per profile (FALLBACK always included)
  const flowsToCreate = Array.from(new Set([...profile.enabledFlows, FlowType.FALLBACK]));
  await prisma.flow.createMany({
    data: flowsToCreate.map((type) => ({
      tenantId: tenant.id,
      type,
      isEnabled: true,
    })),
  });

  // Set tenantId in Clerk organization metadata
  if (input.clerkOrgId) {
    try {
      const clerk = await clerkClient();
      await clerk.organizations.updateOrganizationMetadata(input.clerkOrgId, {
        publicMetadata: { tenantId: tenant.id },
      });
    } catch (err) {
      logger.error('Failed to update Clerk org metadata', { err, clerkOrgId: input.clerkOrgId });
    }
  }

  // Auto-create Stripe customer
  if (input.ownerEmail) {
    try {
      await createStripeCustomer(tenant.id, input.ownerEmail, input.name);
    } catch (err) {
      logger.error('Failed to create Stripe customer', { err, tenantId: tenant.id });
    }
  }

  logger.info('Tenant created', { tenantId: tenant.id, name: tenant.name });
  return tenant;
}

/**
 * Idempotent: ensure a tenant row exists for a given Clerk organization.
 * Used by the Clerk `organization.created` webhook and as a safety-belt
 * inside `GET /api/tenants/me` so the dashboard never hits 404 due to a
 * missing tenant row. If no tenant exists, creates a stub with defaults
 * that will be overwritten when the user submits the onboarding form.
 */
export async function ensureTenantForClerkOrg(input: {
  clerkOrgId: string;
  name?: string | null;
  ownerEmail?: string;
}) {
  const existing = await prisma.tenant.findUnique({
    where: { clerkOrgId: input.clerkOrgId },
  });
  if (existing) return existing;

  const name =
    (input.name && input.name.trim()) ||
    `Organization ${input.clerkOrgId.slice(-6)}`;

  return createTenant({
    name,
    businessType: BusinessType.OTHER,
    plan: Plan.STARTER,
    clerkOrgId: input.clerkOrgId,
    ownerEmail: input.ownerEmail,
  });
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
    greetingAfterHours: string | null;
    greetingRapidRedial: string | null;
    greetingReturning: string | null;
    voiceGreeting: string | null;
    voiceGreetingAfterHours: string | null;
    voiceGreetingRapidRedial: string | null;
    voiceGreetingReturning: string | null;
    voiceType: string;
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
    requirePayment: boolean;
    dailyDigestEnabled: boolean;
    dailyDigestHour: number;
    defaultPrepTimeMinutes: number | null;
    largeOrderThresholdItems: number | null;
    largeOrderExtraMinutes: number | null;
    prepTimeOverrides: Array<{
      dayOfWeek: number;
      start: string;
      end: string;
      extraMinutes: number;
      label?: string;
    }> | null;
    ordersAcceptingEnabled: boolean;
    customAiInstructions: string | null;
    followupOpener: string | null;
    industryTemplateKey: string | null;
    consentMessage: string | null;
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
    where: { tenantId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    include: {
      modifierGroups: {
        include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
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
    imageUrl?: string | null;
    isAvailable?: boolean;
    duration?: number | null;
    requiresBooking?: boolean;
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
        imageUrl: item.imageUrl ?? null,
        isAvailable: item.isAvailable ?? true,
        duration: item.duration ?? null,
        requiresBooking: item.requiresBooking ?? false,
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
      imageUrl: item.imageUrl ?? null,
      isAvailable: item.isAvailable ?? true,
      duration: item.duration ?? null,
      requiresBooking: item.requiresBooking ?? false,
    },
  });
}
