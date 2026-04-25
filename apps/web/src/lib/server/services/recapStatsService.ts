// Shared aggregator for the daily recap email — used by the hourly cron
// (real recap) and the B4 "send preview" route (operator-triggered test
// from Settings). Same SQL either way; the only difference is whether
// today's tenant-local date gets stamped on TenantConfig afterwards.

import { prisma } from '../db';
import { zonedDateToUtc } from '@ringback/flow-engine';
import type { DailyRecapStats } from './emailTemplates';

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

/** "YYYY-MM-DD" string in the tenant's TZ for `date`. Used as the
 *  idempotency key on `TenantConfig.dailyRecapLastSentDate`. */
export function tzLocalDateString(date: Date, timezone: string): string {
  const { year, month, day } = ymdInTz(date, timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** UTC bounds for "yesterday" (00:00 to 24:00) in the tenant TZ. */
export function yesterdayBoundsInTz(
  now: Date,
  timezone: string,
): { start: Date; end: Date; label: string } {
  const today = ymdInTz(now, timezone);
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

/**
 * Aggregate yesterday's recap stats for one tenant. Returns null when
 * the tenant had zero activity AND no pending unconfirmed meetings —
 * the cron uses this to skip silent recaps. The preview route ignores
 * the null and sends the empty recap anyway so operators can see what
 * the email looks like.
 */
export async function buildRecapStats(
  tenantId: string,
  timezone: string,
  now: Date = new Date(),
): Promise<{ stats: DailyRecapStats; hasActivity: boolean }> {
  const { start, end, label } = yesterdayBoundsInTz(now, timezone);

  const [
    missedCalls,
    conversations,
    meetingsBooked,
    meetingsConfirmed,
    ordersAgg,
    pendingMeetings,
  ] = await Promise.all([
    prisma.missedCall.count({
      where: { tenantId, occurredAt: { gte: start, lt: end } },
    }),
    prisma.conversation.count({
      where: { tenantId, createdAt: { gte: start, lt: end } },
    }),
    prisma.meeting.count({
      where: { tenantId, createdAt: { gte: start, lt: end } },
    }),
    prisma.meeting.count({
      where: { tenantId, confirmedAt: { gte: start, lt: end } },
    }),
    prisma.order.aggregate({
      where: {
        tenantId,
        status: 'COMPLETED',
        updatedAt: { gte: start, lt: end },
      },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.meeting.findMany({
      where: {
        tenantId,
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

  const ordersCompleted = ordersAgg._count._all ?? 0;
  const totalActivity = missedCalls + conversations + meetingsBooked + ordersCompleted;
  const hasActivity = totalActivity > 0 || pendingMeetings.length > 0;

  const stats: DailyRecapStats = {
    date: label,
    missedCalls,
    conversations,
    meetingsBooked,
    meetingsConfirmed,
    ordersCompleted,
    ordersRevenue: Number(ordersAgg._sum.total ?? 0),
    pendingMeetings: pendingMeetings.map((m) => ({
      name: m.guestName,
      callerPhone: m.callerPhone,
      scheduledAt: m.scheduledAt ? formatTimeLabel(m.scheduledAt, timezone) : '',
    })),
  };

  return { stats, hasActivity };
}
