import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getTenantByClerkOrg } from '@/lib/server/services/tenantService';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return apiError('Organization required', 401);
  try {
    const tenant = await getTenantByClerkOrg(orgId);

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
