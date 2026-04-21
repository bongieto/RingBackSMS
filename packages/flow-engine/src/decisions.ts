/**
 * Decision-drafting helpers for flow handlers.
 *
 * Flow-engine is a pure library: no Prisma, no AsyncLocalStorage. The host
 * (apps/web) passes an optional `decisions: DecisionDraft[]` array on
 * FlowInput; handlers push onto it via `pushDecision`. When absent, pushes
 * no-op — instrumentation is free when the Turn Record layer is disabled.
 *
 * Also exports `time()`: wraps a synchronous or async block and returns
 * the value along with its wall-clock duration. Handlers can then push a
 * single Decision with the correct `durationMs` without scattering
 * `const t = Date.now()` / `Date.now() - t` across every call site.
 */
import type { DecisionDraft, DecisionPhase } from '@ringback/shared-types';
import type { FlowInput } from './types';

export type DecisionDraftInput = Omit<DecisionDraft, 'phase'> & {
  phase?: DecisionPhase;
};

/**
 * Append a Decision to the host-provided sink. No-op when the host did
 * not pass a `decisions` array (feature flag off, unit test, etc.).
 */
export function pushDecision(
  input: Pick<FlowInput, 'decisions'>,
  draft: DecisionDraftInput,
): void {
  const sink = input.decisions;
  if (!sink) return;
  sink.push({
    handler: draft.handler,
    phase: draft.phase ?? 'FLOW',
    outcome: draft.outcome,
    reason: draft.reason,
    evidence: draft.evidence,
    durationMs: draft.durationMs,
  });
}

/** Time an async block; returns `{ value, durationMs }`. */
export async function timeAsync<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; durationMs: number }> {
  const t0 = Date.now();
  const value = await fn();
  return { value, durationMs: Date.now() - t0 };
}

/** Time a sync block; returns `{ value, durationMs }`. */
export function timeSync<T>(fn: () => T): { value: T; durationMs: number } {
  const t0 = Date.now();
  const value = fn();
  return { value, durationMs: Date.now() - t0 };
}
