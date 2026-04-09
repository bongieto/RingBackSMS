import { auth, clerkClient } from '@clerk/nextjs/server';
import { apiSuccess, apiError } from '@/lib/server/response';
import { isSuperAdmin } from '@/lib/server/agency';
import { prisma } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  try {
    const clerk = await clerkClient();
    const list = await clerk.users.getUserList({ limit: 100, orderBy: '-created_at' });
    const users = Array.isArray(list) ? list : (list as any).data ?? [];

    // Batch-load every Agency row keyed by clerkUserId so we can merge
    // rev-share % and Stripe Connect status into the listing.
    const agencies = await prisma.agency.findMany({
      where: { clerkUserId: { in: users.map((u: any) => u.id) } },
    });
    const agencyByUser = new Map(agencies.map((a) => [a.clerkUserId, a]));

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
        const agency = agencyByUser.get(u.id);
        return {
          id: u.id,
          email: primaryEmail,
          name: [u.firstName, u.lastName].filter(Boolean).join(' ') || null,
          isAgency: Boolean((u.publicMetadata as any)?.isAgency),
          orgCount,
          createdAt: u.createdAt,
          agencyId: agency?.id ?? null,
          defaultRevSharePct: agency ? Number(agency.defaultRevSharePct) : null,
          stripeConnectOnboarded: agency?.stripeConnectOnboarded ?? false,
        };
      }),
    );

    return apiSuccess(rows);
  } catch (err) {
    console.error('[GET /api/admin/users] failed', err);
    return apiError('Failed to load users', 500);
  }
}
