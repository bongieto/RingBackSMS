import type { RedisOptions } from 'ioredis';

/**
 * Parse REDIS_URL ourselves so percent-encoded characters in the
 * password (e.g. %2F for '/', %40 for '@') are decoded correctly.
 * ioredis's URL parser leaves them encoded which can cause "connect EINVAL"
 * errors with Upstash and other managed Redis providers.
 *
 * Shared across stateService, rateLimit, and usageMeterService so the
 * exact same connection options are used everywhere.
 */
export function buildRedisOptions(urlStr?: string): RedisOptions {
  const url = urlStr ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
  try {
    const u = new URL(url);
    const opts: RedisOptions = {
      host: u.hostname,
      port: u.port ? Number(u.port) : 6379,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      // Enable TLS for rediss:// (Upstash and other managed Redis)
      ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
    };
    // decodeURIComponent handles %2F, %40, etc. in the password
    if (u.username) opts.username = decodeURIComponent(u.username);
    if (u.password) opts.password = decodeURIComponent(u.password);
    return opts;
  } catch {
    // Invalid URL — fall back to localhost so local dev doesn't crash.
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };
  }
}
