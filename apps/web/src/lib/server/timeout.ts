/**
 * Timeout helpers for the SMS hot path.
 *
 * Twilio's webhook budget is 10s; we respond 200 OK immediately and run
 * processing under Vercel's `waitUntil`, which gets up to 30s. Within
 * that window we chain: Redis state read → Prisma tenant load → optional
 * LLM call → Prisma conversation write → Twilio SMS send → side effects.
 * A single hung step (Postgres lock contention, a misbehaving LLM
 * provider) can swallow the whole budget and leave the customer with no
 * reply. Wrapping the slowest boundary calls with an explicit timeout
 * lets the rest of the turn complete on a fallback path instead.
 *
 * Keep it tight: this module has no dependencies, so callers in the
 * apps/web and flow-engine packages can both import it without pulling
 * in Prisma or ioredis.
 */

export class TimeoutError extends Error {
  public readonly label: string;
  public readonly timeoutMs: number;
  constructor(label: string, timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms: ${label}`);
    this.name = 'TimeoutError';
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Races `p` against a timer. On timeout, rejects with `TimeoutError`. The
 * underlying promise keeps running — we can't cancel an awaited Prisma
 * query — so `label` is surfaced on the error to make the noise
 * debuggable in logs.
 */
export function withTimeout<T>(
  p: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, timeoutMs)), timeoutMs);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Runs `fn` with a timeout, returning `fallback` (or the fallback
 * producer's result) instead of throwing when the timeout fires. Use
 * this at boundaries where "no answer in N ms" is better than a hung
 * request — e.g. non-critical Prisma lookups where a cached or null
 * value is acceptable.
 *
 * Unlike `withTimeout`, this does not re-throw non-timeout errors either:
 * `onError` is invoked for both timeouts and thrown errors so callers
 * can log once and decide.
 */
export async function withTimeoutFallback<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  fallback: T | (() => T),
  opts: {
    label: string;
    onError?: (err: unknown, isTimeout: boolean) => void;
  },
): Promise<T> {
  try {
    return await withTimeout(fn(), timeoutMs, opts.label);
  } catch (err) {
    const isTimeout = err instanceof TimeoutError;
    if (opts.onError) {
      try {
        opts.onError(err, isTimeout);
      } catch {
        // onError must not mask the fallback path.
      }
    }
    return typeof fallback === 'function' ? (fallback as () => T)() : fallback;
  }
}
