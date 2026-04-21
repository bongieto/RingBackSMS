/**
 * AsyncLocalStorage-backed per-turn context.
 *
 * Exists to solve one problem: handler code deep in the pre-handler chain
 * (e.g. `checkSuppression`) needs to log a Decision against "this inbound
 * SMS" without every call site threading a turn-id argument. ALS gives us
 * a request-scoped slot without a global mutable singleton or DI wiring.
 *
 * Flow-engine handlers DO NOT use this module — they live in a separate
 * package and receive `decisions: DecisionDraft[]` threaded via FlowInput
 * instead. This keeps flow-engine a pure, Prisma-free library.
 *
 * When `TURN_RECORD_ENABLED !== '1'`, `withTurn` never opens an ALS scope,
 * so `currentTurn()` returns undefined and `recordDecision` no-ops (with
 * a single warn log to flag the misuse, not on every call).
 */
import { AsyncLocalStorage } from 'async_hooks';
import type { DecisionDraft } from '@ringback/shared-types';
import { logger } from '@/lib/server/logger';

export interface TurnContextData {
  turnId: string;
  tenantId: string;
  callerPhone: string;
  startedAt: number;
  decisions: DecisionDraft[];
  llmCalled: boolean;
  llmLatencyMs: number;
  /** Filled in lazily by the host once fetchTenantContext returns, so we
   *  don't force a duplicate tenant query at Turn start. */
  tenantConfigSnapshot?: unknown;
  /** Filled in lazily alongside the tenantConfigSnapshot. */
  contactStateSnapshot?: unknown;
}

export const turnStorage = new AsyncLocalStorage<TurnContextData>();

export function currentTurn(): TurnContextData | undefined {
  return turnStorage.getStore();
}

export function currentTurnId(): string | undefined {
  return currentTurn()?.turnId;
}

let outsideContextWarned = false;

/**
 * Append a decision to the current turn. Silent no-op when called outside
 * a turn scope (feature flag off, or stray call from a background job).
 * We warn once per process to make the misuse visible without drowning
 * the logs.
 */
export function recordDecision(d: DecisionDraft): void {
  const ctx = currentTurn();
  if (!ctx) {
    if (!outsideContextWarned) {
      outsideContextWarned = true;
      logger.warn('[turn] recordDecision called outside turn context', {
        handler: d.handler,
      });
    }
    return;
  }
  ctx.decisions.push(d);
}

/**
 * Accumulate an LLM call's latency onto the current turn. Called from
 * apps/web AI client wrappers; flow-engine handlers push their own
 * "llm_called" Decision entries with model + token evidence.
 */
export function markLlmCall(latencyMs: number): void {
  const ctx = currentTurn();
  if (!ctx) return;
  ctx.llmCalled = true;
  ctx.llmLatencyMs += latencyMs;
}

/**
 * Merge decisions accumulated by a downstream package (flow-engine) into
 * the ALS-owned decisions array. Used by apps/web callers that received a
 * `decisions` array back from flow-engine and need to land them on the
 * same Turn row as the pre-handler decisions.
 */
/**
 * Populate snapshot fields once the host has them. Second call wins; the
 * typical shape is `setTurnSnapshots({ tenantConfigSnapshot, contactStateSnapshot })`
 * right after `fetchTenantContext` returns.
 */
export function setTurnSnapshots(snap: {
  tenantConfigSnapshot?: unknown;
  contactStateSnapshot?: unknown;
}): void {
  const ctx = currentTurn();
  if (!ctx) return;
  if (snap.tenantConfigSnapshot !== undefined) {
    ctx.tenantConfigSnapshot = snap.tenantConfigSnapshot;
  }
  if (snap.contactStateSnapshot !== undefined) {
    ctx.contactStateSnapshot = snap.contactStateSnapshot;
  }
}

export function mergeDecisions(drafts: DecisionDraft[]): void {
  const ctx = currentTurn();
  if (!ctx || drafts.length === 0) return;
  for (const d of drafts) ctx.decisions.push(d);
}
