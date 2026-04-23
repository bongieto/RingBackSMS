import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { Plan } from '@ringback/shared-types';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

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

  let customerId = tenant?.stripeCustomerId;

  if (!customerId) {
    const config = await prisma.tenantConfig.findUnique({ where: { tenantId }, select: { ownerEmail: true } });
    const tenantRecord = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    if (!config?.ownerEmail) {
      throw new Error('Owner email required to create billing account');
    }
    customerId = await createStripeCustomer(tenantId, config.ownerEmail, tenantRecord?.name ?? '');
    logger.info('Auto-created Stripe customer for checkout', { tenantId, customerId });
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
    customer: customerId,
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

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      stripeSubscriptionId: subscription.id,
      plan,
      isActive: subscription.status === 'active' || subscription.status === 'trialing',
    },
  });

  logger.info('Subscription updated', { tenantId, plan, status: subscription.status });
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
}

export function constructStripeEvent(
  payload: Buffer,
  signature: string
): Stripe.Event {
  const stripe = getStripe();
  // Replay protection — explicit tolerance matches the apps/web
  // implementation. See billingService.ts in apps/web for rationale.
  const toleranceRaw = process.env.STRIPE_WEBHOOK_TOLERANCE_SECONDS?.trim();
  const tolerance = toleranceRaw ? Math.max(30, Number(toleranceRaw)) : 300;
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET ?? '',
    tolerance,
  );
}
