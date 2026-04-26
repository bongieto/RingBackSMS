import { clerkClient } from '@clerk/nextjs/server';

/**
 * Returns true if the Clerk user has been granted agency access
 * (publicMetadata.isAgency === true). Agency users may own more than
 * one organization/tenant. Toggled by super admins via /admin/users.
 */
export async function isAgencyUser(userId: string): Promise<boolean> {
  try {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    return Boolean((user.publicMetadata as Record<string, unknown> | null)?.isAgency);
  } catch {
    return false;
  }
}

export function isSuperAdmin(userId: string | null | undefined): boolean {
  const adminId = process.env.SUPER_ADMIN_CLERK_USER_ID?.trim();
  return Boolean(adminId && userId && userId === adminId);
}

/**
 * Count the Clerk organizations the user is a member of.
 */
export async function countUserOrganizations(userId: string): Promise<number> {
  try {
    const clerk = await clerkClient();
    const memberships = await clerk.users.getOrganizationMembershipList({ userId });
    const anyM = memberships as unknown as { totalCount?: number; data?: unknown[] } | unknown[];
    const list: unknown[] = Array.isArray(anyM) ? anyM : (Array.isArray((anyM as any).data) ? (anyM as any).data : []);
    // Collect org IDs where the user is an admin (orgs they created/own).
    const adminOrgIds = list
      .filter((m: any) => m.role === 'org:admin')
      .map((m: any) => m.organization?.id)
      .filter(Boolean) as string[];
    if (adminOrgIds.length === 0) return 0;
    // Only count orgs that already have a tenant record in our DB.
    // An admin org with no tenant means the webhook stub never arrived —
    // the user should be allowed to complete their first onboarding.
    const { prisma } = await import('@/lib/server/db');
    const count = await prisma.tenant.count({
      where: { clerkOrgId: { in: adminOrgIds } },
    });
    return count;
  } catch {
    return 0;
  }
}
