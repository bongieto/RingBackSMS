import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import {
  getTenantByClerkOrg,
  ensureTenantForClerkOrg,
  sanitizeTenantResponse,
} from '@/lib/server/services/tenantService';
import { prisma } from '@/lib/server/db';
import { NotFoundError } from '@/lib/server/errors';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return apiError('Organization required', 401);
  try {
    let tenant;
    try {
      tenant = await getTenantByClerkOrg(orgId);
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
      // Self-heal: the tenant row may have been created without a clerkOrgId
      // (e.g. orgId wasn't in the session yet during POST /tenants). If the
      // Clerk org's publicMetadata points to a real tenant that's missing a
      // clerkOrgId, adopt it.
      const clerk = await clerkClient();
      const org = await clerk.organizations.getOrganization({ organizationId: orgId });
      const metaTenantId = org.publicMetadata?.tenantId as string | undefined;
      let candidate = metaTenantId
        ? await prisma.tenant.findUnique({ where: { id: metaTenantId } })
        : null;

      // SECURITY GUARD: never adopt a tenant that's already linked to a
      // DIFFERENT Clerk org — that would be a tenant takeover. Only adopt
      // if candidate.clerkOrgId is null OR already matches this session.
      if (candidate && candidate.clerkOrgId && candidate.clerkOrgId !== orgId) {
        console.warn('[GET /api/tenants/me] refusing to adopt tenant linked to another org', {
          candidateTenantId: candidate.id,
          candidateLinkedOrg: candidate.clerkOrgId,
          requestingOrg: orgId,
        });
        candidate = null;
      }

      // Secondary heal: match by signed-in user's email against
      // TenantConfig.ownerEmail. Handles cases where onboarding wrote a
      // clerkOrgId that differs from the current session's orgId (e.g. the
      // user switched Clerk orgs or client/server session mismatch).
      if (!candidate) {
        const user = await currentUser();
        const email = user?.emailAddresses?.[0]?.emailAddress?.toLowerCase();
        if (email) {
          const cfg = await prisma.tenantConfig.findFirst({
            where: { ownerEmail: { equals: email, mode: 'insensitive' } },
            orderBy: { createdAt: 'desc' },
          });
          if (cfg) {
            candidate = await prisma.tenant.findUnique({ where: { id: cfg.tenantId } });
            // Same guard: don't hijack an email-matched tenant that's
            // already linked to someone else's Clerk org.
            if (candidate && candidate.clerkOrgId && candidate.clerkOrgId !== orgId) {
              console.warn('[GET /api/tenants/me] email match rejected: tenant already linked to another org', {
                candidateTenantId: candidate.id,
                candidateLinkedOrg: candidate.clerkOrgId,
                requestingOrg: orgId,
                email,
              });
              candidate = null;
            }
          }
        }
      }

      if (!candidate) {
        // Safety belt: no tenant exists for this Clerk org via any tier.
        // This happens when the `organization.created` webhook hasn't
        // landed yet (or was never registered). Create a stub so the
        // dashboard never 404s. The stub will be updated when the user
        // submits the onboarding form (POST /api/tenants is idempotent).
        const userForEmail = await currentUser();
        const ownerEmail = userForEmail?.emailAddresses?.[0]?.emailAddress?.toLowerCase();
        await ensureTenantForClerkOrg({
          clerkOrgId: orgId,
          name: org.name,
          ownerEmail,
        });
        tenant = await getTenantByClerkOrg(orgId);
      } else {
        await prisma.tenant.update({
          where: { id: candidate.id },
          data: { clerkOrgId: orgId },
        });
        tenant = await getTenantByClerkOrg(orgId);
      }
    }

    // Backfill Clerk publicMetadata if tenantId is missing or stale
    // (e.g. seed id from an earlier dev session).
    try {
      const clerk = await clerkClient();
      const org = await clerk.organizations.getOrganization({ organizationId: orgId });
      const currentMeta = org.publicMetadata?.tenantId as string | undefined;
      if (currentMeta !== tenant.id) {
        await clerk.organizations.updateOrganizationMetadata(orgId, {
          publicMetadata: { tenantId: tenant.id },
        });
      }
    } catch {
      // Non-critical: metadata backfill failed, tenant still works
    }

    return apiSuccess(sanitizeTenantResponse(tenant));
  } catch (err) {
    if (err instanceof NotFoundError) return apiError('Tenant not found', 404);
    console.error('[GET /api/tenants/me] failed', err);
    return apiError('Tenant lookup failed', 500);
  }
}
