import { findUngroundedGuard, UNGROUNDED_GUARDS } from '../flows/fallbackFlow';
import type { CallerMemory } from '../types';

const emptyMemory: CallerMemory = {
  contactName: null,
  contactStatus: null,
  tier: 'NEW',
  lastOrderSummary: null,
  lastConversationPreview: null,
  activeOrder: null,
};

const withActiveOrder: CallerMemory = {
  ...emptyMemory,
  activeOrder: {
    orderNumber: 'ORD-TEST-001',
    status: 'CONFIRMED',
    estimatedReadyTime: null,
    pickupTime: '6:30pm',
    itemsSummary: '1× Siomai',
    total: 5.99,
  },
};

describe('findUngroundedGuard', () => {
  describe('bare_confirm', () => {
    test.each([
      'yes',
      'Yes',
      'yes confirm',
      'y',
      'yep',
      'confirm',
      'sure',
      'go ahead',
      'confirm it',
      'yes.',
      'yes!',
    ])('"%s" with no active order → deflects', (msg) => {
      const g = findUngroundedGuard(msg, emptyMemory);
      expect(g?.name).toBe('bare_confirm');
    });

    test('"yes can I get 2 lumpia" (compound) → does NOT deflect', () => {
      // Whole-message anchor so compound-intent messages flow through.
      const g = findUngroundedGuard('yes can I get 2 lumpia', emptyMemory);
      expect(g).toBeNull();
    });

    test('"yes" with active order → does NOT deflect (LLM handles it)', () => {
      const g = findUngroundedGuard('yes', withActiveOrder);
      expect(g).toBeNull();
    });
  });

  describe('cancel_without_order', () => {
    test.each([
      'cancel',
      'Cancel',
      'cancel my order',
      'cancel the order',
      'cancel my last order',
      'nvm cancel',
      'never mind cancel',
      'cancel.',
    ])('"%s" with no active order → deflects', (msg) => {
      const g = findUngroundedGuard(msg, emptyMemory);
      expect(g?.name).toBe('cancel_without_order');
    });

    test('"cancel the lumpia I just added" (compound) → does NOT deflect', () => {
      const g = findUngroundedGuard('cancel the lumpia I just added', emptyMemory);
      expect(g).toBeNull();
    });

    test('"cancel" with active order → does NOT deflect', () => {
      const g = findUngroundedGuard('cancel', withActiveOrder);
      expect(g).toBeNull();
    });
  });

  describe('order_status_without_order', () => {
    test.each([
      "where's my order",
      "wheres my order",
      'is my order ready',
      'order status',
      'status of my order',
      "how's my order",
      'hows my order',
      "where's my order?",
    ])('"%s" with no active order → deflects', (msg) => {
      const g = findUngroundedGuard(msg, emptyMemory);
      expect(g?.name).toBe('order_status_without_order');
    });

    test('"where\'s my order" with active order → does NOT deflect', () => {
      const g = findUngroundedGuard("where's my order", withActiveOrder);
      expect(g).toBeNull();
    });
  });

  describe('refund_request', () => {
    test.each([
      'refund please',
      'refund me',
      'i want a refund',
      'i want my refund',
      'can i get a refund',
      "where's my refund",
      'i need a refund',
      'refund me please',
    ])('"%s" → always deflects (refunds handled by humans)', (msg) => {
      const g = findUngroundedGuard(msg, withActiveOrder);
      expect(g?.name).toBe('refund_request');
    });
  });

  describe('guard reply generation', () => {
    test('refund reply with phone interpolates both name + phone', () => {
      const rule = UNGROUNDED_GUARDS.find((r) => r.name === 'refund_request');
      expect(rule).toBeDefined();
      const reply = typeof rule!.reply === 'function'
        ? rule!.reply({ tenantName: 'Lumpia House', tenantPhone: '+12175550100' })
        : rule!.reply;
      expect(reply).toContain('Lumpia House');
      expect(reply).toContain('+12175550100');
    });

    test('refund reply falls back gracefully with no tenant phone', () => {
      const rule = UNGROUNDED_GUARDS.find((r) => r.name === 'refund_request');
      const reply = typeof rule!.reply === 'function'
        ? rule!.reply({ tenantName: 'Lumpia House', tenantPhone: null })
        : rule!.reply;
      expect(reply).toContain('Lumpia House');
      // When no phone we don't leak a literal "null" or "undefined"
      expect(reply).not.toMatch(/null|undefined/i);
    });
  });
});
