import { BusinessType, Plan } from '@prisma/client';
import { invalidateTenantContext } from './tenantContextCache';
import { recordConfigAudit, diffRecords, actorFromClerk } from './configAuditLog';
import { FlowType } from '@ringback/shared-types';
import { clerkClient } from '@clerk/nextjs/server';
import { logger } from '../logger';
import { NotFoundError } from '../errors';
import { prisma } from '../db';
import { createStripeCustomer } from './billingService';
import { getProfile } from '@/lib/businessTypeProfile';
import { generateUniqueTenantSlug } from '../slugify';

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
  const slug = await generateUniqueTenantSlug(input.name);

  const tenant = await prisma.tenant.create({
    data: {
      name: input.name,
      slug,
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

/**
 * Strip credential fields from a tenant row before shipping it in an
 * API response. The dashboard never needs these client-side, and even
 * though they're AES-256-GCM encrypted at rest, we don't want ciphertext
 * sitting in browser caches / DevTools / Sentry traces — if the key ever
 * leaks, every cached response becomes a decryption target.
 *
 * The admin GET route (apps/web/src/app/api/admin/tenants/[id]/route.ts:59)
 * already does this inline — this helper is the canonical version.
 */
export function sanitizeTenantResponse<T extends Record<string, unknown>>(tenant: T): Omit<T,
  | 'twilioAuthToken'
  | 'squareAccessToken'
  | 'squareRefreshToken'
  | 'posAccessToken'
  | 'posRefreshToken'
  | 'posRaw'
> {
  const {
    twilioAuthToken: _t,
    squareAccessToken: _s1,
    squareRefreshToken: _s2,
    posAccessToken: _p1,
    posRefreshToken: _p2,
    posRaw: _p3,
    ...safe
  } = tenant as any;
  void _t; void _s1; void _s2; void _p1; void _p2; void _p3;
  return safe;
}

export async function updateTenantConfig(
  tenantId: string,
  updates: Partial<{
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
    salesTaxRate: number | null;
    passStripeFeesToCustomer: boolean;
  }>,
  /** Clerk user id of the operator making this change, or null for
   *  system-driven updates (cron-generated greetings, token refreshes).
   *  Surfaces in ConfigAuditLog so "who changed this?" is one query. */
  actorUserId?: string | null,
) {
  // Fetch current config to detect what changed (for TTS regeneration
  // AND for the audit diff). We pull a broad set of columns so the
  // diff is precise; narrower tracking would hide greeting edits that
  // don't touch voice.
  const currentConfig = await prisma.tenantConfig.findUnique({
    where: { tenantId },
    select: {
      voiceType: true,
      voiceGreeting: true,
      voiceGreetingAfterHours: true,
      voiceGreetingRapidRedial: true,
      voiceGreetingReturning: true,
      timezone: true,
      businessHoursStart: true,
      businessHoursEnd: true,
      businessDays: true,
      businessSchedule: true,
      closedDates: true,
      aiPersonality: true,
      ownerEmail: true,
      ownerPhone: true,
      requirePayment: true,
      dailyDigestEnabled: true,
      dailyDigestHour: true,
      defaultPrepTimeMinutes: true,
      largeOrderThresholdItems: true,
      largeOrderExtraMinutes: true,
      prepTimeOverrides: true,
      ordersAcceptingEnabled: true,
      customAiInstructions: true,
      salesTaxRate: true,
      passStripeFeesToCustomer: true,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await prisma.tenantConfig.update({
    where: { tenantId },
    data: updates as any,
  });

  // Audit trail. Diff the keys the caller actually touched against the
  // pre-update snapshot so we don't log every unchanged column.
  if (currentConfig) {
    const changes = diffRecords(
      currentConfig as unknown as Record<string, unknown>,
      { ...(currentConfig as unknown as Record<string, unknown>), ...(updates as Record<string, unknown>) },
      { only: Object.keys(updates) },
    );
    await recordConfigAudit({
      tenantId,
      actor: actorFromClerk(actorUserId ?? null),
      action: 'config.update',
      entity: 'TenantConfig',
      entityId: tenantId,
      changes,
    });
  }

  // Flow-engine reads most of these fields (hours, tax rate, AI
  // instructions, accept-closed-hours flag). Invalidate the cache so
  // the next inbound SMS sees the fresh config immediately instead of
  // waiting out the 60s TTL.
  await invalidateTenantContext(tenantId);

  // Fire-and-forget TTS regeneration when greeting text or voice changes
  if (currentConfig) {
    const { isOpenAIVoice } = await import('@ringback/shared-types');
    const newVoice = (updates.voiceType ?? currentConfig.voiceType) as string;

    if (isOpenAIVoice(newVoice)) {
      const { generateAndUploadGreetingAudio, deleteGreetingAudio, regenerateAllGreetingAudio } =
        await import('./ttsService');
      type OpenAIVoice = import('@ringback/shared-types').OpenAIVoice;

      const voiceChanged = updates.voiceType !== undefined && updates.voiceType !== currentConfig.voiceType;

      if (voiceChanged) {
        // Voice changed — regenerate all slots
        regenerateAllGreetingAudio(tenantId).catch((err) =>
          logger.error('TTS regeneration (voice change) failed', { err, tenantId }),
        );
      } else {
        // Check individual greeting text changes
        const slots = [
          { slot: 'default' as const, field: 'voiceGreeting' as const },
          { slot: 'afterHours' as const, field: 'voiceGreetingAfterHours' as const },
          { slot: 'rapidRedial' as const, field: 'voiceGreetingRapidRedial' as const },
          { slot: 'returning' as const, field: 'voiceGreetingReturning' as const },
        ];

        for (const { slot, field } of slots) {
          if (field in updates) {
            const newText = updates[field] as string | null;
            if (newText?.trim()) {
              generateAndUploadGreetingAudio({
                tenantId,
                slot,
                text: newText,
                voice: newVoice as OpenAIVoice,
              }).catch((err) =>
                logger.error('TTS generation failed', { err, tenantId, slot }),
              );
            } else {
              deleteGreetingAudio(tenantId, slot).catch((err) =>
                logger.error('TTS deletion failed', { err, tenantId, slot }),
              );
            }
          }
        }
      }
    }
  }

  return result;
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
  const rows = await prisma.menuItem.findMany({
    where: { tenantId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    include: {
      categoryRef: true,
      modifierGroups: {
        include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  // Prisma Decimal → JSON serializes as a string, but dashboard components
  // do `item.price.toFixed(2)` etc. Coerce to plain numbers here so the
  // client never has to guess the shape.
  return rows.map((r) => ({
    ...r,
    price: Number(r.price),
    modifierGroups: r.modifierGroups.map((g) => ({
      ...g,
      modifiers: g.modifiers.map((m) => ({
        ...m,
        priceAdjust: Number(m.priceAdjust),
      })),
    })),
  }));
}

/**
 * Ensure a MenuCategory row exists for (tenantId, name). Returns the id.
 * Used when the dashboard creates an item by typing a category string in
 * the legacy field — we auto-promote it to a first-class entity.
 */
async function ensureCategoryByName(tenantId: string, name: string): Promise<string> {
  const existing = await prisma.menuCategory.findUnique({
    where: { tenantId_name: { tenantId, name } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.menuCategory.create({
    data: { tenantId, name, sortOrder: 0, isAvailable: true },
    select: { id: true },
  });
  return created.id;
}

export async function upsertMenuItem(
  tenantId: string,
  item: {
    id?: string;
    name: string;
    description?: string;
    price: number;
    category?: string;
    categoryId?: string | null;
    imageUrl?: string | null;
    isAvailable?: boolean;
    duration?: number | null;
    requiresBooking?: boolean;
  }
) {
  // Resolve category: prefer explicit categoryId, else auto-promote the string.
  let categoryId: string | null = item.categoryId ?? null;
  let categoryName: string | null = item.category ?? null;
  if (!categoryId && categoryName) {
    categoryId = await ensureCategoryByName(tenantId, categoryName);
  } else if (categoryId && !categoryName) {
    // Keep the string field in sync with the category row's name.
    const cat = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
      select: { name: true, tenantId: true },
    });
    if (cat && cat.tenantId === tenantId) categoryName = cat.name;
    else categoryId = null;
  }

  let saved;
  if (item.id) {
    const existing = await prisma.menuItem.findUnique({
      where: { id: item.id },
      select: { tenantId: true },
    });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundError('Menu item');
    }
    saved = await prisma.menuItem.update({
      where: { id: item.id },
      data: {
        name: item.name,
        description: item.description,
        price: item.price,
        category: categoryName,
        categoryId,
        imageUrl: item.imageUrl ?? null,
        isAvailable: item.isAvailable ?? true,
        duration: item.duration ?? null,
        requiresBooking: item.requiresBooking ?? false,
      },
    });
  } else {
    saved = await prisma.menuItem.create({
      data: {
        tenantId,
        name: item.name,
        description: item.description,
        price: item.price,
        category: categoryName,
        categoryId,
        imageUrl: item.imageUrl ?? null,
        isAvailable: item.isAvailable ?? true,
        duration: item.duration ?? null,
        requiresBooking: item.requiresBooking ?? false,
      },
    });
  }
  await invalidateTenantContext(tenantId);
  return saved;
}

// ── Menu categories ──────────────────────────────────────────────────────────

export async function listMenuCategories(tenantId: string) {
  const cats = await prisma.menuCategory.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { items: true } } },
  });
  return cats.map((c) => ({
    id: c.id,
    tenantId: c.tenantId,
    name: c.name,
    sortOrder: c.sortOrder,
    isAvailable: c.isAvailable,
    posCategoryId: c.posCategoryId,
    itemCount: c._count.items,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
}

export async function upsertMenuCategory(
  tenantId: string,
  input: { id?: string; name: string; sortOrder?: number; isAvailable?: boolean },
) {
  if (input.id) {
    const existing = await prisma.menuCategory.findUnique({
      where: { id: input.id },
      select: { tenantId: true, name: true },
    });
    if (!existing || existing.tenantId !== tenantId) throw new NotFoundError('Category');
    const updated = await prisma.menuCategory.update({
      where: { id: input.id },
      data: {
        name: input.name,
        sortOrder: input.sortOrder,
        isAvailable: input.isAvailable,
      },
    });
    // Keep the legacy string field on all affected items in sync
    if (input.name && input.name !== existing.name) {
      await prisma.menuItem.updateMany({
        where: { tenantId, categoryId: input.id },
        data: { category: input.name },
      });
    }
    await invalidateTenantContext(tenantId);
    return updated;
  }
  const created = await prisma.menuCategory.create({
    data: {
      tenantId,
      name: input.name,
      sortOrder: input.sortOrder ?? 0,
      isAvailable: input.isAvailable ?? true,
    },
  });
  await invalidateTenantContext(tenantId);
  return created;
}

export async function deleteMenuCategory(tenantId: string, id: string) {
  const existing = await prisma.menuCategory.findUnique({
    where: { id },
    select: { tenantId: true },
  });
  if (!existing || existing.tenantId !== tenantId) throw new NotFoundError('Category');
  // onDelete: SetNull on MenuItem.categoryId handles unlinking automatically.
  // Also clear the legacy string field on items that were in this category.
  await prisma.menuItem.updateMany({
    where: { tenantId, categoryId: id },
    data: { category: null },
  });
  await prisma.menuCategory.delete({ where: { id } });
  await invalidateTenantContext(tenantId);
}

export async function bulkSetCategoriesAvailability(
  tenantId: string,
  ids: string[],
  isAvailable: boolean,
) {
  const result = await prisma.menuCategory.updateMany({
    where: { tenantId, id: { in: ids } },
    data: { isAvailable },
  });
  await invalidateTenantContext(tenantId);
  return { count: result.count };
}

export async function bulkSetItemsAvailability(
  tenantId: string,
  ids: string[],
  isAvailable: boolean,
) {
  const result = await prisma.menuItem.updateMany({
    where: { tenantId, id: { in: ids } },
    data: { isAvailable },
  });
  await invalidateTenantContext(tenantId);
  return { count: result.count };
}
