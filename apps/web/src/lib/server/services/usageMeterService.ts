import { UsageType } from '@prisma/client';
import { Redis } from 'ioredis';
import { PLAN_LIMITS } from '@ringback/shared-types';
import { Plan } from '@ringback/shared-types';
import { logger } from '../logger';
import { prisma } from '../db';
import { buildRedisOptions } from '../redisConfig';

let redisClient: Redis | null = null;

// Must match the Billing Meter's event_name in Stripe
// (mtr_61V9yCW00y57RxTYQ41R1QQWL4HmfEL2, backing STRIPE_SMS_METERED_PRICE_ID).
const SMS_OVERAGE_METER_EVENT = 'sms_overage';

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(buildRedisOptions());
    redisClient.on('error', (err) => {
      logger.warn('Usage meter Redis error', { error: (err as Error).message });
    });
  }
  return redisClient;
}

/**
 * Returns the current month's SMS count for a tenant from Redis.
 * Key format: usage:{tenantId}:sms:{YYYY-MM}
 */
export async function getMonthlySmCount(tenantId: string): Promise<number> {
  const redis = getRedis();
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const key = `usage:${tenantId}:sms:${month}`;
  const count = await redis.get(key);
  return count ? parseInt(count, 10) : 0;
}

/**
 * Increments the monthly SMS counter and optionally reports overage to Stripe.
 */
export async function incrementSmsUsage(
  tenantId: string,
  stripeSubscriptionId: string | null,
  plan: string
): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  const key = `usage:${tenantId}:sms:${month}`;

  // Best-effort Redis counter — if Redis is unavailable, we fall back to
  // the DB-only path. Usage metering MUST NOT block the customer-facing
  // SMS flow (a broken Redis used to surface to the user as a generic
  // "something went wrong" reply).
  let newCount = 0;
  try {
    const redis = getRedis();
    newCount = await redis.incr(key);
    if (newCount === 1) {
      await redis.expireat(key, getEndOfMonthTimestamp());
    }
  } catch (err) {
    logger.error('SMS usage Redis increment failed, continuing without overage check', {
      err,
      tenantId,
    });
  }

  // Write usage log (best-effort — never block SMS on analytics writes)
  try {
    await prisma.usageLog.create({
      data: {
        tenantId,
        type: UsageType.SMS_SENT,
        metadata: { month, count: newCount },
      },
    });
  } catch (err) {
    logger.error('SMS usage log write failed', { err, tenantId });
  }

  const planLimits = PLAN_LIMITS[plan as Plan];
  if (!planLimits) return;

  // Report overage to Stripe metered billing (only when Redis counter is
  // trustworthy — skip if Redis failed above).
  //
  // Uses Billing Meter events, not the deprecated usage-records API:
  // subscriptions created by current Checkout run in flexible billing
  // mode, which rejects usage records outright. Meter events are keyed
  // by customer — Stripe routes them to whatever subscription item
  // carries the meter-backed price. Events for customers without such
  // an item (annual plans, subs predating the metered item) are
  // recorded but bill nothing, so no need to inspect the subscription.
  if (
    newCount > planLimits.smsPerMonth &&
    stripeSubscriptionId &&
    process.env.STRIPE_SMS_METERED_PRICE_ID?.trim()
  ) {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { stripeCustomerId: true },
      });
      if (!tenant?.stripeCustomerId) {
        logger.warn('SMS overage not reported — tenant has no stripeCustomerId', { tenantId });
        return;
      }
      const res = await fetch('https://api.stripe.com/v1/billing/meter_events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY?.trim()}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          event_name: SMS_OVERAGE_METER_EVENT,
          // Stable per counted message: retries after a network blip
          // can't double-bill (Stripe dedups on identifier for 24h).
          identifier: `sms:${tenantId}:${month}:${newCount}`,
          'payload[stripe_customer_id]': tenant.stripeCustomerId,
          'payload[value]': '1',
        }).toString(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? `Stripe meter event failed: ${res.status}`);
      }
    } catch (error) {
      logger.error('Stripe usage reporting failed', { error, tenantId });
    }
  }
}

function getEndOfMonthTimestamp(): number {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
  return Math.floor(endOfMonth.getTime() / 1000);
}
