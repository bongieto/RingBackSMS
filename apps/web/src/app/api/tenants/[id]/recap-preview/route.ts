// Operator-triggered preview of the daily recap email. Sends the same
// shape the hourly cron does, except:
//   - it ignores the time-of-day match (operator can preview at 3pm)
//   - it ignores the dailyRecapLastSentDate idempotency stamp (preview
//     doesn't update it — the real recap can still fire at 8am)
//   - it sends even on a zero-activity day so operators can see the
//     "Quiet day" empty-state copy
//
// Used by the Settings page "Send recap preview" button (B4).

import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';
import { sendDailyRecapEmail } from '@/lib/server/services/emailService';
import { buildRecapStats } from '@/lib/server/services/recapStatsService';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;

  const cfg = await prisma.tenantConfig.findUnique({
    where: { tenantId: params.id },
    select: { timezone: true, ownerEmail: true },
  });
  if (!cfg) return apiError('Tenant config not found', 404);
  if (!cfg.ownerEmail) {
    return apiError(
      'Set an Owner Email under Notifications first — that is where the preview will be sent.',
      400,
    );
  }

  try {
    const { stats } = await buildRecapStats(params.id, cfg.timezone);
    const ok = await sendDailyRecapEmail(params.id, stats);
    if (!ok) {
      return apiError('Email send failed — check Resend configuration.', 500);
    }
    return apiSuccess({
      ok: true,
      sentTo: cfg.ownerEmail,
      activitySummary: {
        missedCalls: stats.missedCalls,
        conversations: stats.conversations,
        meetingsBooked: stats.meetingsBooked,
        meetingsConfirmed: stats.meetingsConfirmed,
        ordersCompleted: stats.ordersCompleted,
        ordersRevenue: stats.ordersRevenue,
        pendingMeetings: stats.pendingMeetings.length,
      },
    });
  } catch (err) {
    logger.error('Recap preview failed', { tenantId: params.id, err });
    return apiError('Failed to build recap preview', 500);
  }
}
