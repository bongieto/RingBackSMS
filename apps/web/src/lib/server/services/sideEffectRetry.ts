/**
 * Retry + dead-letter shim for side-effect execution.
 *
 * Flow-engine emits side effects (SAVE_ORDER, CREATE_PAYMENT_LINK,
 * NOTIFY_OWNER, CREATE_POS_ORDER, etc.) and processInboundSms executes
 * them serially. Two classes of failures we care about:
 *
 *   1. Transient — Postgres deadlock, Stripe 5xx, Resend rate limit. A
 *      short retry usually wins.
 *   2. Persistent — misconfigured tenant, malformed payload, upstream
 *      outage. Retry won't help; we need a durable record so an operator
 *      (or a reprocessor cron) can follow up.
 *
 * This module:
 *   - `runWithRetry` runs a side-effect handler with exponential backoff
 *     (3 attempts, 200ms → 400ms → 800ms jittered). The caller still
 *     decides what happens when we finally give up.
 *   - `recordSideEffectFailure` writes a DLQ row to SideEffectFailure.
 *     Idempotent-ish: if the DB itself is unreachable we log and swallow
 *     so DLQ failure never masks the original error for the caller.
 *
 * We keep this out of flowEngineService.ts both for readability and so
 * unit tests can exercise the retry policy in isolation without
 * constructing the whole inbound-SMS pipeline.
 */
import { prisma } from '../db';
import { logger } from '../logger';

export interface RetryOptions {
  /** Number of attempts including the initial call. Default 3. */
  attempts?: number;
  /** Base delay in ms for exponential backoff. Default 200. */
  baseDelayMs?: number;
  /** Max delay cap between attempts. Default 2000. */
  maxDelayMs?: number;
  /**
   * Predicate: should this error be retried? Default is to retry all
   * errors. Return false to fail fast on permanent errors (e.g. 4xx
   * validation failures where retrying would just waste work).
   */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

export interface RetryResult<T> {
  value?: T;
  error?: unknown;
  attempts: number;
  succeeded: boolean;
}

export async function runWithRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<RetryResult<T>> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const baseDelay = opts.baseDelayMs ?? 200;
  const maxDelay = opts.maxDelayMs ?? 2000;
  const shouldRetry = opts.shouldRetry ?? (() => true);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const value = await fn();
      return { value, attempts: attempt, succeeded: true };
    } catch (err) {
      lastErr = err;
      if (attempt === attempts || !shouldRetry(err, attempt)) break;
      // Exponential backoff with jitter — spreads retries so two effects
      // failing for the same upstream reason don't retry in lockstep.
      const expDelay = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1));
      const jitter = Math.random() * expDelay * 0.3;
      await new Promise((r) => setTimeout(r, Math.floor(expDelay + jitter)));
    }
  }
  return { error: lastErr, attempts, succeeded: false };
}

export interface SideEffectFailureRow {
  tenantId: string;
  effectType: string;
  payload: unknown;
  conversationId: string | null;
  callerPhone: string | null;
  error: string;
  attempts: number;
}

/**
 * Writes a DLQ row. Swallows its own errors — if Postgres is down we
 * can't fix it from here, and throwing would mask the original effect
 * failure that triggered this call.
 */
export async function recordSideEffectFailure(
  row: SideEffectFailureRow,
): Promise<void> {
  try {
    await prisma.sideEffectFailure.create({
      data: {
        tenantId: row.tenantId,
        effectType: row.effectType,
        payload: row.payload as never,
        conversationId: row.conversationId,
        callerPhone: row.callerPhone,
        error: row.error.slice(0, 4000), // cap to keep the column sane
        attempts: row.attempts,
      },
    });
  } catch (err) {
    logger.error('Failed to persist SideEffectFailure row', {
      err: err instanceof Error ? err.message : String(err),
      effectType: row.effectType,
      tenantId: row.tenantId,
    });
  }
}
