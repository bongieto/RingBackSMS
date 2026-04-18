import { NextRequest } from 'next/server';
import { prisma } from '@/lib/server/db';
import { createOrder } from '@/lib/server/services/orderService';
import { sendSms } from '@/lib/server/services/twilioService';
import { logger } from '@/lib/server/logger';

/**
 * Daily cron endpoint that advances every active RecurringOrder whose
 * `nextRunAt` has elapsed. Creates a fresh Order from the stashed items,
 * SMS-confirms the customer, and schedules the next run (naive +7 days
 * for now — proper cron-expression scheduling is a v2).
 *
 * Auth: CRON_SECRET header. Vercel cron sends `Authorization: Bearer
 * <secret>`; other hosts should pass the same.
 *
 * This endpoint is not yet wired to a scheduler — document in
 * vercel.json or run manually during testing.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (secret && !auth.endsWith(secret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.recurringOrder.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    take: 200,
    orderBy: { nextRunAt: 'asc' },
  });

  let created = 0;
  let skipped = 0;
  for (const r of due) {
    try {
      const items = Array.isArray(r.itemsJson)
        ? (r.itemsJson as unknown as Array<{
            menuItemId: string;
            name: string;
            quantity: number;
            price: number;
          }>)
        : [];
      if (items.length === 0) {
        skipped += 1;
        continue;
      }

      // Need a Conversation row for the Order — cheapest path is to
      // create one inline tagged as a recurring-order origin.
      const conv = await prisma.conversation.create({
        data: {
          tenantId: r.tenantId,
          callerPhone: r.callerPhone,
          flowType: 'ORDER',
        },
      });

      const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
      await createOrder({
        tenantId: r.tenantId,
        conversationId: conv.id,
        callerPhone: r.callerPhone,
        items,
        total,
        pickupTime: r.pickupTime,
        notes: `Recurring: ${r.label ?? r.cadence}`,
      });

      await sendSms(
        r.tenantId,
        r.callerPhone,
        `Your recurring order (${r.label ?? 'usual'}) is placed. Pickup: ${r.pickupTime ?? 'TBD'}. Reply STOP to cancel future runs.`,
      ).catch(() => {});

      // Naive +7d next run. Real cron-expression support lands later.
      const nextRunAt = new Date(r.nextRunAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      await prisma.recurringOrder.update({
        where: { id: r.id },
        data: { lastRunAt: now, nextRunAt },
      });
      created += 1;
    } catch (err: any) {
      skipped += 1;
      logger.warn('Recurring order run failed', { err: err?.message, id: r.id });
    }
  }

  logger.info('Recurring order cron tick', { due: due.length, created, skipped });
  return Response.json({ due: due.length, created, skipped });
}
