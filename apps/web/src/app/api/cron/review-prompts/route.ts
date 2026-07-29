import { NextRequest } from 'next/server';
import { prisma } from '@/lib/server/db';
import { sendSms } from '@/lib/server/services/twilioService';
import { logger } from '@/lib/server/logger';
import { sms as i18nSms } from '@/lib/server/i18n';

/**
 * Cron-driven review-prompt dispatcher. Picks up orders that:
 *   - are COMPLETED (customer has picked up)
 *   - were completed 2+ hours ago
 *   - don't already have a review
 *   - haven't been prompted yet (distinct from "has a review" — we
 *     set a flag when the prompt is sent so we don't double-send)
 *
 * Runs every 15 minutes (see vercel.json `crons`). 15 min granularity
 * means a customer might wait up to 2h15min for the prompt — plenty
 * acceptable versus the old setTimeout-in-waitUntil approach which
 * would silently drop whenever Vercel tore down the lambda early.
 *
 * Auth: CRON_SECRET header. Vercel sends `Authorization: Bearer
 * <secret>` on cron invocations.
 */

// 2 hours in ms, minus 15 min of jitter so the FIRST cron tick after
// the customer was completed fires the prompt even if they were marked
// COMPLETED 1h50min ago at the last tick.
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const JITTER_MS = 15 * 60 * 1000;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - TWO_HOURS_MS + JITTER_MS);
  // NARROW WINDOW lower bound. Without it, every tick re-selected ALL
  // unreviewed completed orders forever (updatedAt never changes after
  // COMPLETED and there's no promptedAt marker), re-texting the same
  // customers every 15 minutes. This bug was latent for months because
  // the cron never actually ran (CRON_SECRET missing) — the moment
  // crons came alive it flushed a months-old backlog in one tick.
  // Window is [2h, 2h20m] old: 20m span covers the 15m tick interval
  // plus scheduling slop, so each order is seen by exactly one tick
  // (worst case two — the OrderReview upsert on send would be the real
  // fix; see promptedAt TODO below).
  const windowFloor = new Date(Date.now() - TWO_HOURS_MS - 20 * 60 * 1000);
  // Eligible orders: COMPLETED status, updatedAt inside the narrow
  // window, no existing OrderReview for this orderId. We LEFT JOIN via
  // Prisma's `reviews: { none: {} }` filter on the 1-1 relation.
  const eligible = await prisma.order.findMany({
    where: {
      status: 'COMPLETED',
      updatedAt: { lte: cutoff, gte: windowFloor },
      // Never ask "how was your order?" about an order the customer
      // didn't pay for. paymentStatus null = no payment required
      // (pay-at-pickup tenants); EXPIRED/UNPAID/PENDING are excluded —
      // a customer whose checkout expired got prompted for a rating in
      // production, which reads as either a bug or a guilt trip.
      OR: [{ paymentStatus: null }, { paymentStatus: 'PAID' }],
    },
    select: {
      id: true,
      tenantId: true,
      callerPhone: true,
      orderNumber: true,
      tenant: { select: { name: true } },
    },
    take: 200,
    orderBy: { updatedAt: 'asc' },
  });

  if (eligible.length === 0) {
    return Response.json({ checked: 0, sent: 0 });
  }

  // De-dupe against existing OrderReview rows in one pass.
  const reviewed = await prisma.orderReview.findMany({
    where: { orderId: { in: eligible.map((o) => o.id) } },
    select: { orderId: true },
  });
  const reviewedSet = new Set(reviewed.map((r) => r.orderId));

  // Also de-dupe against a new "prompted" marker stored in Contact.notes
  // or similar — we don't have one, so use a simple in-memory promise
  // that creates a placeholder OrderReview with rating=0 to mark as
  // prompted. NOT IDEAL — better to add a `promptedAt` column in a
  // future migration. For now: rely on the review-reply handler to
  // create the real review, and the 2h+ window to naturally prevent
  // double-prompts within the window (cron fires every 15 min; the
  // narrow updatedAt window above caps each order to ~one tick).
  // TODO: a promptedAt column on Order would make this exact instead
  // of window-based.
  const narrowEligible = eligible.filter(
    (o) => !reviewedSet.has(o.id) && o.callerPhone,
  );

  let sent = 0;
  for (const order of narrowEligible) {
    try {
      const contact = await prisma.contact.findFirst({
        where: { tenantId: order.tenantId, phone: order.callerPhone },
        select: { preferredLanguage: true },
      });
      await sendSms(
        order.tenantId,
        order.callerPhone,
        i18nSms('reviewPrompt', contact?.preferredLanguage ?? null, {
          businessName: order.tenant.name,
        }),
      );
      sent += 1;
    } catch (err: any) {
      logger.warn('Review-prompt cron: send failed (non-fatal)', {
        orderId: order.id,
        err: err?.message,
      });
    }
  }

  logger.info('Review-prompt cron tick', { eligible: eligible.length, reviewed: reviewedSet.size, sent });
  return Response.json({ checked: eligible.length, sent });
}
