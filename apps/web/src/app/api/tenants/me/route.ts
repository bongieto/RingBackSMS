import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getTenantByClerkOrg } from '@/lib/server/services/tenantService';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return apiError('Organization required', 401);
  try {
    const tenant = await getTenantByClerkOrg(orgId);
    return apiSuccess(tenant);
  } catch {
    return apiError('Tenant not found', 404);
  }
}
