import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { apiError } from './response';
import { prisma } from './db';

export interface AuthContext {
  userId: string;
  orgId: string | null;
}

export interface TenantAuthContext {
  userId: string;
  orgId: string;
  tenantId: string;
}

/**
 * Verifies Clerk auth. Returns AuthContext or a 401 NextResponse.
 */
export async function requireAuth(): Promise<AuthContext | NextResponse> {
  const { userId, orgId } = await auth();
  if (!userId) {
    return apiError('Authentication required', 401);
  }
  return { userId, orgId: orgId ?? null };
}

/**
 * Verifies Clerk auth + org membership. Returns AuthContext or error response.
 */
export async function requireOrgAuth(): Promise<AuthContext | NextResponse> {
  const { userId, orgId } = await auth();
  if (!userId) return apiError('Authentication required', 401);
  if (!orgId) return apiError('Organization membership required', 401);
  return { userId, orgId };
}

/**
 * Verifies authenticated user has access to the given tenantId.
 * Checks that the tenant's clerkOrgId matches the user's orgId.
 * Returns TenantAuthContext or an error NextResponse.
 */
export async function verifyTenantAccess(tenantId: string): Promise<TenantAuthContext | NextResponse> {
  const { userId, orgId } = await auth();
  if (!userId) return apiError('Authentication required', 401);
  if (!orgId) return apiError('Organization membership required', 401);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { clerkOrgId: true },
  });

  if (!tenant || tenant.clerkOrgId !== orgId) {
    return apiError('Forbidden', 403);
  }

  return { userId, orgId, tenantId };
}

export function isNextResponse(val: unknown): val is NextResponse {
  return val instanceof NextResponse;
}
