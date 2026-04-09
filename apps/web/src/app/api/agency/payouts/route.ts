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
  const payouts = await prisma.payout.findMany({
    where: { agencyId: agency.id },
    orderBy: { createdAt: 'desc' },
  });

  return apiSuccess(
    payouts.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      currency: p.currency,
      status: p.status,
      stripeTransferId: p.stripeTransferId,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
      failureReason: p.failureReason,
    })),
  );
}
