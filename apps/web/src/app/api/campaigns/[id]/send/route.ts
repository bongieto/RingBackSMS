import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { apiSuccess, apiError } from '@/lib/server/response';
import { prisma } from '@/lib/server/db';
import { queueCampaign, sendCampaign } from '@/lib/server/services/campaignService';
import { waitUntil } from '@/lib/server/waitUntil';
import { logger } from '@/lib/server/logger';

/**
 * POST /api/campaigns/:id/send — queue eligible recipients, then
 * background-send via Twilio. Returns queue count immediately; the
 * client polls the GET list to see sent/failed counts roll in.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const campaign = await prisma.smsCampaign.findUnique({
    where: { id: params.id },
    select: { tenantId: true, status: true },
  });
  if (!campaign) return apiError('Campaign not found', 404);
  const authResult = await verifyTenantAccess(campaign.tenantId);
  if (isNextResponse(authResult)) return authResult;

  if (campaign.status === 'SENT' || campaign.status === 'SENDING') {
    return apiError(`Campaign is ${campaign.status}`, 400);
  }

  const { queued } = await queueCampaign(params.id);

  // Fire-and-forget send loop. On Vercel waitUntil keeps the lambda alive
  // long enough to complete; for long campaigns this should move to a
  // proper background queue (BullMQ / cron) — that's a v2 problem.
  waitUntil(
    sendCampaign(params.id).catch((err) => {
      logger.error('Campaign send loop crashed', { campaignId: params.id, err: err?.message });
      prisma.smsCampaign
        .update({ where: { id: params.id }, data: { status: 'FAILED' } })
        .catch(() => {});
    }),
  );

  return apiSuccess({ queued, status: 'SENDING' });
}
