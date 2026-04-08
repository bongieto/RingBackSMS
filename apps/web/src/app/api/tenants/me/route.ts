import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getTenantByClerkOrg } from '@/lib/server/services/tenantService';
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
      if (!metaTenantId) throw err;
      const orphan = await prisma.tenant.findUnique({ where: { id: metaTenantId } });
      if (!orphan) throw err;
      if (orphan.clerkOrgId && orphan.clerkOrgId !== orgId) throw err;
      if (!orphan.clerkOrgId) {
        await prisma.tenant.update({
          where: { id: orphan.id },
          data: { clerkOrgId: orgId },
        });
      }
      tenant = await getTenantByClerkOrg(orgId);
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

    return apiSuccess(tenant);
  } catch {
    return apiError('Tenant not found', 404);
  }
}
