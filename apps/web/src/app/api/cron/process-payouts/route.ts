import { NextRequest } from 'next/server';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';
import { createConnectTransfer } from '@/lib/server/services/billingService';

// $10 minimum, in cents
const MIN_PAYOUT_CENTS = 1000;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  // Current payout covers everything up to "now" — simplest model.
  // Previous month period [first of previous, last of previous] is a
  // reasonable window for display, but we pay out ALL pending commissions.
  const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const firstOfPrevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  const agencies = await prisma.agency.findMany({
    where: { stripeConnectOnboarded: true, stripeConnectAccountId: { not: null } },
  });

  const summary: Array<{
    agencyId: string;
    paid?: number;
    skipped?: boolean;
    error?: string;
  }> = [];

  for (const agency of agencies) {
    try {
      const pending = await prisma.commissionLedger.findMany({
        where: { agencyId: agency.id, status: 'PENDING' },
        select: { id: true, commissionAmountCents: true, currency: true },
      });
      if (pending.length === 0) {
        summary.push({ agencyId: agency.id, skipped: true });
        continue;
      }
      const total = pending.reduce((s, r) => s + r.commissionAmountCents, 0);
      const currency = pending[0].currency ?? 'usd';
      if (total < MIN_PAYOUT_CENTS) {
        summary.push({ agencyId: agency.id, skipped: true });
        continue;
      }

      // Create payout row first so we have an id to link commissions to.
      const payout = await prisma.payout.create({
        data: {
          agencyId: agency.id,
          amountCents: total,
          currency,
          periodStart: firstOfPrevMonth,
          periodEnd: firstOfThisMonth,
          status: 'PENDING',
        },
      });

      let transferId: string;
      try {
        transferId = await createConnectTransfer({
          destinationAccountId: agency.stripeConnectAccountId!,
          amountCents: total,
          currency,
          idempotencyKey: `payout:${agency.id}:${periodKey}`,
          metadata: {
            agencyId: agency.id,
            payoutId: payout.id,
            period: periodKey,
          },
        });
      } catch (err: any) {
        await prisma.payout.update({
          where: { id: payout.id },
          data: {
            status: 'FAILED',
            failureReason: err?.message ?? 'Transfer failed',
          },
        });
        summary.push({ agencyId: agency.id, error: err?.message ?? 'transfer failed' });
        continue;
      }

      // Mark payout paid and link all pending commissions.
      await prisma.$transaction([
        prisma.payout.update({
          where: { id: payout.id },
          data: {
            status: 'PAID',
            stripeTransferId: transferId,
            paidAt: new Date(),
          },
        }),
        prisma.commissionLedger.updateMany({
          where: { id: { in: pending.map((r) => r.id) } },
          data: {
            status: 'PAID',
            payoutId: payout.id,
            paidAt: new Date(),
          },
        }),
      ]);

      logger.info('[cron/process-payouts] payout succeeded', {
        agencyId: agency.id,
        amountCents: total,
        transferId,
      });
      summary.push({ agencyId: agency.id, paid: total });
    } catch (err: any) {
      logger.error('[cron/process-payouts] agency failed', {
        agencyId: agency.id,
        err: err?.message,
      });
      summary.push({ agencyId: agency.id, error: err?.message ?? 'unknown' });
    }
  }

  return Response.json({ ok: true, periodKey, summary });
}
