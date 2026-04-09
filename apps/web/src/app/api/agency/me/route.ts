import { auth } from '@clerk/nextjs/server';
import { apiSuccess, apiError } from '@/lib/server/response';
import { isAgencyUser, isSuperAdmin } from '@/lib/server/agency';
import { ensureAgencyForUser } from '@/lib/server/services/agencyService';
import { prisma } from '@/lib/server/db';
import { getConnectAccount } from '@/lib/server/services/billingService';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  if (!isSuperAdmin(userId) && !(await isAgencyUser(userId))) {
    return apiError('Not an agency', 403);
  }

  try {
    const agency = await ensureAgencyForUser(userId);

    // Refresh Connect status from Stripe if we have an account id.
    let bankLast4: string | null = null;
    if (agency.stripeConnectAccountId) {
      try {
        const acct = await getConnectAccount(agency.stripeConnectAccountId);
        bankLast4 = acct.bankLast4 ?? null;
        const onboarded = acct.detailsSubmitted && acct.payoutsEnabled;
        if (onboarded !== agency.stripeConnectOnboarded) {
          await prisma.agency.update({
            where: { id: agency.id },
            data: { stripeConnectOnboarded: onboarded },
          });
          agency.stripeConnectOnboarded = onboarded;
        }
      } catch (err) {
        logger.warn('[GET /api/agency/me] Connect status refresh failed', {
          err,
        });
      }
    }

    // Aggregate dashboard stats.
    const [tenantCount, pendingSum, paidSum, lifetimeCommissions] =
      await Promise.all([
        prisma.tenant.count({ where: { agencyId: agency.id } }),
        prisma.commissionLedger.aggregate({
          where: { agencyId: agency.id, status: 'PENDING' },
          _sum: { commissionAmountCents: true },
        }),
        prisma.commissionLedger.aggregate({
          where: { agencyId: agency.id, status: 'PAID' },
          _sum: { commissionAmountCents: true },
        }),
        prisma.commissionLedger.aggregate({
          where: { agencyId: agency.id },
          _sum: { commissionAmountCents: true },
        }),
      ]);

    return apiSuccess({
      id: agency.id,
      name: agency.name,
      defaultRevSharePct: Number(agency.defaultRevSharePct),
      stripeConnectAccountId: agency.stripeConnectAccountId,
      stripeConnectOnboarded: agency.stripeConnectOnboarded,
      bankLast4,
      stats: {
        tenantCount,
        pendingCents: pendingSum._sum.commissionAmountCents ?? 0,
        paidCents: paidSum._sum.commissionAmountCents ?? 0,
        lifetimeCents: lifetimeCommissions._sum.commissionAmountCents ?? 0,
      },
    });
  } catch (err: any) {
    logger.error('[GET /api/agency/me] failed', { err: err?.message });
    return apiError('Failed to load agency', 500);
  }
}
