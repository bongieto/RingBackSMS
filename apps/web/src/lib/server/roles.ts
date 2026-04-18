import { auth } from '@clerk/nextjs/server';
import { TenantMemberRole } from '@prisma/client';
import { prisma } from './db';

/**
 * Role resolution for a (user, tenant) pair. Reads from TenantMember
 * first; if no explicit row exists, falls back to a sensible default so
 * we don't lock out operators who haven't run a role assignment yet:
 *
 *   Clerk org admin → OWNER (full access)
 *   Clerk basic member → MEMBER (read-only by default)
 *
 * New hires invited through Clerk land as basic_members, i.e. MEMBER.
 * The operator can upgrade them to KITCHEN / MANAGER in settings.
 */
export async function resolveTenantRole(
  clerkUserId: string,
  clerkOrgRole: string | null | undefined,
  tenantId: string,
): Promise<TenantMemberRole> {
  const membership = await prisma.tenantMember.findUnique({
    where: { tenantId_clerkUserId: { tenantId, clerkUserId } },
    select: { role: true },
  });
  if (membership) return membership.role;

  const isAdmin = clerkOrgRole === 'admin' || clerkOrgRole === 'org:admin';
  return isAdmin ? TenantMemberRole.OWNER : TenantMemberRole.MEMBER;
}

/**
 * Helper that combines Clerk auth + tenant resolution + role lookup.
 * Returns null on any auth/access failure so callers can redirect.
 */
export async function getCurrentRole(): Promise<
  | { tenantId: string; role: TenantMemberRole; userId: string; orgId: string }
  | null
> {
  const { userId, orgId, orgRole } = await auth();
  if (!userId || !orgId) return null;
  const tenant = await prisma.tenant.findFirst({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });
  if (!tenant) return null;
  const role = await resolveTenantRole(userId, orgRole, tenant.id);
  return { tenantId: tenant.id, role, userId, orgId };
}

/** Which roles can access which route groups. Keep in sync with sidebar. */
export const ROUTE_ACCESS: Record<TenantMemberRole, (path: string) => boolean> = {
  [TenantMemberRole.OWNER]: () => true,
  [TenantMemberRole.MANAGER]: () => true,
  [TenantMemberRole.KITCHEN]: (path) =>
    path === '/dashboard' ||
    path.startsWith('/dashboard/kitchen') ||
    path.startsWith('/dashboard/orders') ||
    path.startsWith('/dashboard/tasks'),
  [TenantMemberRole.VIEWER]: (path) =>
    path === '/dashboard' ||
    path.startsWith('/dashboard/orders') ||
    path.startsWith('/dashboard/conversations') ||
    path.startsWith('/dashboard/contacts') ||
    path.startsWith('/dashboard/analytics') ||
    path.startsWith('/dashboard/revenue'),
  [TenantMemberRole.MEMBER]: (path) =>
    path === '/dashboard' ||
    path.startsWith('/dashboard/orders') ||
    path.startsWith('/dashboard/kitchen'),
};

export function canAccessRoute(role: TenantMemberRole, path: string): boolean {
  return ROUTE_ACCESS[role](path);
}

/** Sidebar gating — true means "show this item to this role". */
export function canSeeNav(role: TenantMemberRole, href: string): boolean {
  return canAccessRoute(role, href);
}

/** Is this role allowed to manage TenantMembers? Only owners/managers. */
export function canManageMembers(role: TenantMemberRole): boolean {
  return role === TenantMemberRole.OWNER || role === TenantMemberRole.MANAGER;
}
