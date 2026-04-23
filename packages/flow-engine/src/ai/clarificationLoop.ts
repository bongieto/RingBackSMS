/**
 * Clarification-loop guard for the ORDER agent.
 *
 * The order agent asks for one piece of information at a time (pickup
 * time, missing modifier, etc.) via a `pendingClarification` slot on
 * caller state. If the customer's answer doesn't satisfy the slot, we
 * re-ask next turn. Without a cap, a customer who keeps replying "sure"
 * to "small or large?" would bounce between the two forever.
 *
 * This module centralizes the "same field being asked again" detection
 * and the ceiling. Call `advanceClarification` at every site that emits
 * a `pendingClarification` — it returns the new clarification (with
 * bumped attemptCount) AND a boolean indicating whether the cap has
 * been exceeded, in which case the caller should escalate to a human
 * instead of re-asking.
 */

import type { PendingClarification } from '@ringback/shared-types';

/** After this many consecutive asks of the same field, escalate. */
export const MAX_CLARIFICATION_ATTEMPTS = 3;

export interface AdvanceResult {
  /** The clarification to persist next. askedAt already bumped to now. */
  clarification: PendingClarification;
  /** True when the NEW attemptCount has reached or exceeded the cap. */
  exceeded: boolean;
  /** Same as `clarification.attemptCount`, surfaced for caller telemetry. */
  attemptCount: number;
}

export function advanceClarification(
  prev: PendingClarification | null | undefined,
  next: { field: string; question: string },
  now: number = Date.now(),
): AdvanceResult {
  const sameField = prev?.field === next.field;
  // If we're asking the same field as last turn, bump the counter.
  // If we're asking a different field (or this is the first clarification),
  // start a fresh count of 1.
  const attemptCount = sameField ? (prev?.attemptCount ?? 1) + 1 : 1;
  return {
    clarification: {
      field: next.field,
      question: next.question,
      askedAt: now,
      attemptCount,
    },
    exceeded: attemptCount > MAX_CLARIFICATION_ATTEMPTS,
    attemptCount,
  };
}

/**
 * The canonical message we send when we've given up asking and are
 * handing the conversation to a human. Kept here (not inline at the
 * escalation site) so every escalation path speaks with one voice.
 */
export const ESCALATION_SMS_REPLY =
  "I'm having trouble understanding — a team member will follow up with you shortly. Sorry for the trouble!";
