import { runFlowEngine } from '../engine';
import { TenantContext, FlowInput, ChatFn } from '../types';
import { FlowType, BusinessType, Plan } from '@ringback/shared-types';

// Mock chatFn — simulates Claude/AI responses
const mockChatFn: ChatFn = jest.fn().mockResolvedValue('{"intent": "ORDER", "confidence": 0.9}');

const mockTenantContext: TenantContext = {
  tenantId: '00000000-0000-0000-0000-000000000001',
  tenantName: 'Test Restaurant',
  config: {
    id: '00000000-0000-0000-0000-000000000002',
    tenantId: '00000000-0000-0000-0000-000000000001',
    greeting: 'Hi! Thanks for calling Test Restaurant.',
    timezone: 'America/Chicago',
    businessHoursStart: '11:00',
    businessHoursEnd: '20:00',
    businessDays: [3, 4, 5, 6, 0],
    aiPersonality: null,
    calcomLink: null,
    slackWebhook: null,
    ownerEmail: 'owner@test.com',
    ownerPhone: '+12175550100',
    businessAddress: null,
    websiteUrl: null,
    websiteContext: null,
    closedDates: [],
    voiceGreeting: null,
    voiceType: 'nova',
    squareSyncEnabled: false,
    squareAutoSync: false,
    posSyncEnabled: false,
    posAutoSync: false,
    requirePayment: false,
    ordersAcceptingEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any,
  flows: [
    {
      id: '00000000-0000-0000-0000-000000000003',
      tenantId: '00000000-0000-0000-0000-000000000001',
      type: FlowType.ORDER,
      isEnabled: true,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '00000000-0000-0000-0000-000000000004',
      tenantId: '00000000-0000-0000-0000-000000000001',
      type: FlowType.MEETING,
      isEnabled: true,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '00000000-0000-0000-0000-000000000005',
      tenantId: '00000000-0000-0000-0000-000000000001',
      type: FlowType.FALLBACK,
      isEnabled: true,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  menuItems: [
    {
      id: '00000000-0000-0000-0000-000000000010',
      tenantId: '00000000-0000-0000-0000-000000000001',
      name: 'Lumpia Shanghai',
      description: 'Crispy Filipino spring rolls',
      price: 8.99,
      category: 'Appetizers',
      isAvailable: true,
      duration: null,
      requiresBooking: false,
      squareCatalogId: null,
      squareVariationId: null,
      posCatalogId: null,
      posVariationId: null,
      lastSyncedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '00000000-0000-0000-0000-000000000011',
      tenantId: '00000000-0000-0000-0000-000000000001',
      name: 'Pancit Bihon',
      description: 'Filipino stir-fried noodles',
      price: 11.99,
      category: 'Mains',
      isAvailable: true,
      duration: null,
      requiresBooking: false,
      squareCatalogId: null,
      squareVariationId: null,
      posCatalogId: null,
      posVariationId: null,
      lastSyncedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '00000000-0000-0000-0000-000000000012',
      tenantId: '00000000-0000-0000-0000-000000000001',
      name: 'Adobo Chicken',
      description: 'Classic Filipino soy-vinegar braised chicken',
      price: 13.99,
      category: 'Mains',
      isAvailable: true,
      duration: null,
      requiresBooking: false,
      squareCatalogId: null,
      squareVariationId: null,
      posCatalogId: null,
      posVariationId: null,
      lastSyncedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

const baseInput: FlowInput = {
  tenantContext: mockTenantContext,
  callerPhone: '+12175550199',
  inboundMessage: 'ORDER',
  currentState: null,
  chatFn: mockChatFn,
};

describe('Flow Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Intent Detection ─────────────────────────────────────────────────────
  describe('Intent Detection', () => {
    it('detects ORDER intent from keyword', async () => {
      const result = await runFlowEngine({ ...baseInput, inboundMessage: 'ORDER' });
      expect(result.flowType).toBe(FlowType.ORDER);
      expect(result.nextState.currentFlow).toBe(FlowType.ORDER);
    });

    it('detects ORDER intent from "I want to order"', async () => {
      const result = await runFlowEngine({ ...baseInput, inboundMessage: 'I want to order' });
      expect(result.flowType).toBe(FlowType.ORDER);
    });

    it('detects MEETING intent from keyword', async () => {
      const result = await runFlowEngine({ ...baseInput, inboundMessage: 'MEETING' });
      expect(result.flowType).toBe(FlowType.MEETING);
      expect(result.nextState.currentFlow).toBe(FlowType.MEETING);
    });

    it('detects MEETING intent from "BOOK" keyword', async () => {
      const result = await runFlowEngine({ ...baseInput, inboundMessage: 'BOOK' });
      expect(result.flowType).toBe(FlowType.MEETING);
    });

    it('falls back to AI classifier for ambiguous messages', async () => {
      const result = await runFlowEngine({
        ...baseInput,
        inboundMessage: 'What are your hours?',
      });
      expect(result).toBeDefined();
      expect(result.smsReply).toBeTruthy();
      // AI mock returns ORDER intent, so it starts ORDER flow
      expect(mockChatFn).toHaveBeenCalled();
    });

    it('starts MENU flow from MENU keyword', async () => {
      const result = await runFlowEngine({ ...baseInput, inboundMessage: 'MENU' });
      expect(result.flowType).toBe(FlowType.ORDER);
      expect(result.smsReply).toBeTruthy();
    });
  });

  // ── ORDER Flow ───────────────────────────────────────────────────────────
  describe('ORDER Flow', () => {
    it('prompts for order on ORDER keyword (no menu dump)', async () => {
      const result = await runFlowEngine(baseInput);
      expect(result.flowType).toBe(FlowType.ORDER);
      // New behavior: short prompt + MENU hint, not a full menu dump
      expect(result.smsReply.toLowerCase()).toContain('what can i get you');
      expect(result.smsReply).toContain('MENU');
      // And it should NOT dump the entire item list. The reply may
      // include 1–2 item names as an order-format example ("like '1
      // Lumpia Shanghai, 2 Pancit Bihon'"), but the 3rd item must
      // never leak — that would be the slippery slope to a menu dump.
      expect(result.smsReply).not.toContain('Adobo Chicken');
      expect(result.nextState.flowStep).toBeTruthy();
    });

    it('sends web menu URL when customer texts MENU', async () => {
      const stateAfterGreeting = (await runFlowEngine(baseInput)).nextState;
      const ctxWithSlug = {
        ...mockTenantContext,
        tenantSlug: 'test-restaurant',
      };
      const result = await runFlowEngine({
        ...baseInput,
        tenantContext: ctxWithSlug,
        inboundMessage: 'MENU',
        currentState: stateAfterGreeting,
      });
      expect(result.smsReply).toContain('ringbacksms.com/m/test-restaurant');
    });

    it('parses "1x2" item selection', async () => {
      const stateAfterMenu = (await runFlowEngine(baseInput)).nextState;
      const result = await runFlowEngine({
        ...baseInput,
        inboundMessage: '1x2',
        currentState: stateAfterMenu,
      });
      expect(result.nextState.flowStep).toBe('ORDER_CONFIRM');
      expect(result.smsReply).toContain('Lumpia Shanghai');
      expect(result.nextState.orderDraft?.items).toHaveLength(1);
      expect(result.nextState.orderDraft?.items[0].quantity).toBe(2);
    });

    it('parses "2x1, 3x1" multi-item selection', async () => {
      const stateAfterMenu = (await runFlowEngine(baseInput)).nextState;
      const result = await runFlowEngine({
        ...baseInput,
        inboundMessage: '2x1, 3x1',
        currentState: stateAfterMenu,
      });
      expect(result.nextState.flowStep).toBe('ORDER_CONFIRM');
      expect(result.nextState.orderDraft?.items).toHaveLength(2);
    });

    it('confirms order and asks for pickup time', async () => {
      const stateAfterMenu = (await runFlowEngine(baseInput)).nextState;
      const selectionResult = await runFlowEngine({
        ...baseInput,
        inboundMessage: '1x1',
        currentState: stateAfterMenu,
      });
      const result = await runFlowEngine({
        ...baseInput,
        inboundMessage: 'YES',
        currentState: selectionResult.nextState,
      });
      expect(result.nextState.flowStep).toBe('PICKUP_TIME');
      expect(result.smsReply).toContain('pick up');
    });

    it('completes order with pickup time and emits side effects', async () => {
      const stateAfterMenu = (await runFlowEngine(baseInput)).nextState;
      const selectionResult = await runFlowEngine({
        ...baseInput,
        inboundMessage: '2x1',
        currentState: stateAfterMenu,
      });
      const confirmResult = await runFlowEngine({
        ...baseInput,
        inboundMessage: 'YES',
        currentState: selectionResult.nextState,
      });
      const finalResult = await runFlowEngine({
        ...baseInput,
        inboundMessage: '1:00pm',
        currentState: confirmResult.nextState,
      });
      expect(finalResult.nextState.flowStep).toBe('ORDER_COMPLETE');
      expect(finalResult.sideEffects).toHaveLength(2);
      expect(finalResult.sideEffects[0].type).toBe('SAVE_ORDER');
      expect(finalResult.sideEffects[1].type).toBe('NOTIFY_OWNER');

      // Verify SAVE_ORDER payload
      const saveOrder = finalResult.sideEffects[0] as any;
      expect(saveOrder.payload.items).toHaveLength(1);
      expect(saveOrder.payload.total).toBeGreaterThan(0);
    });

    it('allows cancellation at confirm step', async () => {
      const stateAfterMenu = (await runFlowEngine(baseInput)).nextState;
      const selectionResult = await runFlowEngine({
        ...baseInput,
        inboundMessage: '1x1',
        currentState: stateAfterMenu,
      });
      const cancelResult = await runFlowEngine({
        ...baseInput,
        inboundMessage: 'NO',
        currentState: selectionResult.nextState,
      });
      expect(cancelResult.nextState.flowStep).toBe('MENU_DISPLAY');
      expect(cancelResult.nextState.orderDraft).toBeNull();
    });

    it('rejects orders when ordersAcceptingEnabled is false', async () => {
      const pausedContext = {
        ...mockTenantContext,
        config: { ...mockTenantContext.config, ordersAcceptingEnabled: false },
      };
      // Start an order first
      const stateAfterMenu = (await runFlowEngine(baseInput)).nextState;
      // Then pause orders
      const result = await runFlowEngine({
        ...baseInput,
        tenantContext: pausedContext,
        inboundMessage: '1x1',
        currentState: stateAfterMenu,
      });
      expect(result.smsReply).toContain('paused');
      expect(result.nextState.currentFlow).toBeNull();
    });

    it('handles invalid item number gracefully', async () => {
      const stateAfterMenu = (await runFlowEngine(baseInput)).nextState;
      const result = await runFlowEngine({
        ...baseInput,
        inboundMessage: '99x1',
        currentState: stateAfterMenu,
      });
      // Should show menu again or error message
      expect(result.smsReply).toBeTruthy();
      expect(result.nextState.flowStep).toBeTruthy();
    });
  });

  // ── MEETING Flow ─────────────────────────────────────────────────────────
  describe('MEETING Flow', () => {
    it('starts meeting flow and asks for details', async () => {
      const result = await runFlowEngine({ ...baseInput, inboundMessage: 'MEETING' });
      expect(result.flowType).toBe(FlowType.MEETING);
      expect(result.nextState.currentFlow).toBe(FlowType.MEETING);
      expect(result.smsReply).toBeTruthy();
    });

    it('processes scheduling request with side effects', async () => {
      const greetingResult = await runFlowEngine({
        ...baseInput,
        inboundMessage: 'MEETING',
      });
      const scheduleResult = await runFlowEngine({
        ...baseInput,
        inboundMessage: 'Tomorrow at 2pm to discuss catering',
        currentState: greetingResult.nextState,
      });
      expect(scheduleResult.sideEffects.some((e) => e.type === 'BOOK_MEETING')).toBe(true);
      expect(scheduleResult.sideEffects.some((e) => e.type === 'NOTIFY_OWNER')).toBe(true);
    });
  });

  // ── Disabled flows ───────────────────────────────────────────────────────
  describe('Flow Enablement', () => {
    it('does not route to ORDER if ORDER flow is disabled', async () => {
      const noOrderContext = {
        ...mockTenantContext,
        flows: mockTenantContext.flows.filter((f) => f.type !== FlowType.ORDER),
      };
      const result = await runFlowEngine({
        ...baseInput,
        tenantContext: noOrderContext,
        inboundMessage: 'ORDER',
        aiApiKey: 'test-key', // Needed for fallback flow's OpenAI client
      });
      // Should fall back since ORDER flow is not enabled
      expect(result.flowType).not.toBe(FlowType.ORDER);
    });
  });

  // ── State Continuity ─────────────────────────────────────────────────────
  describe('State Continuity', () => {
    it('resumes order flow from saved state', async () => {
      const stateAfterMenu = (await runFlowEngine(baseInput)).nextState;
      // Simulate picking up where we left off
      const result = await runFlowEngine({
        ...baseInput,
        inboundMessage: '1x1',
        currentState: stateAfterMenu,
      });
      expect(result.nextState.currentFlow).toBe(FlowType.ORDER);
      expect(result.nextState.flowStep).toBe('ORDER_CONFIRM');
    });

    it('tracks messageCount across turns', async () => {
      const result1 = await runFlowEngine(baseInput);
      expect(result1.nextState.messageCount).toBeGreaterThanOrEqual(1);

      const result2 = await runFlowEngine({
        ...baseInput,
        inboundMessage: '1x1',
        currentState: result1.nextState,
      });
      expect(result2.nextState.messageCount).toBeGreaterThanOrEqual(result1.nextState.messageCount);
    });
  });

  // ── Edge Cases ───────────────────────────────────────────────────────────
  describe('Edge Cases', () => {
    it('handles empty message', async () => {
      const result = await runFlowEngine({ ...baseInput, inboundMessage: '' });
      expect(result).toBeDefined();
      expect(result.smsReply).toBeTruthy();
    });

    it('handles very long message without crashing', async () => {
      const longMsg = 'I want to order '.repeat(100);
      const result = await runFlowEngine({ ...baseInput, inboundMessage: longMsg });
      expect(result).toBeDefined();
    });

    it('handles no menu items gracefully', async () => {
      const noMenuContext = { ...mockTenantContext, menuItems: [] };
      const result = await runFlowEngine({
        ...baseInput,
        tenantContext: noMenuContext,
        inboundMessage: 'ORDER',
      });
      expect(result).toBeDefined();
      expect(result.smsReply).toBeTruthy();
    });
  });

  // ── Caller Memory ────────────────────────────────────────────────────────
  describe('Caller Memory', () => {
    it('accepts callerMemory for returning customers', async () => {
      const result = await runFlowEngine({
        ...baseInput,
        callerMemory: {
          contactName: 'Rolando',
          contactStatus: 'CUSTOMER',
          tier: 'RETURNING',
          lastOrderSummary: '2 Lumpia Shanghai, 1 Pancit — $29.97',
          lastOrderItems: [
            { menuItemId: '00000000-0000-0000-0000-000000000010', name: 'Lumpia Shanghai', quantity: 2, price: 8.99 },
          ],
        },
      });
      expect(result).toBeDefined();
      expect(result.smsReply).toBeTruthy();
    });
  });
});
