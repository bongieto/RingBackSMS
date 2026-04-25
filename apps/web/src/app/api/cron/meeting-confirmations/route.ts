import { NextRequest } from 'next/server';
import { prisma } from '@/lib/server/db';
import { sendSms } from '@/lib/server/services/twilioService';
import { logger } from '@/lib/server/logger';
import { sms as i18nSms } from '@/lib/server/i18n';

/**
 * Day-before confirmation SMS. Service-business no-shows are typically
 * 15–30%; a "Reply C to confirm or R to reschedule" SMS the day before
 * pulls that down to ~5%.
 *
 * Runs hourly (`0 * * * *`). On each tick:
 *   1. Pick CONFIRMED meetings whose scheduledAt is between 22 and 26
 *      hours from now AND confirmationSentAt is null. Cap at 200/run.
 *   2. For each, only send when the *current* time in the tenant's
 *      timezone is between 9am–9pm — avoids 3am pings to the customer.
 *   3. Send the prompt, stamp confirmationSentAt so we don't double-send
 *      on a later tick.
 *
 * The reply path (twilio sms-reply webhook) consumes "C"/"yes"/"R"/etc.
 * via tryConsumeMeetingConfirmReply in schedulingService.
 *
 * Auth: CRON_SECRET header (Vercel sends `Authorization: Bearer <secret>`).
 */

const TWENTY_TWO_HOURS_MS = 22 * 60 * 60 * 1000;
const TWENTY_SIX_HOURS_MS = 26 * 60 * 60 * 1000;

/** Returns the current hour-of-day in `timezone`. NaN-safe (returns -1 on parse failure). */
function hourInTz(now: Date, timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const value = fmt.formatToParts(now).find((p) => p.type === 'hour')?.value;
    const hour = Number(value);
    return Number.isFinite(hour) ? hour : -1;
  } catch {
    return -1;
  }
}

/** Format the scheduledAt instant in the tenant's TZ, e.g. "Mon Apr 27 at 9:00 AM". */
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
      .replace(/,/g, '')
      .replace(/(\d) (AM|PM)/, '$1 $2');
  } catch {
    return scheduledAt.toISOString();
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (secret && !auth.endsWith(secret)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const lowerBound = new Date(now.getTime() + TWENTY_TWO_HOURS_MS);
  const upperBound = new Date(now.getTime() + TWENTY_SIX_HOURS_MS);

  // Eligible: CONFIRMED, scheduled in the 22–26h window, no confirmation
  // SMS sent yet, has a valid callerPhone, and tenant config is loadable
  // (we need the timezone).
  const eligible = await prisma.meeting.findMany({
    where: {
      status: 'CONFIRMED',
      confirmationSentAt: null,
      scheduledAt: { gte: lowerBound, lte: upperBound },
      callerPhone: { not: '' },
    },
    select: {
      id: true,
      tenantId: true,
      callerPhone: true,
      scheduledAt: true,
      tenant: {
        select: { name: true, config: { select: { timezone: true } } },
      },
    },
    take: 200,
    orderBy: { scheduledAt: 'asc' },
  });

  if (eligible.length === 0) {
    return Response.json({ checked: 0, sent: 0, deferred: 0 });
  }

  let sent = 0;
  let deferred = 0;

  for (const m of eligible) {
    const tz = m.tenant.config?.timezone ?? 'America/Chicago';
    const hour = hourInTz(now, tz);
    // Only send between 9am and 9pm tenant-local. Defer to a later cron
    // tick if it's currently midnight in their timezone.
    if (hour < 9 || hour >= 21) {
      deferred += 1;
      continue;
    }

    if (!m.scheduledAt) {
      deferred += 1;
      continue;
    }

    const timeLabel = formatTimeLabel(m.scheduledAt, tz);

    try {
      await sendSms(
        m.tenantId,
        m.callerPhone,
        i18nSms('meetingConfirmPrompt', null, {
          businessName: m.tenant.name,
          timeLabel,
        }),
      );
      // Stamp ASAP so a retry inside this same window doesn't double-send.
      await prisma.meeting.update({
        where: { id: m.id },
        data: { confirmationSentAt: new Date() },
      });
      sent += 1;
    } catch (err: any) {
      logger.warn('Meeting-confirmation cron: send failed (non-fatal)', {
        meetingId: m.id,
        err: err?.message,
      });
    }
  }

  logger.info('Meeting-confirmation cron tick', {
    eligible: eligible.length,
    sent,
    deferred,
  });
  return Response.json({ checked: eligible.length, sent, deferred });
}
