import { runOrderAgent } from '../ai/orderAgent';
import type { FlowInput, ChatFn, ChatWithToolsFn } from '../types';
import type { TenantContext } from '../types';
import { FlowType } from '@ringback/shared-types';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const LUMPIA_ID = '00000000-0000-0000-0000-000000000010';
const PANCIT_ID = '00000000-0000-0000-0000-000000000011';
const ADOBO_ID = '00000000-0000-0000-0000-000000000012';

const chatFn: ChatFn = jest.fn().mockResolvedValue('{"intent":"ORDER","confidence":0.9}');

const tenantContext: TenantContext = {
  tenantId: TENANT_ID,
  tenantName: 'Test Restaurant',
  tenantSlug: 'test-restaurant',
  config: {
    id: 'cfg',
    tenantId: TENANT_ID,
    timezone: 'America/Chicago',
    ordersAcceptingEnabled: true,
    aiOrderAgentEnabled: true,
    requirePayment: false,
    businessDays: [0, 1, 2, 3, 4, 5, 6],
    closedDates: [],
  } as any,
  flows: [
    { id: 'f1', tenantId: TENANT_ID, type: FlowType.ORDER, isEnabled: true, config: null, createdAt: new Date(), updatedAt: new Date() },
  ],
  menuItems: [
    {
      id: LUMPIA_ID,
      tenantId: TENANT_ID,
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
      id: PANCIT_ID,
      tenantId: TENANT_ID,
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
      modifierGroups: [
        {
          id: 'mg1',
          menuItemId: PANCIT_ID,
          name: 'Spice',
          selectionType: 'SINGLE',
          required: false,
          minSelections: 0,
          maxSelections: 1,
          posGroupId: null,
          sortOrder: 0,
          modifiers: [
            { id: 'm1', groupId: 'mg1', name: 'Spicy', priceAdjust: 0, isDefault: false, posModifierId: null, sortOrder: 0 },
            { id: 'm2', groupId: 'mg1', name: 'Not Spicy', priceAdjust: 0, isDefault: true, posModifierId: null, sortOrder: 1 },
          ],
        },
      ],
    },
    {
      id: ADOBO_ID,
      tenantId: TENANT_ID,
      name: 'Adobo Chicken',
      description: 'Classic chicken',
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
  ] as any,
};

function mkInput(
  message: string,
  toolCalls: Array<{ name: string; input: any }>,
  text = '',
  currentState: any = null,
  opts: { queueCount?: number; defaultPrepTimeMinutes?: number | null } = {},
): FlowInput {
  const mockWithTools: ChatWithToolsFn = jest.fn().mockResolvedValue({
    text,
    toolCalls: toolCalls.map((tc, i) => ({ id: `t${i}`, name: tc.name, input: tc.input })),
    stopReason: 'end_turn',
    provider: 'claude' as const,
  });
  const ctx =
    opts.defaultPrepTimeMinutes !== undefined
      ? {
          ...tenantContext,
          config: {
            ...tenantContext.config,
            defaultPrepTimeMinutes: opts.defaultPrepTimeMinutes,
            minutesPerQueuedOrder: 4,
          } as any,
        }
      : tenantContext;
  return {
    tenantContext: ctx,
    callerPhone: '+12175550199',
    inboundMessage: message,
    currentState,
    chatFn,
    chatWithToolsFn: mockWithTools,
    getActiveOrderCount:
      opts.queueCount != null ? jest.fn().mockResolvedValue(opts.queueCount) : undefined,
  };
}

describe('runOrderAgent', () => {
  beforeEach(() => jest.clearAllMocks());

  test('simple add: "2 lumpia" → adds 2 Lumpia Shanghai', async () => {
    const input = mkInput(
      '2 lumpia',
      [{ name: 'add_items', input: { items: [{ menu_item_id: LUMPIA_ID, quantity: 2 }] } }],
      "Added 2 Lumpia Shanghai. What else?",
    );
    const result = await runOrderAgent(input);
    expect(result.flowType).toBe(FlowType.ORDER);
    expect(result.nextState.orderDraft?.items).toHaveLength(1);
    expect(result.nextState.orderDraft?.items[0].menuItemId).toBe(LUMPIA_ID);
    expect(result.nextState.orderDraft?.items[0].quantity).toBe(2);
    expect(result.sideEffects).toHaveLength(0);
  });

  test('mixed modifiers: two pancit, one spicy one not', async () => {
    const input = mkInput(
      'one spicy pancit and one not spicy',
      [
        {
          name: 'add_items',
          input: {
            items: [
              { menu_item_id: PANCIT_ID, quantity: 1, modifiers: [{ group_name: 'Spice', modifier_name: 'Spicy' }] },
              { menu_item_id: PANCIT_ID, quantity: 1, modifiers: [{ group_name: 'Spice', modifier_name: 'Not Spicy' }] },
            ],
          },
        },
      ],
      'Got it.',
    );
    const result = await runOrderAgent(input);
    expect(result.nextState.orderDraft?.items).toHaveLength(2);
    expect(result.nextState.orderDraft?.items[0].selectedModifiers?.[0].modifierName).toBe('Spicy');
    expect(result.nextState.orderDraft?.items[1].selectedModifiers?.[0].modifierName).toBe('Not Spicy');
  });

  test('invalid menu_item_id → falls back to regex flow (no crash)', async () => {
    const input = mkInput(
      'something',
      [{ name: 'add_items', input: { items: [{ menu_item_id: 'bogus-id', quantity: 1 }] } }],
      'Sorry.',
    );
    const result = await runOrderAgent(input);
    // Handler returns error, no mutation; agent still produces a reply
    expect(result.nextState.orderDraft).toBeNull();
    expect(result.smsReply.length).toBeGreaterThan(0);
  });

  test('confirm_order without explicit user YES is rejected', async () => {
    const state = {
      tenantId: TENANT_ID,
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_CONFIRM',
      orderDraft: {
        items: [{ menuItemId: LUMPIA_ID, name: 'Lumpia Shanghai', quantity: 2, price: 8.99 }],
        pickupTime: '6:30pm',
      },
      lastMessageAt: Date.now(),
      messageCount: 1,
      dedupKey: null,
    } as any;
    const input = mkInput('maybe later', [{ name: 'confirm_order', input: {} }], 'Let me know when ready.', state);
    const result = await runOrderAgent(input);
    expect(result.sideEffects).toHaveLength(0);
    expect(result.nextState.flowStep).not.toBe('ORDER_COMPLETE');
  });

  test('natural confirm with "yes" fires SAVE_ORDER and NOTIFY_OWNER', async () => {
    const state = {
      tenantId: TENANT_ID,
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_CONFIRM',
      orderDraft: {
        items: [{ menuItemId: LUMPIA_ID, name: 'Lumpia Shanghai', quantity: 2, price: 8.99 }],
        pickupTime: '6:30pm',
      },
      customerName: 'Bruno',
      lastMessageAt: Date.now(),
      messageCount: 1,
      dedupKey: null,
    } as any;
    const input = mkInput('yes', [{ name: 'confirm_order', input: {} }], 'Your order is placed!', state);
    const result = await runOrderAgent(input);
    expect(result.sideEffects.map((s) => s.type).sort()).toEqual(['NOTIFY_OWNER', 'SAVE_ORDER']);
    expect(result.nextState.flowStep).toBe('ORDER_COMPLETE');
  });

  test('ask_clarification sets pendingClarification in state', async () => {
    // missing_field gets normalized against a whitelist so the stored
    // state never holds junk like "potato" that the next turn's prompt
    // can't interpret. Unknown field names collapse to 'generic'.
    const input = mkInput(
      'adobo',
      [
        {
          name: 'ask_clarification',
          input: { question: 'How many Adobo Chicken?', missing_field: 'quantity' },
        },
      ],
      'How many Adobo Chicken?',
    );
    const result = await runOrderAgent(input);
    expect(result.nextState.pendingClarification?.field).toBe('quantity');
    expect(result.smsReply).toContain('How many');
  });

  test('ask_clarification normalizes unknown missing_field to "generic"', async () => {
    const input = mkInput(
      'adobo',
      [
        {
          name: 'ask_clarification',
          input: { question: 'Hmm?', missing_field: 'quantity_for_adobo' },
        },
      ],
      'Hmm?',
    );
    const result = await runOrderAgent(input);
    // "quantity_for_adobo" is not in CLARIFICATION_FIELDS → normalized.
    expect(result.nextState.pendingClarification?.field).toBe('generic');
  });

  test('clarification loop cap: 4th re-ask of the same field escalates to human', async () => {
    // State entering this turn: agent has already asked the same
    // `quantity` clarification 3 times. One more ask = 4th attempt,
    // which trips the MAX_CLARIFICATION_ATTEMPTS cap and escalates.
    const state = {
      tenantId: TENANT_ID,
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'MENU_DISPLAY',
      orderDraft: { items: [] },
      pendingClarification: {
        field: 'quantity',
        question: 'How many?',
        askedAt: Date.now() - 60_000,
        attemptCount: 3,
      },
      lastMessageAt: Date.now(),
      messageCount: 4,
      dedupKey: null,
    } as any;
    const input = mkInput(
      'sure',
      [
        {
          name: 'ask_clarification',
          input: { question: 'How many Adobo Chicken?', missing_field: 'quantity' },
        },
      ],
      'How many Adobo Chicken?',
      state,
    );
    const result = await runOrderAgent(input);

    // Escalation FlowOutput: ESCALATE_TO_HUMAN side effect, canonical
    // apology reply, pendingClarification cleared so the next message
    // starts fresh if handoff fails upstream.
    const escalations = result.sideEffects.filter((e) => e.type === 'ESCALATE_TO_HUMAN');
    expect(escalations).toHaveLength(1);
    expect((escalations[0] as any).payload.reason).toBe('clarification_loop_exceeded');
    expect(result.smsReply).toMatch(/team member/);
    expect(result.nextState.pendingClarification).toBeNull();
  });

  test('clarification loop cap: different fields do NOT accumulate toward the cap', async () => {
    // Prior state shows 3 asks of `quantity`. The agent now asks about
    // a different field (`modifier_size`). Counter should RESET, no
    // escalation.
    const state = {
      tenantId: TENANT_ID,
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'MENU_DISPLAY',
      orderDraft: { items: [] },
      pendingClarification: {
        field: 'quantity',
        question: 'How many?',
        askedAt: Date.now() - 60_000,
        attemptCount: 3,
      },
      lastMessageAt: Date.now(),
      messageCount: 4,
      dedupKey: null,
    } as any;
    const input = mkInput(
      '2 pancit',
      [
        {
          name: 'ask_clarification',
          input: { question: 'Spicy or not spicy?', missing_field: 'modifier_size' },
        },
      ],
      'Spicy or not spicy?',
      state,
    );
    const result = await runOrderAgent(input);

    const escalations = result.sideEffects.filter((e) => e.type === 'ESCALATE_TO_HUMAN');
    expect(escalations).toHaveLength(0);
    expect(result.nextState.pendingClarification?.attemptCount).toBe(1);
  });

  test('slot capture at ORDER_CONFIRM: bare "Maria" fills customerName + re-asks confirm', async () => {
    const state = {
      tenantId: TENANT_ID,
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_CONFIRM',
      orderDraft: {
        items: [{ menuItemId: LUMPIA_ID, name: 'Lumpia Shanghai', quantity: 2, price: 8.99 }],
        pickupTime: '6:30pm',
      },
      customerName: null,
      lastMessageAt: Date.now(),
      messageCount: 1,
      dedupKey: null,
    } as any;
    // LLM returns no tool calls — the precise failure we're guarding
    // against (LLM didn't recognize "Maria" as slot data).
    const input = mkInput('Maria', [], '', state);
    const decisions: any[] = [];
    input.decisions = decisions;
    const result = await runOrderAgent(input);

    expect(result.nextState.customerName).toBe('Maria');
    expect(result.nextState.flowStep).toBe('ORDER_CONFIRM'); // unchanged
    expect(result.nextState.orderDraft?.items).toHaveLength(1); // cart intact
    expect(result.smsReply).toMatch(/Got it, Maria/);
    expect(result.smsReply).toMatch(/confirm/i);
    expect(result.sideEffects).toHaveLength(0); // not committed

    const captured = decisions.find(
      (d) => d.handler === 'orderAgent' && d.outcome === 'name_captured_by_regex',
    );
    expect(captured).toBeDefined();
    expect(captured.evidence).toEqual({ value: 'Maria' });
  });

  test('bare-name regex does NOT steal a real "yes" confirm', async () => {
    const state = {
      tenantId: TENANT_ID,
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_CONFIRM',
      orderDraft: {
        items: [{ menuItemId: LUMPIA_ID, name: 'Lumpia Shanghai', quantity: 2, price: 8.99 }],
        pickupTime: '6:30pm',
      },
      customerName: 'Bruno',
      lastMessageAt: Date.now(),
      messageCount: 1,
      dedupKey: null,
    } as any;
    const input = mkInput('yes', [{ name: 'confirm_order', input: {} }], 'Your order is placed!', state);
    const result = await runOrderAgent(input);
    // confirm path still wins — SAVE_ORDER fires, flowStep advances to COMPLETE.
    expect(result.sideEffects.map((s) => s.type).sort()).toEqual(['NOTIFY_OWNER', 'SAVE_ORDER']);
    expect(result.nextState.flowStep).toBe('ORDER_COMPLETE');
  });

  test('cancel_order clears cart', async () => {
    const state = {
      tenantId: TENANT_ID,
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_CONFIRM',
      orderDraft: { items: [{ menuItemId: LUMPIA_ID, name: 'Lumpia Shanghai', quantity: 2, price: 8.99 }] },
      lastMessageAt: Date.now(),
      messageCount: 1,
      dedupKey: null,
    } as any;
    const input = mkInput('nevermind', [{ name: 'cancel_order', input: {} }], 'No problem!', state);
    const result = await runOrderAgent(input);
    expect(result.nextState.orderDraft).toBeNull();
    expect(result.nextState.flowStep).toBe('ORDER_COMPLETE');
    expect(result.sideEffects).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────
  // Strict sequence + hard closed-hours gate
  // ─────────────────────────────────────────────────────────────────

  test('closed-hours gate: refuses any inbound while openNow=false', async () => {
    const closedCtx: TenantContext = {
      ...tenantContext,
      hoursInfo: {
        openNow: false,
        nextOpenDisplay: 'tomorrow 11:00 AM',
        todayHoursDisplay: 'Closed today',
        weeklyHoursDisplay: '',
        closesAtDisplay: null,
        minutesUntilClose: null,
        closingSoon: false,
      },
    } as any;
    const decisions: any[] = [];
    const result = await runOrderAgent({
      tenantContext: closedCtx,
      callerPhone: '+12175550199',
      inboundMessage: '2 lumpia',
      currentState: null,
      chatFn,
      chatWithToolsFn: jest.fn(),
      decisions,
    } as any);
    expect(result.smsReply).toMatch(/closed/i);
    expect(result.smsReply).toContain('tomorrow 11:00 AM');
    expect(result.nextState.flowStep).toBe('CLOSED_REFUSED');
    expect(result.nextState.orderDraft).toBeNull();
    const refused = decisions.find((d) => d.outcome === 'refused_closed');
    expect(refused).toBeDefined();
    expect(refused.evidence).toEqual({ nextOpenDisplay: 'tomorrow 11:00 AM' });
  });

  test('strict sequence: bare "Maria" on empty cart captures name and asks for items', async () => {
    const decisions: any[] = [];
    const input = mkInput('Maria', [], '', null);
    input.decisions = decisions;
    const result = await runOrderAgent(input);
    expect(result.nextState.customerName).toBe('Maria');
    expect(result.nextState.flowStep).toBe('MENU_DISPLAY');
    expect(result.smsReply).toMatch(/Got it, Maria/);
    expect(result.smsReply).toMatch(/what can i get you/i);
    const captured = decisions.find((d) => d.outcome === 'name_captured_by_regex');
    expect(captured).toBeDefined();
  });

  test('strict sequence: "yes" with items + name + NO pickup is blocked, asks for pickup', async () => {
    const state = {
      tenantId: TENANT_ID,
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_CONFIRM',
      orderDraft: {
        items: [{ menuItemId: LUMPIA_ID, name: 'Lumpia Shanghai', quantity: 2, price: 8.99 }],
        // pickupTime intentionally missing
      },
      customerName: 'Bruno',
      lastMessageAt: Date.now(),
      messageCount: 1,
      dedupKey: null,
    } as any;
    const decisions: any[] = [];
    const input = mkInput('yes', [{ name: 'confirm_order', input: {} }], 'Placed!', state);
    input.decisions = decisions;
    const result = await runOrderAgent(input);
    expect(result.sideEffects).toHaveLength(0);
    expect(result.nextState.flowStep).toBe('PICKUP_TIME');
    expect(result.smsReply).toMatch(/pick up/i);
    const blocked = decisions.find((d) => d.outcome === 'confirm_blocked_missing_slot');
    expect(blocked).toBeDefined();
    expect(blocked.evidence).toEqual({ missingName: false, missingPickup: true });
  });

  test('strict sequence: "yes" with items + pickup + NO name is blocked, asks for name', async () => {
    const state = {
      tenantId: TENANT_ID,
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_CONFIRM',
      orderDraft: {
        items: [{ menuItemId: LUMPIA_ID, name: 'Lumpia Shanghai', quantity: 2, price: 8.99 }],
        pickupTime: '6:30pm',
      },
      customerName: null,
      lastMessageAt: Date.now(),
      messageCount: 1,
      dedupKey: null,
    } as any;
    const decisions: any[] = [];
    // Use a lowercase confirm so bare-name regex doesn't mask it, and no
    // tool calls (simulating LLM also failing to confirm).
    const input = mkInput('yes please', [], '', state);
    input.decisions = decisions;
    const result = await runOrderAgent(input);
    expect(result.sideEffects).toHaveLength(0);
    expect(result.nextState.flowStep).toBe('ORDER_NAME');
    expect(result.smsReply).toMatch(/name/i);
  });

  test('confirm reply includes "N orders ahead" when queue > 0', async () => {
    const state = {
      tenantId: TENANT_ID,
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_CONFIRM',
      orderDraft: {
        items: [{ menuItemId: LUMPIA_ID, name: 'Lumpia Shanghai', quantity: 2, price: 8.99 }],
        pickupTime: '6:30pm',
      },
      customerName: 'Bruno',
      lastMessageAt: Date.now(),
      messageCount: 1,
      dedupKey: null,
    } as any;
    const input = mkInput('yes', [{ name: 'confirm_order', input: {} }], '', state, {
      queueCount: 3,
      defaultPrepTimeMinutes: 10,
    });
    const result = await runOrderAgent(input);
    expect(result.smsReply).toMatch(/3 orders ahead/i);
    // Customer gave a concrete pickup time ("6:30pm") so the reply should
    // echo it back rather than a computed "ready around HH:MM".
    expect(result.smsReply).toMatch(/ready for 6:30pm/i);
  });

  test('confirm reply omits "orders ahead" when queue is 0', async () => {
    const state = {
      tenantId: TENANT_ID,
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_CONFIRM',
      orderDraft: {
        items: [{ menuItemId: LUMPIA_ID, name: 'Lumpia Shanghai', quantity: 2, price: 8.99 }],
        pickupTime: '6:30pm',
      },
      customerName: 'Bruno',
      lastMessageAt: Date.now(),
      messageCount: 1,
      dedupKey: null,
    } as any;
    const input = mkInput('yes', [{ name: 'confirm_order', input: {} }], '', state, {
      queueCount: 0,
      defaultPrepTimeMinutes: 10,
    });
    const result = await runOrderAgent(input);
    expect(result.smsReply).not.toMatch(/orders? ahead/i);
  });

  test('agent throws → falls back to regex flow without user-visible error', async () => {
    const bad: ChatWithToolsFn = jest.fn().mockRejectedValue(new Error('AI down'));
    const result = await runOrderAgent({
      tenantContext,
      callerPhone: '+12175550199',
      inboundMessage: 'hello',
      currentState: null,
      chatFn,
      chatWithToolsFn: bad,
    });
    expect(result.flowType).toBe(FlowType.ORDER);
    expect(result.smsReply.length).toBeGreaterThan(0);
  });
});
