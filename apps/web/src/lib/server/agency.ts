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
    // Clerk SDK may return a paginated object { data, totalCount } or a plain array.
    const anyM = memberships as unknown as { totalCount?: number; data?: unknown[] } | unknown[];
    if (Array.isArray(anyM)) return anyM.length;
    if (typeof anyM.totalCount === 'number') return anyM.totalCount;
    if (Array.isArray(anyM.data)) return anyM.data.length;
    return 0;
  } catch {
    return 0;
  }
}
