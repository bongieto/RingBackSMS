import { Redis } from 'ioredis';
import { NextResponse } from 'next/server';
import { logger } from './logger';
import { buildRedisOptions } from './redisConfig';

/**
 * Redis-backed sliding-window rate limiter for Next.js route handlers.
 *
 * Fails OPEN on Redis errors (logs + allows request) to avoid taking the
 * platform down if Redis is unavailable. Matches the pattern used in
 * apps/api/src/middleware/rateLimiter.ts.
 */

let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      ...buildRedisOptions(),
      enableOfflineQueue: false,
    });
    redisClient.on('error', (err) => {
      // Avoid noisy logs — single-shot log on connection errors
      logger.warn('Rate limiter Redis error', { error: (err as Error).message });
    });
  }
  return redisClient;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch seconds
  limit: number;
}

/**
 * Fixed-window rate limit. Returns allowed=false when over the limit.
 * Fails open on Redis errors.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const fullKey = `ratelimit:${key}`;
  try {
    const redis = getRedis();
    const count = await redis.incr(fullKey);
    if (count === 1) {
      await redis.expire(fullKey, windowSec);
    }
    const ttl = await redis.ttl(fullKey);
    const resetAt = Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : windowSec);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt,
      limit,
    };
  } catch (err) {
    logger.warn('Rate limiter failed open', { key, error: (err as Error).message });
    return { allowed: true, remaining: limit, resetAt: Math.floor(Date.now() / 1000) + windowSec, limit };
  }
}

/**
 * Returns a 429 NextResponse with standard rate-limit headers.
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfter = Math.max(1, result.resetAt - Math.floor(Date.now() / 1000));
  return NextResponse.json(
    { error: 'Too many requests' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(result.resetAt),
      },
    },
  );
}

/**
 * Extracts a best-effort client IP from request headers.
 * Vercel/Cloudflare/AWS-style headers covered.
 */
export function getClientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = headers.get('x-real-ip');
  if (real) return real;
  const cf = headers.get('cf-connecting-ip');
  if (cf) return cf;
  return 'unknown';
}

/**
 * Per-user rate limit for authenticated routes. Returns a 429
 * NextResponse when the caller has exceeded the budget, else null to
 * proceed.
 *
 * Bucket naming convention is free-form but should be coarse (e.g.
 * `admin`, `tenant-config`, `billing-portal`) — finer granularity
 * means operators trip their own quota with normal dashboard use.
 *
 * Falls back to IP when userId is missing (unauthenticated hits that
 * slipped past the auth gate). The IP-side limit is deliberately
 * tighter than the user-side one because a caller bypassing auth is
 * already suspicious.
 *
 * Typical call shape:
 *
 *     const limited = await checkAuthRateLimit(userId, req.headers, 'admin');
 *     if (limited) return limited;
 *
 * Wire this into any authenticated mutation route (PATCH / POST /
 * DELETE) where abuse would matter — config writes, billing portal
 * creation, admin endpoints. Read-only listing endpoints don't need
 * it unless they're expensive.
 */
export async function checkAuthRateLimit(
  userId: string | null | undefined,
  headers: Headers,
  bucket: string = 'auth',
  opts: { userLimit?: number; ipLimit?: number; windowSec?: number } = {},
): Promise<NextResponse | null> {
  const userLimit = opts.userLimit ?? 120;  // 120 req/min/user — generous for a busy dashboard user
  const ipLimit = opts.ipLimit ?? 60;        // 60 req/min/ip for unauthenticated fallback
  const windowSec = opts.windowSec ?? 60;
  const key = userId ? `${bucket}:user:${userId}` : `${bucket}:ip:${getClientIp(headers)}`;
  const limit = userId ? userLimit : ipLimit;
  const result = await checkRateLimit(key, limit, windowSec);
  if (!result.allowed) {
    return rateLimitResponse(result);
  }
  return null;
}
