import { Redis } from 'ioredis';
import { NextResponse } from 'next/server';
import { logger } from './logger';

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
    redisClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
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
