import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { TwilioCallStatusSchema, TwilioInboundSmsSchema } from '@ringback/shared-types';
import { tenantResolver } from '../middleware/tenantResolver';
import { smsRateLimiter } from '../middleware/rateLimiter';
import { checkSmsLimit } from '../middleware/usageMeter';
import { processInboundSms } from '../services/flowEngineService';
import { sendNotification } from '../services/notificationService';
import { constructStripeEvent, handleSubscriptionUpdated, handleSubscriptionDeleted } from '../services/billingService';
import { verifySquareWebhook } from '../services/squareService';
import { logger } from '../utils/logger';

const router: Router = Router();
const prisma = new PrismaClient();

// ── Twilio: missed call handler ───────────────────────────────────────────────

router.post('/twilio/call-status', tenantResolver, async (req: Request, res: Response) => {
  const parseResult = TwilioCallStatusSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).send('Invalid payload');
    return;
  }

  const { CallSid, From, To, CallStatus } = parseResult.data;
  const tenantId = req.tenantId!;

  // Only handle terminal missed-call statuses
  if (!['no-answer', 'busy', 'failed', 'canceled'].includes(CallStatus)) {
    res.status(200).send('OK');
    return;
  }

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { config: true },
    });

    if (!tenant?.config) {
      res.status(200).send('OK');
      return;
    }

    // Record missed call
    const missedCall = await prisma.missedCall.create({
      data: {
        tenantId,
        callerPhone: From,
        twilioCallSid: CallSid,
        occurredAt: new Date(),
        smsSent: false,
      },
    });

    // Send initial greeting SMS
    const { sendSms } = await import('../services/twilioService');
    await sendSms(tenantId, From, tenant.config.greeting);

    await prisma.missedCall.update({
      where: { id: missedCall.id },
      data: { smsSent: true },
    });

    // Record usage
    const { incrementSmsUsage } = await import('../middleware/usageMeter');
    await incrementSmsUsage(tenantId, tenant.stripeSubscriptionId, tenant.plan);

    logger.info('Missed call handled', {
      tenantId,
      callSid: CallSid,
      callStatus: CallStatus,
    });

    res.status(200).send('OK');
  } catch (error) {
    logger.error('call-status webhook error', { error, tenantId });
    res.status(500).send('Error');
  }
});

// ── Twilio: inbound SMS handler ───────────────────────────────────────────────

router.post(
  '/twilio/sms-reply',
  tenantResolver,
  smsRateLimiter,
  checkSmsLimit,
  async (req: Request, res: Response) => {
    const parseResult = TwilioInboundSmsSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).send('Invalid payload');
      return;
    }

    const { MessageSid, From, Body } = parseResult.data;
    const tenantId = req.tenantId!;

    // Respond to Twilio immediately (async processing)
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

    // Process asynchronously to avoid Twilio timeout
    setImmediate(async () => {
      try {
        await processInboundSms({
          tenantId,
          callerPhone: From,
          inboundMessage: Body,
          messageSid: MessageSid,
        });
      } catch (error) {
        logger.error('Async SMS processing error', { error, tenantId, messageSid: MessageSid });
      }
    });
  }
);

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

export default router;
