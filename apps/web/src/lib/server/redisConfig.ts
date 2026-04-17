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
/**
 * Clean an env-var-sourced URL. Handles two common paste mistakes:
 * 1. Leading/trailing whitespace
 * 2. Surrounding quotes ("rediss://..." or 'rediss://...')
 */
function cleanUrl(raw: string): string {
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

export function buildRedisOptions(urlStr?: string): RedisOptions {
  const url = urlStr ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
  try {
    const cleaned = cleanUrl(url);
    const u = new URL(cleaned);
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

/**
 * Debug-only helper that returns metadata about the Redis URL without
 * leaking the password. Used by the admin health check.
 */
export function describeRedisUrl(): {
  set: boolean;
  parsed: boolean;
  host?: string;
  port?: number;
  protocol?: string;
  hasPassword?: boolean;
  parseError?: string;
} {
  const raw = process.env.REDIS_URL;
  if (!raw) return { set: false, parsed: false };
  try {
    const u = new URL(cleanUrl(raw));
    return {
      set: true,
      parsed: true,
      host: u.hostname,
      port: u.port ? Number(u.port) : 6379,
      protocol: u.protocol,
      hasPassword: !!u.password,
    };
  } catch (err) {
    return { set: true, parsed: false, parseError: (err as Error).message };
  }
}
