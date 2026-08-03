import { NextRequest } from 'next/server';
import { posRegistry } from '@/lib/server/pos/registry';
import { logger } from '@/lib/server/logger';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/server/rateLimit';
import { prisma } from '@/lib/server/db';
import { Prisma } from '@prisma/client';

export async function POST(request: NextRequest, { params }: { params: { provider: string } }) {
  const { provider } = params;

  const ip = getClientIp(request.headers);
  const rl = await checkRateLimit(`pos:${provider}:${ip}`, 120, 60);
  if (!rl.allowed) return rateLimitResponse(rl);

  const text = await request.text();

  try {
    const adapter = posRegistry.get(provider);
    const signature =
      request.headers.get('x-square-hmacsha256-signature') ??
      request.headers.get('x-shopify-hmac-sha256') ??
      request.headers.get('x-toast-hmac-sha256') ??
      request.headers.get('x-clover-hmac') ??
      '';
    const notificationUrl = `${process.env.FRONTEND_URL ?? ''}/api/webhooks/pos/${provider}`;
    const isValid = adapter.verifyWebhook(text, signature, { notificationUrl });
    if (!isValid) {
      logger.warn('POS webhook signature invalid', { provider });
      return new Response('Invalid signature', { status: 403 });
    }
    const body = JSON.parse(text) as {
      event_id?: string;
      id?: string;
      type?: string;
      event_type?: string;
    };
    const eventId =
      request.headers.get('x-shopify-webhook-id') ??
      request.headers.get('x-toast-event-id') ??
      request.headers.get('x-clover-event-id') ??
      body.event_id;
    if (!eventId || typeof eventId !== 'string') {
      return Response.json({ error: 'Webhook event id is required' }, { status: 400 });
    }
    try {
      await prisma.inboundPosEvent.create({
        data: {
          provider,
          eventId,
          eventType: body.type ?? body.event_type ?? 'unknown',
          payload: body,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return Response.json({ received: true, duplicate: true }, { status: 200 });
      }
      throw error;
    }
    return Response.json({ received: true, queued: true }, { status: 202 });
  } catch (err) {
    logger.error('POS webhook error', { err, provider });
    return Response.json({ error: 'Webhook error' }, { status: 500 });
  }
}
