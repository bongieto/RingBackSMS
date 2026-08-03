import { NextRequest } from 'next/server';
import {
  deliverPendingWebhooks,
  prepareWebhookDeliveries,
} from '@/lib/server/commerce/webhookDelivery';
import { logger } from '@/lib/server/logger';
import { prisma } from '@/lib/server/db';
import { processInboundPosEvents } from '@/lib/server/pos/inboundEventWorker';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const prepared = await prepareWebhookDeliveries();
  const result = await deliverPendingWebhooks();
  const inbound = await processInboundPosEvents();
  const expiredIdempotencyRecords = await prisma.apiIdempotencyRecord.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  logger.info('Commerce webhook dispatcher completed', {
    prepared,
    expiredIdempotencyRecords: expiredIdempotencyRecords.count,
    inbound,
    ...result,
  });
  return Response.json({
    prepared,
    expiredIdempotencyRecords: expiredIdempotencyRecords.count,
    inbound,
    ...result,
  });
}
