import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger';
import { RateLimitError } from '../utils/errors';

interface RateLimiterOptions {
  maxRequests: number;
  windowSeconds: number;
}

const DEFAULT_OPTIONS: RateLimiterOptions = {
  maxRequests: 20,
  windowSeconds: 3600, // 1 hour
};

let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redisClient;
}

/**
 * Redis-backed rate limiter scoped per tenant + caller phone.
 * Key format: ratelimit:{tenantId}:{callerPhone}
 */
export function createRateLimiter(options: Partial<RateLimiterOptions> = {}) {
  const { maxRequests, windowSeconds } = { ...DEFAULT_OPTIONS, ...options };

  return async function rateLimiter(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const tenantId = req.tenantId;
    const callerPhone: string | undefined = req.body?.From as string | undefined;

    if (!tenantId || !callerPhone) {
      next();
      return;
    }

    const key = `ratelimit:${tenantId}:${callerPhone}`;

    try {
      const redis = getRedis();
      const current = await redis.incr(key);

      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }

      if (current > maxRequests) {
        logger.warn('Rate limit exceeded', {
          tenantId,
          callerPhone: callerPhone.slice(-4),
          count: current,
        });
        throw new RateLimitError(
          `Too many messages. Please wait before sending more.`
        );
      }

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current));
      next();
    } catch (error) {
      if (error instanceof RateLimitError) {
        next(error);
        return;
      }
      // Redis failure — fail open to avoid blocking legitimate traffic
      logger.error('Rate limiter Redis error', { error });
      next();
    }
  };
}

export const smsRateLimiter = createRateLimiter({ maxRequests: 20, windowSeconds: 3600 });
