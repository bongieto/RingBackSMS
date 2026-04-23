import {
  stripThinkTags,
  looksLikeFreshOrderList,
  looksLikeRejectCart,
  parsePickupPhrase,
  cloneDraft,
  canonicalPrompt,
  buildOwnerOrderSummary,
} from '../ai/orderAgentHelpers';

describe('orderAgentHelpers', () => {
  describe('stripThinkTags', () => {
    it('removes balanced <think>…</think> blocks and the following whitespace', () => {
      // The regex eats the trailing \s* as well, so "Hello <think>…</think> world"
      // collapses down to "Hello world" (single space) — cleaner for SMS output.
      const input = 'Hello <think>let me reason</think> world';
      expect(stripThinkTags(input)).toBe('Hello world');
    });

    it('removes dangling <think> with no close (mid-response truncation)', () => {
      const input = 'Reply body <think>reasoning truncated';
      expect(stripThinkTags(input)).toBe('Reply body');
    });

    it('leaves content without think tags untouched', () => {
      expect(stripThinkTags('Plain reply')).toBe('Plain reply');
    });
  });

  describe('looksLikeFreshOrderList', () => {
    it.each([
      "I'll have two Pancit Bihon and a lumpia",
      'Can I get 3 lumpia please',
      'I would like a lumpia please',
      'I want to order two Pancit Bihon',
      '#A1 Lumpia',
      '1 #A1 Lumpia Regular',
    ])('returns true for %p', (input) => {
      expect(looksLikeFreshOrderList(input)).toBe(true);
    });

    it.each([
      'add 1 #a6 fries',             // explicit ADD prefix — don't reset cart
      'also two fries',              // continuation
      'and another lumpia',
      'hi',                          // too short
      'yes',                         // no intent phrase
      'Order:',                      // below 10-char threshold
    ])('returns false for %p', (input) => {
      expect(looksLikeFreshOrderList(input)).toBe(false);
    });
  });

  describe('looksLikeRejectCart', () => {
    it.each([
      "that's not my order",
      "that's not what I wanted",
      'wrong order',
      "that's wrong",
      "nope that's wrong",
    ])('returns true for %p', (input) => {
      expect(looksLikeRejectCart(input)).toBe(true);
    });

    it('returns false for benign text', () => {
      expect(looksLikeRejectCart('yes that works')).toBe(false);
      expect(looksLikeRejectCart('sounds good')).toBe(false);
    });
  });

  describe('parsePickupPhrase', () => {
    it('accepts ASAP-family phrases', () => {
      expect(parsePickupPhrase('asap')).toBe('asap');
      expect(parsePickupPhrase('RIGHT NOW')).toBe('right now');
      expect(parsePickupPhrase('whenever is fine')).toBe('whenever is fine');
    });

    it('accepts clock times with am/pm', () => {
      expect(parsePickupPhrase('6pm')).toBe('6pm');
      expect(parsePickupPhrase('6:30 PM')).toBe('6:30 pm');
    });

    it('strips filler prefixes', () => {
      expect(parsePickupPhrase('pickup at 6pm')).toBe('6pm');
      expect(parsePickupPhrase('schedule for 6pm')).toBe('6pm');
      expect(parsePickupPhrase('at 6pm')).toBe('6pm');
    });

    it('accepts relative and named times', () => {
      expect(parsePickupPhrase('in 30 minutes')).toBe('in 30 minutes');
      expect(parsePickupPhrase('tonight')).toBe('tonight');
      expect(parsePickupPhrase('noon')).toBe('noon');
    });

    it('rejects chatter that has no time signal', () => {
      expect(parsePickupPhrase('sure sounds good')).toBeNull();
      expect(parsePickupPhrase('hello')).toBeNull();
      expect(parsePickupPhrase('')).toBeNull();
    });
  });

  describe('cloneDraft', () => {
    it('returns a fresh empty draft for null/undefined', () => {
      expect(cloneDraft(null)).toEqual({ items: [] });
      expect(cloneDraft(undefined)).toEqual({ items: [] });
    });

    it('deep-clones items and modifier arrays so mutations do not leak', () => {
      const draft = {
        items: [
          {
            menuItemId: 'x',
            name: 'Lumpia',
            quantity: 2,
            price: 5,
            selectedModifiers: [{ groupName: 'Size', modifierName: 'Large', priceAdjust: 1 }],
          },
        ],
        pickupTime: '6pm',
        notes: 'extra sauce',
      };
      const clone = cloneDraft(draft);
      clone.items[0].quantity = 99;
      clone.items[0].selectedModifiers!.push({ groupName: 'X', modifierName: 'Y', priceAdjust: 0 });
      expect(draft.items[0].quantity).toBe(2);
      expect(draft.items[0].selectedModifiers).toHaveLength(1);
    });
  });

  describe('buildOwnerOrderSummary', () => {
    it('renders one line per item with bracketed modifiers', () => {
      const items = [
        {
          menuItemId: 'a',
          name: 'Lumpia',
          quantity: 2,
          price: 5,
          selectedModifiers: [{ groupName: 'Size', modifierName: 'Small', priceAdjust: 0 }],
        },
        { menuItemId: 'b', name: 'Pancit', quantity: 1, price: 8 },
      ];
      expect(buildOwnerOrderSummary(items)).toBe('2× Lumpia [Size: Small]\n1× Pancit');
    });
  });

  describe('canonicalPrompt', () => {
    const emptyDraft = { items: [] };
    it('emits an items prompt with name when provided', () => {
      expect(canonicalPrompt('items', emptyDraft, 'Maria')).toMatch(/Got it, Maria/);
    });
    it('emits a nameless items prompt otherwise', () => {
      expect(canonicalPrompt('items', emptyDraft, null)).toMatch(/What can I get you/);
    });
    it('emits the canonical name prompt', () => {
      expect(canonicalPrompt('name', emptyDraft, null)).toMatch(/name should I put/);
    });
    it('emits the canonical pickup prompt', () => {
      expect(canonicalPrompt('pickup', emptyDraft, 'Maria')).toMatch(/What time/);
    });
    it('emits a confirm prompt with the cart summary', () => {
      const draft = {
        items: [{ menuItemId: 'a', name: 'Lumpia', quantity: 2, price: 5 }],
        pickupTime: '6pm',
      };
      const out = canonicalPrompt('confirm', draft, 'Maria');
      expect(out).toMatch(/Lumpia/);
      expect(out).toMatch(/6pm/);
      expect(out).toMatch(/confirm/i);
    });
  });
});
