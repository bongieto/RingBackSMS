import { Redis } from 'ioredis';
import { CallerState, CallerStateSchema } from '@ringback/shared-types';
import { logger } from '../logger';
import { buildRedisOptions } from '../redisConfig';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';

const STATE_TTL_SECONDS = 60 * 60 * 24; // 24 hours
// Redis dedup TTL is just the hot-path short-circuit window. Persistent
// dedup is enforced by the InboundSmsDedup table (unique on tenant+sid) so
// a Twilio retry arriving hours later is still caught.
const DEDUP_TTL_SECONDS = 60 * 5; // 5 minutes
const CALLER_LOCK_TTL_SECONDS = 25; // must exceed typical per-turn runtime

let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(buildRedisOptions());
    // Attach an error handler so ioredis reconnection errors don't surface
    // as "unhandled error event" warnings in the log stream.
    redisClient.on('error', (err) => {
      logger.warn('Redis client error (will retry)', { err: err.message });
    });
  }
  return redisClient;
}

function stateKey(tenantId: string, callerPhone: string): string {
  return `state:${tenantId}:${callerPhone}`;
}

function dedupKey(tenantId: string, messageSid: string): string {
  return `dedup:${tenantId}:${messageSid}`;
}

export async function getCallerState(
  tenantId: string,
  callerPhone: string
): Promise<CallerState | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(stateKey(tenantId, callerPhone));
    if (!raw) return null;

    const parsed = CallerStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      logger.warn('Invalid caller state in Redis, discarding', { tenantId });
      await deleteCallerState(tenantId, callerPhone);
      return null;
    }

    return parsed.data;
  } catch (error) {
    logger.error('getCallerState error', { error });
    return null;
  }
}

export async function setCallerState(state: CallerState): Promise<void> {
  try {
    const redis = getRedis();
    const key = stateKey(state.tenantId, state.callerPhone);
    await redis.setex(key, STATE_TTL_SECONDS, JSON.stringify(state));
  } catch (error) {
    logger.error('setCallerState error', { error });
  }
}

export async function deleteCallerState(tenantId: string, callerPhone: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(stateKey(tenantId, callerPhone));
  } catch (error) {
    logger.error('deleteCallerState error', { error });
  }
}

/**
 * Checks if a Twilio MessageSid has already been processed (dedup).
 * Returns true if duplicate, false if new.
 *
 * Two-layer dedup:
 *   1. Redis `SETNX` with 5-min TTL — fast path that catches retries
 *      arriving within the same serverless warm window.
 *   2. Prisma `InboundSmsDedup` row with a unique (tenantId, messageSid)
 *      index — source of truth. Twilio retries up to 24h, which blows
 *      past the Redis TTL; without the DB check a late retry would
 *      double-process the message (and at worst, double-bill the
 *      customer for an order).
 *
 * Both layers fail-open on infrastructure errors: if Redis OR Postgres is
 * down we log and let the message through rather than dropping real
 * customer traffic. The alternative (fail-closed) would mean a Redis blip
 * silently suppresses every inbound SMS — worse than the occasional
 * double-process.
 */
export async function isDuplicate(tenantId: string, messageSid: string): Promise<boolean> {
  // Layer 1: Redis fast path.
  try {
    const redis = getRedis();
    const key = dedupKey(tenantId, messageSid);
    const result = await redis.set(key, '1', 'EX', DEDUP_TTL_SECONDS, 'NX');
    if (result === null) return true; // hot-window retry — skip the DB roundtrip
  } catch (error) {
    logger.warn('isDuplicate: redis layer failed, falling through to DB', { error });
    // Fall through — DB is the source of truth anyway.
  }

  // Layer 2: Durable check. Insert-or-conflict pattern means "new" insert
  // succeeds once and every retry trips the unique constraint.
  try {
    await prisma.inboundSmsDedup.create({
      data: { tenantId, messageSid },
    });
    return false;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return true; // unique violation — already processed
    }
    logger.error('isDuplicate: db layer failed, failing open', { error, tenantId, messageSid });
    return false;
  }
}

