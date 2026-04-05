import { UsageType } from '@prisma/client';
import { Redis } from 'ioredis';
import Stripe from 'stripe';
import { PLAN_LIMITS } from '@ringback/shared-types';
import { Plan } from '@ringback/shared-types';
import { logger } from '../logger';
import { PlanLimitError } from '../errors';
import { prisma } from '../db';

let redisClient: Redis | null = null;
let stripeClient: Stripe | null = null;

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redisClient;
}

function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2023-10-16',
    });
  }
  return stripeClient;
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
  const redis = getRedis();
  const month = new Date().toISOString().slice(0, 7);
  const key = `usage:${tenantId}:sms:${month}`;

  const newCount = await redis.incr(key);
  if (newCount === 1) {
    await redis.expireat(key, getEndOfMonthTimestamp());
  }

  // Write usage log
  await prisma.usageLog.create({
    data: {
      tenantId,
      type: UsageType.SMS_SENT,
      metadata: { month, count: newCount },
    },
  });

  const planLimits = PLAN_LIMITS[plan as Plan];
  if (!planLimits) return;

  // Report overage to Stripe metered billing
  if (
    newCount > planLimits.smsPerMonth &&
    stripeSubscriptionId &&
    process.env.STRIPE_SMS_METERED_PRICE_ID
  ) {
    try {
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      const item = subscription.items.data.find(
        (i) => i.price.id === process.env.STRIPE_SMS_METERED_PRICE_ID
      );
      if (item) {
        await stripe.subscriptionItems.createUsageRecord(item.id, {
          quantity: 1,
          timestamp: Math.floor(Date.now() / 1000),
          action: 'increment',
        });
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
