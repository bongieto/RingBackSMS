/**
 * Property-based tests for the slot sequencer.
 *
 * The unit tests in slotSequence.test.ts cover the truth table for
 * `firstMissingSlot` directly. Those are useful but they only cover a
 * handful of hand-picked inputs. The strict-sequence enforcer in
 * orderAgent.ts depends on three invariants holding for EVERY possible
 * mid-conversation state, not just the ones we thought to test:
 *
 *   1. The returned slot is always one of `SLOT_SEQUENCE`.
 *   2. Every slot BEFORE the returned one is filled (we never skip).
 *   3. The returned slot maps to a valid step in `SLOT_TO_FLOW_STEP`.
 *
 * These tests use fast-check to generate thousands of random
 * (draft, name) tuples and assert all three. A bug in firstMissingSlot
 * that, say, returned 'pickup' before 'name' was filled would be caught
 * by property #2 even when it slipped past every example test.
 *
 * Cheap to run (each property samples ~100 cases by default).
 */
import fc from 'fast-check';
import { firstMissingSlot, SLOT_SEQUENCE, SLOT_TO_FLOW_STEP } from '../ai/slotSequence';

// Arbitrary that produces draft + name tuples in every combination of
// (items present?) × (name present?) × (pickup present?). We don't
// generate the whole OrderDraft — only the two fields the sequencer
// actually reads — so the test stays focused.
const arbDraftAndName = fc.record({
  itemCount: fc.integer({ min: 0, max: 5 }),
  hasName: fc.boolean(),
  // Pickup variants: undefined, empty string, whitespace, real value.
  // The agent treats all three falsy variants as "missing" and the
  // sequencer must agree.
  pickup: fc.oneof(
    fc.constant(undefined as string | undefined),
    fc.constant(''),
    fc.constant('   '),
    fc.constantFrom('6pm', 'tomorrow at noon', 'asap', '11:30 am'),
  ),
  // Same shape for name: any falsy value should be treated as missing.
  name: fc.oneof(
    fc.constant(null as string | null),
    fc.constant(undefined as string | undefined),
    fc.constant(''),
    fc.constantFrom('Maria', 'Bruno', 'Ana Delacruz', 'X'),
  ),
}).map(({ itemCount, hasName, pickup, name }) => {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    menuItemId: `item-${i}`,
    name: `Item ${i}`,
    quantity: 1,
    price: 5,
  })) as any;
  return {
    draft: { items, pickupTime: pickup },
    name: hasName ? name : null,
  };
});

describe('firstMissingSlot — properties', () => {
  it('always returns a slot that exists in SLOT_SEQUENCE', () => {
    fc.assert(
      fc.property(arbDraftAndName, ({ draft, name }) => {
        const slot = firstMissingSlot(draft, name);
        expect(SLOT_SEQUENCE).toContain(slot);
      }),
    );
  });

  it('every slot earlier in the sequence than the returned slot is satisfied', () => {
    // The whole point of the strict ladder: if the returned slot is
    // 'pickup', then BOTH 'items' and 'name' must already be filled.
    fc.assert(
      fc.property(arbDraftAndName, ({ draft, name }) => {
        const returned = firstMissingSlot(draft, name);
        const idx = SLOT_SEQUENCE.indexOf(returned);
        for (let i = 0; i < idx; i++) {
          const earlier = SLOT_SEQUENCE[i];
          if (earlier === 'items') {
            expect(draft.items.length).toBeGreaterThan(0);
          } else if (earlier === 'name') {
            // Name is satisfied iff non-empty after trim. The agent
            // treats null/undefined/empty as missing.
            expect(name && name.trim().length > 0).toBeTruthy();
          } else if (earlier === 'pickup') {
            expect(
              draft.pickupTime != null && String(draft.pickupTime).trim().length > 0,
            ).toBeTruthy();
          }
          // 'confirm' is the terminal slot — never appears as a
          // "satisfied earlier slot".
        }
      }),
    );
  });

  it('returned slot maps to a defined flow step', () => {
    fc.assert(
      fc.property(arbDraftAndName, ({ draft, name }) => {
        const slot = firstMissingSlot(draft, name);
        expect(SLOT_TO_FLOW_STEP[slot]).toBeTruthy();
        expect(typeof SLOT_TO_FLOW_STEP[slot]).toBe('string');
      }),
    );
  });

  it('confirm slot is reached ONLY when every earlier slot is satisfied', () => {
    // Inverse of property 2: if the function says we're done, then
    // every prerequisite must hold. Catches a regression where
    // firstMissingSlot accidentally short-circuits to 'confirm' on
    // some weird input shape.
    fc.assert(
      fc.property(arbDraftAndName, ({ draft, name }) => {
        if (firstMissingSlot(draft, name) === 'confirm') {
          expect(draft.items.length).toBeGreaterThan(0);
          expect(name && name.length > 0).toBeTruthy();
          expect(draft.pickupTime).toBeTruthy();
        }
      }),
    );
  });

  it('is deterministic — same inputs always yield same slot', () => {
    fc.assert(
      fc.property(arbDraftAndName, ({ draft, name }) => {
        const a = firstMissingSlot(draft, name);
        const b = firstMissingSlot(draft, name);
        expect(a).toBe(b);
      }),
    );
  });
});
