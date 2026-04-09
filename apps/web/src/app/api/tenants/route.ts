import { NextRequest } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { createTenant } from '@/lib/server/services/tenantService';
import { CreateTenantRequestSchema } from '@ringback/shared-types';
import { apiCreated, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';
import { prisma } from '@/lib/server/db';
import { isAgencyUser, isSuperAdmin, countUserOrganizations } from '@/lib/server/agency';
import { linkTenantToAgency } from '@/lib/server/services/agencyService';

export async function POST(request: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  try {
    const body = CreateTenantRequestSchema.parse(await request.json());
    // Prefer server-side orgId (trusted), but fall back to the client-sent
    // clerkOrgId if the Clerk session hasn't picked up the active org yet.
    const effectiveOrgId = orgId ?? body.clerkOrgId;

    // Idempotent: if a tenant already exists for this Clerk org, update its
    // name to match the submitted business name and return it. This ensures
    // the tenant name stays in sync with what the user typed during onboarding.
    if (effectiveOrgId) {
      const existing = await prisma.tenant.findUnique({ where: { clerkOrgId: effectiveOrgId } });
      if (existing) {
        const updated = existing.name !== body.name
          ? await prisma.tenant.update({ where: { id: existing.id }, data: { name: body.name } })
          : existing;
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
          'Multiple organizations require agency access. Contact support@ringbacksms.com to enable it on your account.',
          403,
        );
      }
    }

    const tenant = await createTenant({ ...body, clerkOrgId: effectiveOrgId ?? undefined });
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