/**
 * Serializes processing for a single caller. Two rapid messages from the
 * same phone could otherwise race:
 *   - Message A reads state, starts building order draft.
 *   - Message B reads the SAME state (A hasn't written yet), decides it
 *     looks like a fresh order, and wipes the cart.
 *   - A writes its state; B writes its state; customer sees half their
 *     items silently dropped.
 *
 * The lock holder wraps the read-modify-write cycle with a short Redis
 * lease. Contenders wait briefly for the lock; if they can't acquire it
 * within `waitMs`, they give up and the caller should abort (the dedup
 * layer above generally catches genuine duplicates; a lock timeout
 * here typically means the prior message is legitimately still running).
 *
 * Releases only delete the lock if we still own it (check-and-del via
 * Lua), so a lease that expired because the handler ran long doesn't get
 * deleted by us when some other handler has already re-acquired it.
 */
export async function withCallerLock<T>(
  tenantId: string,
  callerPhone: string,
  fn: () => Promise<T>,
  opts: { ttlSeconds?: number; waitMs?: number } = {},
): Promise<{ acquired: true; result: T } | { acquired: false }> {
  const ttl = opts.ttlSeconds ?? CALLER_LOCK_TTL_SECONDS;
  const maxWaitMs = opts.waitMs ?? 5000;
  const key = `statelock:${tenantId}:${callerPhone}`;
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

  let redis: Redis;
  try {
    redis = getRedis();
  } catch (err) {
    logger.warn('withCallerLock: redis unavailable — running without lock', { err, tenantId });
    const result = await fn();
    return { acquired: true, result };
  }

  const deadline = Date.now() + maxWaitMs;
  let acquired = false;
  while (Date.now() <= deadline) {
    try {
      const got = await redis.set(key, token, 'EX', ttl, 'NX');
      if (got === 'OK') {
        acquired = true;
        break;
      }
    } catch (err) {
      logger.warn('withCallerLock: redis set failed, running without lock', { err, tenantId });
      const result = await fn();
      return { acquired: true, result };
    }
    // Jittered backoff — cheap and avoids thundering-herd on the same key.
    const sleep = 100 + Math.floor(Math.random() * 200);
    await new Promise((r) => setTimeout(r, sleep));
  }

  if (!acquired) {
    logger.warn('withCallerLock: could not acquire within wait window', {
      tenantId,
      callerPhone,
      waitMs: maxWaitMs,
    });
    return { acquired: false };
  }

  try {
    const result = await fn();
    return { acquired: true, result };
  } finally {
    // Check-and-delete: only release the lock if we still hold the token.
    try {
      const script =
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
      await redis.eval(script, 1, key, token);
    } catch (err) {
      logger.warn('withCallerLock: release failed (lease will expire naturally)', { err });
    }
  }
}

/**
 * Atomically acquires a short-lived lock for a given alert key.
 * Returns true if the lock was acquired (caller should fire the alert),
 * false if another caller already holds it within the TTL window.
 * Used to debounce noisy notifications like rapid-redial alerts.
 */
export async function acquireAlertLock(key: string, ttlSeconds: number): Promise<boolean> {
  try {
    const redis = getRedis();
    const result = await redis.set(`alertlock:${key}`, '1', 'EX', ttlSeconds, 'NX');
    return result !== null;
  } catch (error) {
    logger.error('acquireAlertLock error', { error });
    return true; // Fail open — better to over-alert than swallow
  }
}

export async function getRateCount(tenantId: string, callerPhone: string): Promise<number> {
  try {
    const redis = getRedis();
    const month = new Date().toISOString().slice(0, 7);
    const key = `ratelimit:${tenantId}:${callerPhone}:${month}`;
    const count = await redis.get(key);
    return count ? parseInt(count, 10) : 0;
  } catch (error) {
    logger.error('getRateCount error', { error });
    return 0;
  }
}
