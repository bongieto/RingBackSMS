import Stripe from 'stripe';
import { Plan } from '@ringback/shared-types';
import { logger } from '../logger';
import { prisma } from '../db';
import { sendWelcomeEmail, sendSubscriptionCancelledEmail, sendPaymentFailedEmail } from './emailService';

const PLAN_PRICE_IDS: Record<Plan, string | undefined> = {
  [Plan.STARTER]: process.env.STRIPE_STARTER_PRICE_ID?.trim(),
  [Plan.GROWTH]: process.env.STRIPE_GROWTH_PRICE_ID?.trim(),
  [Plan.SCALE]: process.env.STRIPE_SCALE_PRICE_ID?.trim(),
  [Plan.ENTERPRISE]: process.env.STRIPE_ENTERPRISE_PRICE_ID?.trim(),
};

const ANNUAL_PLAN_PRICE_IDS: Record<Plan, string | undefined> = {
  [Plan.STARTER]: undefined,
  [Plan.GROWTH]: process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID?.trim(),
  [Plan.SCALE]: process.env.STRIPE_SCALE_ANNUAL_PRICE_ID?.trim(),
  [Plan.ENTERPRISE]: undefined,
};

/** All known price IDs (monthly + annual) mapped back to their plan */
function planFromPriceId(priceId: string): Plan | undefined {
  for (const [plan, pid] of Object.entries(PLAN_PRICE_IDS)) {
    if (pid === priceId) return plan as Plan;
  }
  for (const [plan, pid] of Object.entries(ANNUAL_PLAN_PRICE_IDS)) {
    if (pid === priceId) return plan as Plan;
  }
  return undefined;
}

function getStripeKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  return key;
}

/** Make a POST request to the Stripe API using fetch (works reliably in Vercel serverless) */
async function stripePost(path: string, body: Record<string, string>): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getStripeKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Stripe API error: ${res.status}`);
  }
  return data;
}

export async function createStripeCustomer(
  tenantId: string,
  email: string,
  name: string
): Promise<string> {
  const customer = await stripePost('/customers', {
    email,
    name,
    'metadata[tenantId]': tenantId,
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
  cancelUrl: string,
  interval: 'monthly' | 'annual' = 'monthly'
): Promise<string> {
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

  const priceId = interval === 'annual'
    ? (ANNUAL_PLAN_PRICE_IDS[plan] ?? PLAN_PRICE_IDS[plan])
    : PLAN_PRICE_IDS[plan];
  if (!priceId) {
    throw new Error(`No Stripe price configured for plan ${plan}`);
  }

  const body: Record<string, string> = {
    customer: customerId,
    mode: 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: successUrl,
    cancel_url: cancelUrl,
    'metadata[tenantId]': tenantId,
    'metadata[plan]': plan,
    // Copy metadata onto the subscription itself so webhooks
    // (customer.subscription.created/updated) can resolve the tenant.
    // Stripe does NOT propagate checkout-session metadata to the
    // subscription automatically.
    'subscription_data[metadata][tenantId]': tenantId,
    'subscription_data[metadata][plan]': plan,
  };

  // Add SMS price if configured
  const smsPriceId = process.env.STRIPE_SMS_METERED_PRICE_ID?.trim();
  if (smsPriceId) {
    body['line_items[1][price]'] = smsPriceId;
    body['line_items[1][quantity]'] = '1';
  }

  const session = await stripePost('/checkout/sessions', body);
  return session.url ?? '';
}

export async function createBillingPortalSession(
  tenantId: string,
  returnUrl: string
): Promise<string> {
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
    logger.info('Auto-created Stripe customer for portal', { tenantId, customerId });
  }

  const session = await stripePost('/billing_portal/sessions', {
    customer: customerId,
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

  let plan: Plan = Plan.STARTER;
  for (const item of subscription.items.data) {
    const matched = planFromPriceId(item.price.id);
    if (matched) { plan = matched; break; }
  }

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

  if (isNewSubscription && (subscription.status === 'active' || subscription.status === 'trialing')) {
    sendWelcomeEmail(tenantId, plan).catch((err) =>
      logger.error('Failed to send welcome email', { err, tenantId })
    );
  }

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
  const stripe = new Stripe(getStripeKey(), { apiVersion: '2023-10-16' });
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET ?? ''
  );
}

// ── Stripe Connect (agency payouts) ─────────────────────────────────────

async function stripeGet(path: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${getStripeKey()}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe API error: ${res.status}`);
  return data;
}

/** Create an Express Connect account for an agency. */
export async function createConnectExpressAccount(input: {
  email?: string;
  clerkUserId: string;
  agencyId: string;
}): Promise<string> {
  const account = await stripePost('/accounts', {
    type: 'express',
    'capabilities[transfers][requested]': 'true',
    ...(input.email ? { email: input.email } : {}),
    'metadata[clerkUserId]': input.clerkUserId,
    'metadata[agencyId]': input.agencyId,
  });
  return account.id;
}

/** Create an account onboarding link for the given Connect account. */
export async function createConnectAccountLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const link = await stripePost('/account_links', {
    account: accountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: 'account_onboarding',
  });
  return link.url;
}

/** Fetch current Connect account status. */
export async function getConnectAccount(accountId: string): Promise<{
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  bankLast4?: string | null;
}> {
  const acct = await stripeGet(`/accounts/${accountId}`);
  const bank = acct.external_accounts?.data?.[0];
  return {
    detailsSubmitted: Boolean(acct.details_submitted),
    payoutsEnabled: Boolean(acct.payouts_enabled),
    chargesEnabled: Boolean(acct.charges_enabled),
    bankLast4: bank?.last4 ?? null,
  };
}

/**
 * Create a Stripe Transfer from the platform balance to a connected
 * account. Used by the monthly payout cron. Idempotency key makes retries
 * safe.
 */
export async function createConnectTransfer(input: {
  destinationAccountId: string;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
}): Promise<string> {
  const body: Record<string, string> = {
    amount: String(input.amountCents),
    currency: input.currency,
    destination: input.destinationAccountId,
  };
  for (const [k, v] of Object.entries(input.metadata ?? {})) {
    body[`metadata[${k}]`] = v;
  }
  const res = await fetch(`https://api.stripe.com/v1/transfers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getStripeKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': input.idempotencyKey,
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe transfer failed: ${res.status}`);
  return data.id as string;
}
