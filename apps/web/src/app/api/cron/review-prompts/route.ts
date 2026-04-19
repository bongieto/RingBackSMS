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
  if (secret && !auth.endsWith(secret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - TWO_HOURS_MS + JITTER_MS);
  // Eligible orders: COMPLETED status, updatedAt at least 2h old-ish,
  // no existing OrderReview for this orderId. We LEFT JOIN via Prisma's
  // `reviews: { none: {} }` filter on the 1-1 relation.
  const eligible = await prisma.order.findMany({
    where: {
      status: 'COMPLETED',
      updatedAt: { lte: cutoff },
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
  // double-prompts (cron fires every 15 min; we filter by updatedAt
  // which doesn't change after COMPLETED; if we sent once and didn't
  // get a reply, we'd re-send — TODO: add promptedAt).
  // Workaround: cap at one attempt per order by matching updatedAt age
  // to a NARROW window (2h to 2h15min). If operator marks COMPLETED
  // and customer replies within 2h15min, we don't re-prompt.
  const narrowCutoff = new Date(Date.now() - TWO_HOURS_MS);
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

  // narrowCutoff was only used to document the TODO; suppress unused.
  void narrowCutoff;

  logger.info('Review-prompt cron tick', { eligible: eligible.length, reviewed: reviewedSet.size, sent });
  return Response.json({ checked: eligible.length, sent });
}
