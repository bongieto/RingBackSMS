import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { apiSuccess, apiError } from '@/lib/server/response';
import { isAgencyUser, isSuperAdmin } from '@/lib/server/agency';
import { ensureAgencyForUser } from '@/lib/server/services/agencyService';
import { prisma } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  if (!isSuperAdmin(userId) && !(await isAgencyUser(userId))) {
    return apiError('Not an agency', 403);
  }

  const agency = await ensureAgencyForUser(userId);
  const statusParam = req.nextUrl.searchParams.get('status')?.toUpperCase();
  const status =
    statusParam === 'PENDING' || statusParam === 'PAID' ? statusParam : undefined;

  const rows = await prisma.commissionLedger.findMany({
    where: { agencyId: agency.id, ...(status ? { status } : {}) },
    include: { tenant: { select: { id: true, name: true, plan: true } } },
    orderBy: { accruedAt: 'desc' },
    take: 200,
  });

  return apiSuccess(
    rows.map((r) => ({
      id: r.id,
      tenant: r.tenant,
      invoiceAmountCents: r.invoiceAmountCents,
      commissionPct: Number(r.commissionPct),
      commissionAmountCents: r.commissionAmountCents,
      currency: r.currency,
      status: r.status,
      accruedAt: r.accruedAt,
      paidAt: r.paidAt,
    })),
  );
}
