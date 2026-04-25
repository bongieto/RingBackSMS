import { NextRequest } from 'next/server';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';
import { sendDailyRecapEmail } from '@/lib/server/services/emailService';
import { buildRecapStats, tzLocalDateString } from '@/lib/server/services/recapStatsService';

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
 * Idempotency: stamps `dailyRecapLastSentDate` (tenant-local YYYY-MM-DD)
 * after a successful send. A Vercel cron retry, a clock skew, or a tz
 * boundary edge case re-firing the cron in the same hour will see the
 * stamp matches today and skip the tenant. Stat aggregation (the costly
 * part) only runs once we've passed the date guard.
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
        dailyRecapLastSentDate: true,
      },
    });

    let sent = 0;
    let skipped = 0;
    let empty = 0;
    let alreadySent = 0;

    for (const cfg of configs) {
      if (currentHourInTz(cfg.timezone) !== cfg.dailyDigestHour) {
        skipped++;
        continue;
      }

      const todayLocal = tzLocalDateString(now, cfg.timezone);
      if (cfg.dailyRecapLastSentDate === todayLocal) {
        alreadySent++;
        continue;
      }

      const { stats, hasActivity } = await buildRecapStats(cfg.tenantId, cfg.timezone, now);
      if (!hasActivity) {
        empty++;
        continue;
      }

      const ok = await sendDailyRecapEmail(cfg.tenantId, stats);
      if (ok) {
        sent++;
        await prisma.tenantConfig
          .update({
            where: { tenantId: cfg.tenantId },
            data: { dailyRecapLastSentDate: todayLocal },
          })
          .catch((err) =>
            logger.warn('Daily recap idempotency stamp failed (non-fatal)', {
              tenantId: cfg.tenantId,
              err: (err as Error).message,
            }),
          );
      }
    }

    logger.info('Daily recap cron ran', {
      sent,
      skipped,
      empty,
      alreadySent,
      total: configs.length,
    });
    return Response.json({
      ok: true,
      sent,
      skipped,
      empty,
      alreadySent,
      considered: configs.length,
    });
  } catch (err) {
    logger.error('Cron daily-recap failed', { err });
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
