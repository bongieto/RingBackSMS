import { auth, clerkClient } from '@clerk/nextjs/server';
import { apiSuccess, apiError } from '@/lib/server/response';
import { isSuperAdmin } from '@/lib/server/agency';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  try {
    const clerk = await clerkClient();
    const list = await clerk.users.getUserList({ limit: 100, orderBy: '-created_at' });
    const users = Array.isArray(list) ? list : (list as any).data ?? [];

    const rows = await Promise.all(
      users.map(async (u: any) => {
        let orgCount = 0;
        try {
          const memberships = await clerk.users.getOrganizationMembershipList({ userId: u.id });
          const anyM = memberships as any;
          orgCount = Array.isArray(anyM)
            ? anyM.length
            : typeof anyM.totalCount === 'number'
              ? anyM.totalCount
              : Array.isArray(anyM.data) ? anyM.data.length : 0;
        } catch {}
        const primaryEmail =
          u.emailAddresses?.find((e: any) => e.id === u.primaryEmailAddressId)?.emailAddress ??
          u.emailAddresses?.[0]?.emailAddress ??
          null;
        return {
          id: u.id,
          email: primaryEmail,
          name: [u.firstName, u.lastName].filter(Boolean).join(' ') || null,
          isAgency: Boolean((u.publicMetadata as any)?.isAgency),
          orgCount,
          createdAt: u.createdAt,
        };
      }),
    );

    return apiSuccess(rows);
  } catch (err) {
    console.error('[GET /api/admin/users] failed', err);
    return apiError('Failed to load users', 500);
  }
}
