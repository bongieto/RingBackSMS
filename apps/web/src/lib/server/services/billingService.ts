import Stripe from 'stripe';
import { Plan } from '@ringback/shared-types';
import { logger } from '../logger';
import { prisma } from '../db';
import { sendWelcomeEmail, sendSubscriptionCancelledEmail, sendPaymentFailedEmail } from './emailService';

const PLAN_PRICE_IDS: Record<Plan, string | undefined> = {
  [Plan.STARTER]: process.env.STRIPE_STARTER_PRICE_ID,
  [Plan.GROWTH]: process.env.STRIPE_GROWTH_PRICE_ID,
  [Plan.SCALE]: process.env.STRIPE_SCALE_PRICE_ID,
  [Plan.ENTERPRISE]: process.env.STRIPE_ENTERPRISE_PRICE_ID,
};

let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2023-10-16',
    });
  }
  return stripeInstance;
}

export async function createStripeCustomer(
  tenantId: string,
  email: string,
  name: string
): Promise<string> {
  const stripe = getStripe();

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { tenantId },
  });

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

export async function createCheckoutSession(
  tenantId: string,
  plan: Plan,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const stripe = getStripe();

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeCustomerId: true },
  });

  if (!tenant?.stripeCustomerId) {
    throw new Error('Tenant has no Stripe customer ID');
  }

  const priceId = PLAN_PRICE_IDS[plan];
  if (!priceId) {
    throw new Error(`No Stripe price configured for plan ${plan}`);
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: priceId, quantity: 1 },
  ];

  // Add SMS metered price if configured
  if (process.env.STRIPE_SMS_METERED_PRICE_ID) {
    lineItems.push({ price: process.env.STRIPE_SMS_METERED_PRICE_ID });
  }

  const session = await stripe.checkout.sessions.create({
    customer: tenant.stripeCustomerId,
    mode: 'subscription',
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { tenantId, plan },
  });

  return session.url ?? '';
}

export async function createBillingPortalSession(
  tenantId: string,
  returnUrl: string
): Promise<string> {
  const stripe = getStripe();

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeCustomerId: true },
  });

  if (!tenant?.stripeCustomerId) {
    throw new Error('Tenant has no Stripe customer ID');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: returnUrl,
  });

  return session.url;
}

export async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription
): Promise<void> {
  const tenantId = subscription.metadata.tenantId;
  if (!tenantId) {
    logger.warn('Stripe subscription has no tenantId metadata', { subscriptionId: subscription.id });
    return;
  }

  const planEntry = Object.entries(PLAN_PRICE_IDS).find(([, priceId]) =>
    subscription.items.data.some((item) => item.price.id === priceId)
  );

  const plan = planEntry ? (planEntry[0] as Plan) : Plan.STARTER;

  const previousTenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeSubscriptionId: true },
  });
  const isNewSubscription = !previousTenant?.stripeSubscriptionId;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      stripeSubscriptionId: subscription.id,
      plan,
      isActive: subscription.status === 'active' || subscription.status === 'trialing',
    },
  });

  logger.info('Subscription updated', { tenantId, plan, status: subscription.status });

  // Send welcome email on first successful subscription
  if (isNewSubscription && (subscription.status === 'active' || subscription.status === 'trialing')) {
    sendWelcomeEmail(tenantId, plan).catch((err) =>
      logger.error('Failed to send welcome email', { err, tenantId })
    );
  }

  // Send payment failed email
  if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
    sendPaymentFailedEmail(tenantId).catch((err) =>
      logger.error('Failed to send payment failed email', { err, tenantId })
    );
  }
}

export async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription
): Promise<void> {
  const tenantId = subscription.metadata.tenantId;
  if (!tenantId) return;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      plan: Plan.STARTER,
      stripeSubscriptionId: null,
    },
  });

  logger.info('Subscription cancelled', { tenantId });

  sendSubscriptionCancelledEmail(tenantId).catch((err) =>
    logger.error('Failed to send cancellation email', { err, tenantId })
  );
}

export function constructStripeEvent(
  payload: Buffer,
  signature: string
): Stripe.Event {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET ?? ''
  );
}
