import { auth } from '@clerk/nextjs/server';
import { apiSuccess, apiError } from '@/lib/server/response';
import { isAgencyUser, isSuperAdmin } from '@/lib/server/agency';
import { ensureAgencyForUser } from '@/lib/server/services/agencyService';
import { prisma } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  if (!isSuperAdmin(userId) && !(await isAgencyUser(userId))) {
    return apiError('Not an agency', 403);
  }

  const agency = await ensureAgencyForUser(userId);

  const tenants = await prisma.tenant.findMany({
    where: { agencyId: agency.id },
    select: {
      id: true,
      name: true,
      businessType: true,
      plan: true,
      isActive: true,
      createdAt: true,
      stripeSubscriptionId: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Aggregate commission totals per tenant for "Your cut / lifetime".
  const totals = await prisma.commissionLedger.groupBy({
    by: ['tenantId'],
    where: { agencyId: agency.id },
    _sum: { commissionAmountCents: true },
  });
  const totalByTenant = new Map(
    totals.map((t) => [t.tenantId, t._sum.commissionAmountCents ?? 0]),
  );

  return apiSuccess(
    tenants.map((t) => ({
      ...t,
      lifetimeCommissionCents: totalByTenant.get(t.id) ?? 0,
    })),
  );
}
