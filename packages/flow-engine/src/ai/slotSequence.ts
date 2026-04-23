/**
 * Canonical order-agent slot sequence.
 *
 * The strict-sequence rule — items → name → pickup → confirm — is
 * defined in TWO places that MUST agree:
 *
 *   1. The system prompt (`buildAgentPrompt.ts`), which instructs the
 *      LLM how to ladder through slots.
 *   2. The enforcer (`orderAgent.ts`), which computes the first missing
 *      slot and overrides flowStep + reply when the LLM skips ahead.
 *
 * When these two drift (prompt updated but enforcer not, or vice versa)
 * the bot and enforcer disagree and the customer ends up in a weird
 * intermediate state. Centralizing the sequence here makes drift
 * physically impossible: both sides import from this file.
 *
 * Order matters: index N must always be the step that fills slot N.
 * The prompt references this as "STRICT SEQUENCE"; rewording the labels
 * here requires rewording the prompt in the same commit.
 */

import type { OrderDraft } from '@ringback/shared-types';

export const SLOT_SEQUENCE = ['items', 'name', 'pickup', 'confirm'] as const;
export type SlotName = (typeof SLOT_SEQUENCE)[number];

/** Canonical flow-step label for each slot in the sequence. */
export const SLOT_TO_FLOW_STEP: Record<SlotName, string> = {
  items: 'MENU_DISPLAY',
  name: 'ORDER_NAME',
  pickup: 'PICKUP_TIME',
  confirm: 'ORDER_CONFIRM',
};

/**
 * Returns the first slot in `SLOT_SEQUENCE` that isn't yet filled by
 * the given draft + captured name. If everything is filled, returns
 * 'confirm' (the terminal step).
 *
 * Passing capturedName separately (rather than reading it off the
 * draft) matches the enforcer's call-site: name can be captured by the
 * LLM tool OR the bare-name regex, and the orderAgent tracks them
 * together in a local `capturedName` variable.
 */
export function firstMissingSlot(
  draft: Pick<OrderDraft, 'items' | 'pickupTime'>,
  capturedName: string | null | undefined,
): SlotName {
  if (draft.items.length === 0) return 'items';
  if (!capturedName) return 'name';
  if (!draft.pickupTime) return 'pickup';
  return 'confirm';
}
