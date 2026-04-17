import { Redis } from 'ioredis';
import { CallerState, CallerStateSchema } from '@ringback/shared-types';
import { logger } from '../logger';
import { buildRedisOptions } from '../redisConfig';

const STATE_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const DEDUP_TTL_SECONDS = 60 * 5; // 5 minutes

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
 */
export async function isDuplicate(tenantId: string, messageSid: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const key = dedupKey(tenantId, messageSid);
    const result = await redis.set(key, '1', 'EX', DEDUP_TTL_SECONDS, 'NX');
    return result === null; // null means key already existed
  } catch (error) {
    logger.error('isDuplicate error', { error });
    return false; // Fail open
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
