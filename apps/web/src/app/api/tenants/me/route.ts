import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getTenantByClerkOrg } from '@/lib/server/services/tenantService';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return apiError('Organization required', 401);
  try {
    const tenant = await getTenantByClerkOrg(orgId);

    // Backfill Clerk publicMetadata if tenantId is not set
    try {
      const clerk = await clerkClient();
      const org = await clerk.organizations.getOrganization({ organizationId: orgId });
      if (!org.publicMetadata?.tenantId) {
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
