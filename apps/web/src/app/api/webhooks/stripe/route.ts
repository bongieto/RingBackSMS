import { NextRequest } from 'next/server';
import { constructStripeEvent, handleSubscriptionUpdated, handleSubscriptionDeleted } from '@/lib/server/services/billingService';
import { logger } from '@/lib/server/logger';
import Stripe from 'stripe';

export async function POST(request: NextRequest) {
  const rawBody = Buffer.from(await request.arrayBuffer());
  const sig = request.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = constructStripeEvent(rawBody, sig);
  } catch (err) {
    logger.warn('Stripe webhook signature verification failed', { err });
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.created':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        logger.debug('Unhandled Stripe event', { type: event.type });
    }
    return Response.json({ received: true });
  } catch (err) {
    logger.error('Stripe webhook error', { err, eventType: event.type });
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
