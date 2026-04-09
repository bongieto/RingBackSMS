import { auth, clerkClient } from '@clerk/nextjs/server';
import { apiSuccess, apiError } from '@/lib/server/response';
import { isSuperAdmin } from '@/lib/server/agency';
import { prisma } from '@/lib/server/db';
import { PLAN_MRR } from '@/lib/server/planPricing';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { userId } = await auth();
  if (!isSuperAdmin(userId)) return apiError('Forbidden', 403);

  const agencies = await prisma.agency.findMany({
    orderBy: { createdAt: 'desc' },
  });
  const ids = agencies.map((a) => a.id);
  if (ids.length === 0) {
    return apiSuccess([]);
  }

  // Backfill missing names from Clerk. Cheap: single getUser per agency
  // with a null name, and we persist so future reads skip this.
  const needsName = agencies.filter((a) => !a.name);
  if (needsName.length > 0) {
    try {
      const clerk = await clerkClient();
      await Promise.all(
        needsName.map(async (a) => {
          try {
            const user = await clerk.users.getUser(a.clerkUserId);
            const name =
              [user.firstName, user.lastName].filter(Boolean).join(' ') ||
              user.emailAddresses?.[0]?.emailAddress ||
              null;
            if (name) {
              a.name = name;
              await prisma.agency.update({
                where: { id: a.id },
                data: { name },
              });
            }
          } catch (err) {
            logger.warn('[admin/agencies] failed to backfill agency name', {
              agencyId: a.id,
              err,
            });
          }
        }),
      );
    } catch (err) {
      logger.warn('[admin/agencies] clerk client unavailable', { err });
    }
  }

  // Batch: one round-trip each for tenants, commissions, payouts.
  const [tenantRows, ledgerGroups, latestPayouts] = await Promise.all([
    prisma.tenant.findMany({
      where: { agencyId: { in: ids }, isActive: true },
      select: { agencyId: true, plan: true },
    }),
    prisma.commissionLedger.groupBy({
      by: ['agencyId', 'status'],
      where: { agencyId: { in: ids } },
      _sum: { commissionAmountCents: true },
    }),
    prisma.payout.findMany({
      where: { agencyId: { in: ids }, status: 'PAID' },
      select: { agencyId: true, paidAt: true },
      orderBy: { paidAt: 'desc' },
    }),
  ]);

  // Build per-agency lookup maps.
  const tenantsByAgency = new Map<string, { count: number; mrr: number }>();
  for (const t of tenantRows) {
    if (!t.agencyId) continue;
    const entry = tenantsByAgency.get(t.agencyId) ?? { count: 0, mrr: 0 };
    entry.count += 1;
    entry.mrr += PLAN_MRR[t.plan] ?? 0;
    tenantsByAgency.set(t.agencyId, entry);
  }

  const pendingByAgency = new Map<string, number>();
  const paidByAgency = new Map<string, number>();
  for (const g of ledgerGroups) {
    const amount = g._sum.commissionAmountCents ?? 0;
    if (g.status === 'PENDING') {
      pendingByAgency.set(g.agencyId, amount);
    } else if (g.status === 'PAID') {
      paidByAgency.set(g.agencyId, amount);
    }
  }

  // findMany already returned by paidAt desc — grab the first per agency.
  const lastPayoutByAgency = new Map<string, Date | null>();
  for (const p of latestPayouts) {
    if (!lastPayoutByAgency.has(p.agencyId) && p.paidAt) {
      lastPayoutByAgency.set(p.agencyId, p.paidAt);
    }
  }

  const rows = agencies.map((a) => {
    const t = tenantsByAgency.get(a.id) ?? { count: 0, mrr: 0 };
    const pending = pendingByAgency.get(a.id) ?? 0;
    const paid = paidByAgency.get(a.id) ?? 0;
    return {
      id: a.id,
      clerkUserId: a.clerkUserId,
      name: a.name,
      defaultRevSharePct: Number(a.defaultRevSharePct),
      stripeConnectAccountId: a.stripeConnectAccountId,
      stripeConnectOnboarded: a.stripeConnectOnboarded,
      tenantCount: t.count,
      portfolioMrrDollars: t.mrr,
      pendingCents: pending,
      paidCents: paid,
      lifetimeCents: pending + paid,
      lastPayoutAt: lastPayoutByAgency.get(a.id) ?? null,
    };
  });

  return apiSuccess(rows);
}
