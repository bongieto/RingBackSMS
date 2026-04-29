import { logger } from './logger';

export function startTimer() {
  const startedAt = Date.now();
  return {
    elapsedMs: () => Date.now() - startedAt,
  };
}

export function logTiming(
  event: string,
  timer: ReturnType<typeof startTimer>,
  meta: Record<string, unknown> = {},
): void {
  logger.info(event, {
    ...meta,
    latencyMs: timer.elapsedMs(),
  });
}

export async function timed<T>(
  event: string,
  meta: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const timer = startTimer();
  try {
    const result = await fn();
    logTiming(event, timer, { ...meta, ok: true });
    return result;
  } catch (err) {
    logger.error(event, {
      ...meta,
      ok: false,
      latencyMs: timer.elapsedMs(),
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
