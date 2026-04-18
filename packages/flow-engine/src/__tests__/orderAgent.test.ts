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
    const input = mkInput(
      'adobo',
      [
        {
          name: 'ask_clarification',
          input: { question: 'How many Adobo Chicken?', missing_field: 'quantity_for_adobo' },
        },
      ],
      'How many Adobo Chicken?',
    );
    const result = await runOrderAgent(input);
    expect(result.nextState.pendingClarification?.field).toBe('quantity_for_adobo');
    expect(result.smsReply).toContain('How many');
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
    expect(result.smsReply).toMatch(/ready around/i);
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
