import { Router, Request, Response } from 'express';
import { constructStripeEvent, handleSubscriptionUpdated, handleSubscriptionDeleted } from '../services/billingService';
import { verifySquareWebhook } from '../services/squareService';
import { logger } from '../utils/logger';

const router: Router = Router();

// ──────────────────────────────────────────────────────────────────────────────
// Twilio webhooks (voice + SMS) are NOT served from this Express app.
// They live under apps/web:
//   - POST /api/webhooks/twilio/voice         (Next.js App Router)
//   - POST /api/webhooks/twilio/call-status   (Next.js App Router)
//   - POST /api/webhooks/twilio/sms-reply     (Next.js App Router)
// The Next.js implementations handle Twilio signature validation, consent
// gating, the full flow-engine pipeline, and the Turn observation layer.
// The old Express handlers here diverged and then bit-rotted (their
// flowEngineService lost track of helper modules that were split out);
// they were removed to stop broadcasting a second, silently-broken
// integration point. If Twilio config still points here, update the
// webhook URL in the Twilio console to the Next.js route above.
// ──────────────────────────────────────────────────────────────────────────────

// ── Stripe webhook ────────────────────────────────────────────────────────────

router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;

  let event;
  try {
    event = constructStripeEvent(req.body as Buffer, sig);
  } catch (error) {
    logger.warn('Stripe webhook signature verification failed', { error });
    res.status(400).send('Webhook signature verification failed');
    return;
  }

  try {
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.created':
        await handleSubscriptionUpdated(event.data.object as Parameters<typeof handleSubscriptionUpdated>[0]);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Parameters<typeof handleSubscriptionDeleted>[0]);
        break;

      default:
        logger.debug('Unhandled Stripe event', { type: event.type });
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Stripe webhook handling error', { error, eventType: event.type });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ── Square webhook ────────────────────────────────────────────────────────────

router.post('/square', async (req: Request, res: Response) => {
  const signature = req.headers['x-square-hmacsha256-signature'] as string;
  const notificationUrl = `${process.env.BASE_URL}/webhooks/square`;

  const isValid = verifySquareWebhook(
    JSON.stringify(req.body),
    signature,
    notificationUrl
  );

  if (!isValid) {
    logger.warn('Square webhook signature invalid');
    res.status(403).send('Invalid signature');
    return;
  }

  const body = req.body as { type?: string; merchant_id?: string };
  logger.info('Square webhook received', { type: body.type, merchantId: body.merchant_id });

  // TODO: Handle specific Square events (catalog.version.updated, order.updated, etc.)
  res.status(200).json({ received: true });
});

// ── Generic POS webhook ──────────────────────────────────────────────────────

router.post('/pos/:provider', async (req: Request, res: Response) => {
  const { provider } = req.params;

  try {
    const { posRegistry } = await import('../pos/registry');
    const adapter = posRegistry.get(provider);

    const signature = (req.headers['x-square-hmacsha256-signature']
                    || req.headers['x-shopify-hmac-sha256']
                    || req.headers['x-toast-hmac-sha256']
                    || req.headers['x-clover-hmac']
                    || '') as string;

    const notificationUrl = `${process.env.BASE_URL}/webhooks/pos/${provider}`;
    const isValid = adapter.verifyWebhook(JSON.stringify(req.body), signature, { notificationUrl });

    if (!isValid) {
      logger.warn('POS webhook signature invalid', { provider });
      res.status(403).send('Invalid signature');
      return;
    }

    const { handlePosWebhookEvent } = await import('../pos/webhookDispatcher');
    await handlePosWebhookEvent(provider, req.body);
    res.status(200).json({ received: true });
  } catch (err) {
    logger.error('POS webhook error', { err, provider });
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

export default router;
