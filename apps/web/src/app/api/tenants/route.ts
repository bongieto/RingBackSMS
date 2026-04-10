import { NextRequest } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { createTenant } from '@/lib/server/services/tenantService';
import { CreateTenantRequestSchema } from '@ringback/shared-types';
import { apiCreated, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';
import { prisma } from '@/lib/server/db';
import { isAgencyUser, isSuperAdmin, countUserOrganizations } from '@/lib/server/agency';
import { linkTenantToAgency } from '@/lib/server/services/agencyService';
import { getProfile } from '@/lib/businessTypeProfile';
import { FlowType } from '@ringback/shared-types';
import { buildConsentMessage } from '@/lib/server/services/consentService';

const BUSINESS_TYPE_TO_TEMPLATE: Record<string, string> = {
  RESTAURANT: 'restaurant',
  FOOD_TRUCK: 'food_truck',
  SERVICE: 'salon',
  CONSULTANT: 'consultant',
  MEDICAL: 'medical',
  RETAIL: 'retail',
  OTHER: 'restaurant', // fallback
};

export async function POST(request: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  try {
    const body = CreateTenantRequestSchema.parse(await request.json());
    // Prefer server-side orgId (trusted), but fall back to the client-sent
    // clerkOrgId if the Clerk session hasn't picked up the active org yet.
    const effectiveOrgId = orgId ?? body.clerkOrgId;

    // Idempotent: if a tenant already exists for this Clerk org (e.g. a
    // stub created by the organization.created webhook), upgrade it in
    // place with the full onboarding payload: name, business type,
    // default flows/config for that business type, and mark onboarding
    // as complete.
    if (effectiveOrgId) {
      const existing = await prisma.tenant.findUnique({ where: { clerkOrgId: effectiveOrgId } });
      if (existing) {
        const profile = getProfile(body.businessType);
        const updated = await prisma.tenant.update({
          where: { id: existing.id },
          data: {
            name: body.name,
            businessType: body.businessType,
            onboardingCompletedAt: new Date(),
          },
        });
        // Upsert the config with values derived from the selected
        // business type profile, only writing the greeting if none is
        // set yet so we don't clobber a customized one.
        const existingConfig = await prisma.tenantConfig.findUnique({
          where: { tenantId: existing.id },
          select: { greeting: true },
        });
        // Resolve the industry template for this business type
        const templateKey = BUSINESS_TYPE_TO_TEMPLATE[body.businessType] ?? 'restaurant';
        const template = await prisma.industryTemplate.findUnique({
          where: { industryKey: templateKey },
          select: { consentMessageDefault: true, followupOpenerDefault: true, voiceGreetingDefault: true },
        });
        const consentMsg = buildConsentMessage(body.name);
        const followupOpener = template?.followupOpenerDefault ?? `Thanks! How can ${body.name} help you today?`;
        const voiceGreeting = template?.voiceGreetingDefault?.replace(/\{business_name\}/gi, body.name) ?? null;

        await prisma.tenantConfig.upsert({
          where: { tenantId: existing.id },
          update: {
            aiPersonality: profile.aiPersonalityHint,
            timezone: body.timezone ?? 'America/Chicago',
            businessDays: profile.defaultHours.days,
            businessHoursStart: profile.defaultHours.start,
            businessHoursEnd: profile.defaultHours.end,
            ownerEmail: body.ownerEmail ?? undefined,
            ownerPhone: body.ownerPhone ?? undefined,
            industryTemplateKey: templateKey,
            consentMessage: consentMsg,
            followupOpener: followupOpener,
            ...(existingConfig?.greeting
              ? {}
              : { greeting: profile.defaultGreeting(body.name) }),
            ...(voiceGreeting ? { voiceGreeting } : {}),
          },
          create: {
            tenantId: existing.id,
            greeting: profile.defaultGreeting(body.name),
            aiPersonality: profile.aiPersonalityHint,
            timezone: body.timezone ?? 'America/Chicago',
            businessDays: profile.defaultHours.days,
            businessHoursStart: profile.defaultHours.start,
            businessHoursEnd: profile.defaultHours.end,
            ownerEmail: body.ownerEmail,
            ownerPhone: body.ownerPhone,
            industryTemplateKey: templateKey,
            consentMessage: consentMsg,
            followupOpener: followupOpener,
            voiceGreeting: voiceGreeting,
          },
        });
        // Enable the default flows for this business type (idempotent).
        const flowsToCreate = Array.from(new Set([...profile.enabledFlows, FlowType.FALLBACK]));
        for (const type of flowsToCreate) {
          await prisma.flow.upsert({
            where: { tenantId_type: { tenantId: existing.id, type } },
            update: { isEnabled: true },
            create: { tenantId: existing.id, type, isEnabled: true },
          });
        }
        // Also rename the Clerk org so the sidebar/org switcher reflects it.
        try {
          const clerk = await clerkClient();
          await clerk.organizations.updateOrganization(effectiveOrgId, { name: body.name });
        } catch (e) {
          console.warn('[POST /api/tenants] failed to rename Clerk org', e);
        }
        return apiCreated(updated);
      }
    }

    // Agency gate: only agency-flagged users (or the super admin) may create a
    // 2nd+ organization. First-org creation is always allowed.
    if (!isSuperAdmin(userId)) {
      const orgCount = await countUserOrganizations(userId);
      if (orgCount >= 1 && !(await isAgencyUser(userId))) {
        return apiError(
          'Multiple organizations require agency access. Contact info@ringbacksms.com to enable it on your account.',
          403,
        );
      }
    }

    const tenant = await createTenant({ ...body, clerkOrgId: effectiveOrgId ?? undefined });
    // Mark onboarding as complete — this path runs when the user
    // submitted the onboarding form for an org with no existing stub.
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { onboardingCompletedAt: new Date() },
    });
    // If the creating user is an agency, auto-link the new tenant so
    // commissions accrue to them on subscription invoices.
    if (await isAgencyUser(userId)) {
      try {
        await linkTenantToAgency(tenant.id, userId);
      } catch (e) {
        console.warn('[POST /api/tenants] failed to auto-link agency', e);
      }
    }
    // Rename the Clerk org to match the new tenant name for consistency.
    if (effectiveOrgId) {
      try {
        const clerk = await clerkClient();
        await clerk.organizations.updateOrganization(effectiveOrgId, { name: body.name });
      } catch (e) {
        console.warn('[POST /api/tenants] failed to rename Clerk org', e);
      }
    }
    return apiCreated(tenant);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    console.error('[POST /api/tenants] failed', err);
    return apiError('Internal server error', 500);
  }
}
