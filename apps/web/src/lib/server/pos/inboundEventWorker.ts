import { prisma } from '../db';
import { logger } from '../logger';
import { handlePosWebhookEvent } from './webhookDispatcher';

const MAX_ATTEMPTS = 8;

export async function processInboundPosEvents(limit = 25): Promise<{
  processed: number;
  retried: number;
  dead: number;
}> {
  await prisma.inboundPosEvent.updateMany({
    where: {
      status: 'processing',
      lastAttemptAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
    },
    data: { status: 'retry', nextAttemptAt: new Date() },
  });
  const events = await prisma.inboundPosEvent.findMany({
    where: { status: { in: ['pending', 'retry'] }, nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  let processed = 0;
  let retried = 0;
  let dead = 0;
  for (const event of events) {
    const claimed = await prisma.inboundPosEvent.updateMany({
      where: { id: event.id, status: { in: ['pending', 'retry'] } },
      data: { status: 'processing', lastAttemptAt: new Date() },
    });
    if (claimed.count !== 1) continue;
    const attempt = event.attemptCount + 1;
    try {
      await handlePosWebhookEvent(event.provider, event.payload);
      await prisma.inboundPosEvent.update({
        where: { id: event.id },
        data: {
          status: 'processed',
          attemptCount: attempt,
          processedAt: new Date(),
          lastError: null,
        },
      });
      processed += 1;
    } catch (error) {
      const terminal = attempt >= MAX_ATTEMPTS;
      await prisma.inboundPosEvent.update({
        where: { id: event.id },
        data: {
          status: terminal ? 'dead' : 'retry',
          attemptCount: attempt,
          nextAttemptAt: new Date(
            Date.now() + Math.min(6 * 60 * 60 * 1000, 30_000 * 2 ** (attempt - 1))
          ),
          lastError: error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown error',
        },
      });
      terminal ? (dead += 1) : (retried += 1);
      logger.warn('Inbound POS event processing failed', {
        inboundEventId: event.id,
        provider: event.provider,
        attempt,
        terminal,
      });
    }
  }
  return { processed, retried, dead };
}
