import { SLOT_SEQUENCE, SLOT_TO_FLOW_STEP, firstMissingSlot } from '../ai/slotSequence';

describe('slotSequence', () => {
  it('sequence order matches the strict ladder (regression guard)', () => {
    // If this test fails, the prompt in buildAgentPrompt.ts AND the
    // enforcer in orderAgent.ts both need to be rewritten in the same
    // commit — the order is load-bearing, not stylistic.
    expect(SLOT_SEQUENCE).toEqual(['items', 'name', 'pickup', 'confirm']);
  });

  it('every slot has a flow step mapping', () => {
    for (const slot of SLOT_SEQUENCE) {
      expect(SLOT_TO_FLOW_STEP[slot]).toBeTruthy();
    }
  });

  describe('firstMissingSlot', () => {
    const empty = { items: [], pickupTime: undefined };

    it('returns "items" when cart is empty', () => {
      expect(firstMissingSlot(empty, null)).toBe('items');
      expect(firstMissingSlot(empty, 'Maria')).toBe('items'); // items comes first even if name is known
    });

    it('returns "name" when items are present but name is missing', () => {
      const draft = {
        items: [{ menuItemId: 'x', name: 'Lumpia', quantity: 1, price: 5 } as any],
        pickupTime: undefined,
      };
      expect(firstMissingSlot(draft, null)).toBe('name');
      expect(firstMissingSlot(draft, '')).toBe('name');
      expect(firstMissingSlot(draft, undefined)).toBe('name');
    });

    it('returns "pickup" when items + name are set but pickup is missing', () => {
      const draft = {
        items: [{ menuItemId: 'x', name: 'Lumpia', quantity: 1, price: 5 } as any],
        pickupTime: undefined,
      };
      expect(firstMissingSlot(draft, 'Maria')).toBe('pickup');
    });

    it('returns "confirm" when every slot is filled', () => {
      const draft = {
        items: [{ menuItemId: 'x', name: 'Lumpia', quantity: 1, price: 5 } as any],
        pickupTime: '6pm',
      };
      expect(firstMissingSlot(draft, 'Maria')).toBe('confirm');
    });
  });
});
