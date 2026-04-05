import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { apiError } from './response';

export interface AuthContext {
  userId: string;
  orgId: string | null;
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
 * Verifies super-admin access. Returns userId or error response.
 */
export async function requireSuperAdmin(): Promise<string | NextResponse> {
  const { userId } = await auth();
  if (!userId) return apiError('Authentication required', 401);
  const adminId = process.env.SUPER_ADMIN_USER_ID?.trim();
  if (adminId && userId !== adminId) return apiError('Forbidden', 403);
  return userId;
}

export function isNextResponse(val: unknown): val is NextResponse {
  return val instanceof NextResponse;
}
