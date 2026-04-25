import { NextRequest } from 'next/server';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';
import { sendDailyRecapEmail } from '@/lib/server/services/emailService';
import { zonedDateToUtc } from '@ringback/flow-engine';
import type { DailyRecapStats } from '@/lib/server/services/emailTemplates';

/**
 * Daily recap email. Sent every morning at the tenant's `dailyDigestHour`
 * with a one-glance summary of yesterday's activity:
 *   - missed calls handled
 *   - SMS conversations started
 *   - meetings booked / confirmed
 *   - orders completed + revenue
 *   - pending meetings still awaiting confirmation
 *
 * Reuses the `dailyDigestEnabled` / `dailyDigestHour` config so operators
 * configure their morning email window once and receive both the open-task
 * digest and the recap together.
 *
 * Auth: CRON_SECRET via `Authorization: Bearer <secret>`.
 */

function currentHourInTz(timezone: string): number {
  try {
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(new Date());
    return parseInt(hour, 10);
  } catch {
    return new Date().getUTCHours();
  }
}

/** Returns Y/M/D in the tenant TZ for the given Date. */
function ymdInTz(date: Date, timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Compute UTC bounds for "yesterday" (00:00 to 24:00) in the tenant TZ. */
function yesterdayBoundsInTz(now: Date, timezone: string): { start: Date; end: Date; label: string } {
  const today = ymdInTz(now, timezone);
  // Walk back one day in tenant TZ. Date arithmetic in JS handles month rollover.
  const todayStart = zonedDateToUtc(today.year, today.month, today.day, 0, 0, timezone);
  const start = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const end = todayStart;

  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(start);

  return { start, end, label };
}

function formatTimeLabel(scheduledAt: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .format(scheduledAt)
      .replace(/,/g, '');
  } catch {
    return scheduledAt.toISOString();
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  try {
    const configs = await prisma.tenantConfig.findMany({
      where: { dailyDigestEnabled: true, ownerEmail: { not: null } },
      select: {
        tenantId: true,
        timezone: true,
        dailyDigestHour: true,
      },
    });

    let sent = 0;
    let skipped = 0;
    let empty = 0;

    for (const cfg of configs) {
      if (currentHourInTz(cfg.timezone) !== cfg.dailyDigestHour) {
        skipped++;
        continue;
      }

      const { start, end, label } = yesterdayBoundsInTz(now, cfg.timezone);

      const [
        missedCalls,
        conversations,
        meetingsBooked,
        meetingsConfirmed,
        ordersAgg,
        pendingMeetings,
      ] = await Promise.all([
        prisma.missedCall.count({
          where: { tenantId: cfg.tenantId, occurredAt: { gte: start, lt: end } },
        }),
        prisma.conversation.count({
          where: { tenantId: cfg.tenantId, createdAt: { gte: start, lt: end } },
        }),
        prisma.meeting.count({
          where: { tenantId: cfg.tenantId, createdAt: { gte: start, lt: end } },
        }),
        prisma.meeting.count({
          where: { tenantId: cfg.tenantId, confirmedAt: { gte: start, lt: end } },
        }),
        prisma.order.aggregate({
          where: {
            tenantId: cfg.tenantId,
            status: 'COMPLETED',
            updatedAt: { gte: start, lt: end },
          },
          _count: { _all: true },
          _sum: { total: true },
        }),
        prisma.meeting.findMany({
          where: {
            tenantId: cfg.tenantId,
            status: 'CONFIRMED',
            scheduledAt: { gte: now },
            confirmationSentAt: { not: null },
            confirmedAt: null,
          },
          select: { guestName: true, callerPhone: true, scheduledAt: true },
          orderBy: { scheduledAt: 'asc' },
          take: 5,
        }),
      ]);

      const totalActivity =
        missedCalls + conversations + meetingsBooked + (ordersAgg._count._all ?? 0);
      if (totalActivity === 0 && pendingMeetings.length === 0) {
        empty++;
        continue;
      }

      const stats: DailyRecapStats = {
        date: label,
        missedCalls,
        conversations,
        meetingsBooked,
        meetingsConfirmed,
        ordersCompleted: ordersAgg._count._all ?? 0,
        ordersRevenue: Number(ordersAgg._sum.total ?? 0),
        pendingMeetings: pendingMeetings.map((m) => ({
          name: m.guestName,
          callerPhone: m.callerPhone,
          scheduledAt: m.scheduledAt ? formatTimeLabel(m.scheduledAt, cfg.timezone) : '',
        })),
      };

      const ok = await sendDailyRecapEmail(cfg.tenantId, stats);
      if (ok) sent++;
    }

    logger.info('Daily recap cron ran', { sent, skipped, empty, total: configs.length });
    return Response.json({ ok: true, sent, skipped, empty, considered: configs.length });
  } catch (err) {
    logger.error('Cron daily-recap failed', { err });
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
