# ADR-001: Strict Slot Sequence + Hard Closed-Hours Gate in the Order Agent

- **Status**: Accepted
- **First shipped**: 2026-04-22 (commit `06d0a69`)
- **Last revised**: 2026-04-23 (Wave 1–3 follow-ups: shared constants, loop
  cap, property tests)

## Context

The SMS ordering agent is LLM-driven (Claude tool-use with a MiniMax
fallback). Customers text natural-language orders, the model calls
typed tools (`add_items`, `set_customer_name`, `set_pickup_time`,
`confirm_order`, …), and the agent commits the order once every slot
is filled.

The pre-2026-04-22 implementation trusted the LLM to decide *when* it
had enough to commit. In practice, four failure modes surfaced in QA:

1. **Slot-skipping** — the LLM jumped straight to `confirm_order`
   before `customerName` was captured, printing kitchen tickets with
   a blank name field.
2. **Closed-hours bypass** — the bot happily accepted "12:19 AM" as
   a pickup phrase at 12:19 AM when the restaurant was closed, then
   fired `SAVE_ORDER`. The operator paid a Stripe fee on an order
   that could never be picked up.
3. **Bare-name turns losing data** — a customer answering "Maria" at
   `ORDER_CONFIRM` had the string interpreted as a novel item instead
   of a name capture, and the flow looped.
4. **Stuck clarification loops** — a customer answering "sure" to
   "small or large?" three turns in a row would have the bot keep
   re-asking forever.

Loosening the prompt (adding rules like "capture data the customer
volunteered before asking the next question") helped but didn't
close the gap. The LLM's judgement was sometimes wrong, and the
blast radius of a single wrong judgement was an invalid order
reaching the kitchen.

## Decision

Two deterministic guards sit around the LLM call, making the
business-critical invariants structural rather than prompt-based.

### 1. Hard closed-hours gate

**Location**: `packages/flow-engine/src/ai/orderAgent.ts` (pre-LLM).

Before the LLM is called, if `tenantContext.hoursInfo.openNow === false`,
the agent returns a canonical refusal immediately:

```
Sorry — we're closed right now. Please text us back {nextOpen} to
place your order.
```

This overrides the per-tenant `acceptClosedHourOrders` config. Rationale:
operators who enable that flag want the bot to *schedule* a future
pickup when closed, but the QA cases we hit showed the LLM wasn't
reliable at distinguishing "pickup scheduled for tomorrow 6pm" from
"pickup at midnight tonight". A hard refusal is a conservative stance
we can relax later once we have structured pickup-time resolution (see
pickup-time validator, below — partially closes this loop).

A companion check (`pickupTimeValidator`) adds a second gate: even when
we're open, if the customer's concrete pickup phrase ("midnight",
"11:55pm") resolves to a time outside today's window, the agent refuses
with a specific apology instead of committing.

**Decision outcome tag**: `refused_closed` (see `DecisionOutcomes`).

### 2. Strict slot sequence enforcer

**Location**: `packages/flow-engine/src/ai/orderAgent.ts` (post-LLM).

The ladder is `items → name → pickup → confirm`, encoded in a single
module both the prompt and the enforcer import:

```ts
// packages/flow-engine/src/ai/slotSequence.ts
export const SLOT_SEQUENCE = ['items', 'name', 'pickup', 'confirm'] as const;
export function firstMissingSlot(draft, capturedName): SlotName { … }
```

On every turn, after the LLM response is parsed:

1. **Capture anything the customer volunteered** — items via
   `add_items`, name via `set_customer_name` OR the bare-name regex
   fallback (catches "Maria" when the LLM missed it), pickup via
   `set_pickup_time` OR `parsePickupPhrase()`.
2. **Compute `firstMissingSlot`** on the updated draft.
3. **If the LLM's proposed `flowStep` doesn't match**, force the step
   to the first-missing slot and overwrite the reply with a canonical
   prompt for that slot. Decision outcome:
   `sequence_corrected`.
4. **If the customer says "yes"** but a slot is still missing, ignore
   the confirm intent and sequence them back. Decision outcome:
   `confirm_blocked_missing_slot`.

Phone number is **never** in the sequence — we already have it from
the SMS sender header.

### 3. Shared constant, not duplicated prose

The prompt says "STRICT SEQUENCE: items → name → pickup → confirm."
That string is generated at prompt-build time from `SLOT_SEQUENCE`:

```ts
// buildAgentPrompt.ts
`4. **STRICT SEQUENCE: ${SLOT_SEQUENCE.join(' → ')}.**`
```

Result: renaming a slot or reordering requires a single edit; the LLM
and the enforcer can't drift.

### 4. Clarification loop cap

When the agent re-asks the same clarification field three turns in a
row without the customer providing a parseable answer, the agent
emits an `ESCALATE_TO_HUMAN` side effect. The host (`flowEngineService`)
flips `Conversation.handoffStatus = HUMAN`, notifies the owner, and
creates a follow-up task. Prevents the "bot asks 'small or large?'
forever" failure mode.

See: `clarificationLoop.ts`, `PendingClarification.attemptCount`.

## Consequences

### Positive

- **Kitchen tickets never ship without a name**. The single biggest
  operator complaint pre-gate.
- **No closed-hour orders** — enforced structurally, not by
  prompt-compliance.
- **Prompt and code can't drift** on sequence order (shared
  `SLOT_SEQUENCE`) or outcome tags (shared `DecisionOutcomes` enum) —
  typos fail the compile.
