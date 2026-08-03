import { createHmac } from 'crypto';
import { prisma } from '../db';
import { decrypt } from '../encryption';
import { logger } from '../logger';
import { assertSafeWebhookUrl } from './webhookSecurity';

const MAX_ATTEMPTS = 8;
const RESPONSE_BODY_LIMIT = 2_000;

function sign(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

function nextDelayMs(attempt: number): number {
  return Math.min(6 * 60 * 60 * 1000, 30_000 * 2 ** Math.max(0, attempt - 1));
}

export async function prepareWebhookDeliveries(limit = 100): Promise<number> {
  const events = await prisma.integrationEvent.findMany({
    where: { status: 'pending', availableAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  let prepared = 0;
  for (const event of events) {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: {
        tenantId: event.tenantId,
        status: 'active',
        disabledAt: null,
        events: { has: event.type },
        ...(event.sourceConnectionId && { connectionId: { not: event.sourceConnectionId } }),
      },
      select: { id: true },
    });
    await prisma.$transaction([
      prisma.webhookDelivery.createMany({
        data: endpoints.map((endpoint) => ({ eventId: event.id, endpointId: endpoint.id })),
        skipDuplicates: true,
      }),
      prisma.integrationEvent.update({
        where: { id: event.id },
        data:
          endpoints.length === 0
            ? { status: 'completed', completedAt: new Date() }
            : { status: 'queued' },
      }),
    ]);
    prepared += endpoints.length;
  }
  return prepared;
}

export async function deliverPendingWebhooks(limit = 50): Promise<{
  delivered: number;
  retried: number;
  dead: number;
}> {
  // Recover claims abandoned by a terminated serverless invocation.
  await prisma.webhookDelivery.updateMany({
    where: {
      status: 'processing',
      lastAttemptAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    data: { status: 'retry', nextAttemptAt: new Date() },
  });
  const due = await prisma.webhookDelivery.findMany({
    where: { status: { in: ['pending', 'retry'] }, nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
    include: { event: true, endpoint: true },
  });
  let delivered = 0;
  let retried = 0;
  let dead = 0;

  for (const delivery of due) {
    const claimed = await prisma.webhookDelivery.updateMany({
      where: {
        id: delivery.id,
        status: { in: ['pending', 'retry'] },
        nextAttemptAt: { lte: new Date() },
      },
      data: { status: 'processing', lastAttemptAt: new Date() },
    });
    if (claimed.count !== 1) continue;

    const attempt = delivery.attemptCount + 1;
    try {
      const url = await assertSafeWebhookUrl(delivery.endpoint.url);
      const body = JSON.stringify({
        id: delivery.event.id,
        type: delivery.event.type,
        api_version: delivery.event.apiVersion,
        created_at: delivery.event.createdAt.toISOString(),
        tenant_id: delivery.event.tenantId,
        location_id: delivery.event.locationId,
        data: delivery.event.payload,
      });
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = sign(decrypt(delivery.endpoint.secretEncrypted), timestamp, body);
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'RingBackSMS-Webhooks/1.0',
          'X-RingBack-Event-Id': delivery.event.id,
          'X-RingBack-Timestamp': String(timestamp),
          'X-RingBack-Signature': `v1=${signature}`,
        },
        body,
      });
      const responseBody = (await response.text()).slice(0, RESPONSE_BODY_LIMIT);
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`HTTP ${response.status}: ${responseBody}`);
      }
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'delivered',
          attemptCount: attempt,
          responseStatus: response.status,
          responseBody,
          deliveredAt: new Date(),
          lastError: null,
        },
      });
      await prisma.webhookEndpoint.update({
        where: { id: delivery.endpointId },
        data: { failureCount: 0 },
      });
      delivered += 1;
    } catch (error) {
      const terminal = attempt >= MAX_ATTEMPTS;
      await prisma.$transaction([
        prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: terminal ? 'dead' : 'retry',
            attemptCount: attempt,
            nextAttemptAt: new Date(Date.now() + nextDelayMs(attempt)),
            lastError:
              error instanceof Error
                ? error.message.slice(0, RESPONSE_BODY_LIMIT)
                : 'Unknown error',
          },
        }),
        prisma.webhookEndpoint.update({
          where: { id: delivery.endpointId },
          data: { failureCount: { increment: 1 } },
        }),
      ]);
      terminal ? (dead += 1) : (retried += 1);
      logger.warn('Commerce webhook delivery failed', {
        deliveryId: delivery.id,
        eventId: delivery.eventId,
        attempt,
        terminal,
      });
    }
  }

  const touchedEventIds = [...new Set(due.map((delivery) => delivery.eventId))];
  for (const eventId of touchedEventIds) {
    const remaining = await prisma.webhookDelivery.count({
      where: { eventId, status: { in: ['pending', 'retry', 'processing'] } },
    });
    if (remaining === 0) {
      await prisma.integrationEvent.update({
        where: { id: eventId },
        data: { status: 'completed', completedAt: new Date() },
      });
    }
  }
  return { delivered, retried, dead };
}
