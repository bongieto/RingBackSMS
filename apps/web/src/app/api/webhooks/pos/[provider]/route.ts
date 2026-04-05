import { NextRequest } from 'next/server';
import { posRegistry } from '@/lib/server/pos/registry';
import { handlePosWebhookEvent } from '@/lib/server/pos/webhookDispatcher';
import { logger } from '@/lib/server/logger';

export async function POST(request: NextRequest, { params }: { params: { provider: string } }) {
  const { provider } = params;
  const text = await request.text();

  try {
    const adapter = posRegistry.get(provider);
    const signature = (
      request.headers.get('x-square-hmacsha256-signature') ??
      request.headers.get('x-shopify-hmac-sha256') ??
      request.headers.get('x-toast-hmac-sha256') ??
      request.headers.get('x-clover-hmac') ?? ''
    );
    const notificationUrl = `${process.env.FRONTEND_URL ?? ''}/api/webhooks/pos/${provider}`;
    const isValid = adapter.verifyWebhook(text, signature, { notificationUrl });
    if (!isValid) {
      logger.warn('POS webhook signature invalid', { provider });
      return new Response('Invalid signature', { status: 403 });
    }
    const body = JSON.parse(text);
    await handlePosWebhookEvent(provider, body);
    return Response.json({ received: true });
  } catch (err) {
    logger.error('POS webhook error', { err, provider });
    return Response.json({ error: 'Webhook error' }, { status: 500 });
  }
}