- **Clarification loops have an upper bound** — worst-case 3 asks
  then human handoff, audible in logs via
  `CLARIFICATION_LOOP_EXCEEDED`.

### Negative

- **Slightly more rigid UX**. A customer who says "6pm tomorrow for
  pickup, my name's Maria, two lumpia" in one message gets all three
  tools called and commits in one turn, so this is rare — but a
  customer who wants to change pickup time *after* confirming has to
  explicitly cancel. Acceptable tradeoff; kitchen stability wins.
- **The `acceptClosedHourOrders` config flag is partially dead**.
  The hard gate overrides it. If we ever want to fully support
  scheduled future pickups during closed hours, we'd need a real
  pickup-time resolver that distinguishes "tomorrow 6pm" from "11pm
  tonight" — the current regex-based `pickupIsFutureScheduled` check
  is close but not complete.
- **Bare-name regex has false-positive surface**. "Lumpia" as a
  one-word reply at `ORDER_NAME` could conceivably be captured as a
  customer name. Mitigated by checking the capture against menu-item
  names, but not bulletproof.

### Neutral

- The `flowStep` column is now advisory as far as the LLM is
  concerned — the enforcer decides. This means we can delete the
  `flowStep` gating logic that used to live in `processOrderFlow`.
  Not done yet; the regex flow remains as the chat-client-missing
  fallback.

## Alternatives considered

### Let the LLM manage state entirely

Rejected. Even with a very tight prompt, the LLM will sometimes
confirm before name is captured — and a wrong order ticket is a real
operator cost (refund, apology, lost customer). The enforcer trades a
small amount of flexibility for a lot of reliability.

### Run the LLM twice per turn (plan → act)

Rejected as too expensive. Two LLM calls per SMS doubles token cost
and latency; Twilio's 30-second Vercel-function budget leaves limited
headroom after DB + side effects.

### Move the enforcer into the prompt as JSON schema

Rejected. The LLM's tool-calling is already constrained by JSON
schema on tool inputs, but sequence *ordering* is a flow-level
invariant that schema can't express. Moving it to a deterministic
layer outside the LLM call sidesteps a whole class of prompt drift.

## Related code

- `packages/flow-engine/src/ai/orderAgent.ts` — the agent entry
  point with both gates.
- `packages/flow-engine/src/ai/slotSequence.ts` — the shared ladder
  constant + `firstMissingSlot`.
- `packages/flow-engine/src/ai/pickupTimeValidator.ts` — concrete
  clock-phrase validator used in the confirm gate.
- `packages/flow-engine/src/ai/clarificationLoop.ts` — attempt-count
  guard that routes to `ESCALATE_TO_HUMAN`.
- `packages/shared-types/src/decisionOutcomes.ts` — canonical
  outcome tags for analytics.

## Tests

- `slotSequence.test.ts` — truth table for the sequencer.
- `slotSequence.property.test.ts` — fast-check properties asserting
  the ladder invariants hold for any random (draft, name) pair.
- `orderFlowEndToEnd.test.ts` — four-turn simulation from empty
  cart through confirm.
- `pickupTimeValidator.test.ts` — 30 cases covering clock phrases,
  ASAP/now, overnight hours, grace windows.
- `clarificationLoop.test.ts` + `orderAgent.test.ts` — escalation on
  attempt ≥ 4 and reset on different-field ask.
