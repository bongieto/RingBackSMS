import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { apiError } from './response';
import { prisma } from './db';
import { isSuperAdmin } from './agency';

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

/**
 * Super-admin gate for the /admin/bot-tester surface. We don't have a
 * proper role model yet (tenant owners are the highest real role) so
 * this is an env-var allowlist of Clerk user IDs.
 *
 * Configure via `BOT_TESTER_ADMIN_IDS` — comma-separated Clerk user IDs.
 * Returns false (deny) when the env var is unset so prod stays locked
 * down until explicitly enabled.
 */
export function isBotTesterAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  // Primary gate: platform super-admin (same SUPER_ADMIN_CLERK_USER_ID
  // the /admin/* layout enforces). Anyone allowed into /admin is
  // allowed here.
  if (isSuperAdmin(userId)) return true;
  // Optional extra allowlist for collaborators who should be able to
  // use the bot tester without being the platform super-admin.
  const raw = process.env.BOT_TESTER_ADMIN_IDS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

/**
 * Async wrapper — reads the current Clerk auth and checks against the
 * allowlist. Use from server components + route handlers where you have
 * no userId in hand yet.
 */
export async function requireBotTesterAdmin(): Promise<AuthContext | NextResponse> {
  const { userId, orgId } = await auth();
  if (!userId || !isBotTesterAdmin(userId)) {
    // Return a 404 rather than 403 — we don't want to hint that the
    // admin route exists to unauthorized callers.
    return new NextResponse('Not Found', { status: 404 });
  }
  return { userId, orgId: orgId ?? null };
}
