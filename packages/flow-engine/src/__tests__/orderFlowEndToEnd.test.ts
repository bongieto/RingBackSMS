/**
 * End-to-end: the full strict-sequence ladder from an empty cart to a
 * confirmed order.
 *
 * This test simulates four consecutive inbound SMS turns from the same
 * caller — the same sequence a real customer would take on the phone —
 * and asserts that state, side effects, and flow step all progress
 * through the ladder:
 *
 *   Turn 1: "2 lumpia"        → items captured, step advances to ORDER_NAME
 *   Turn 2: "Maria"           → name captured by regex, step advances to PICKUP_TIME
 *   Turn 3: "6:30pm"          → pickup captured, step advances to ORDER_CONFIRM
 *   Turn 4: "yes"             → confirm fires SAVE_ORDER + NOTIFY_OWNER,
 *                                step lands on ORDER_COMPLETE
 *
 * We carry the `nextState` forward between turns, so a regression in the
 * strict-sequence enforcer (e.g. computing the wrong "first missing slot")
 * would be caught here even if individual unit tests keep passing.
 *
 * chatWithToolsFn is mocked turn-by-turn so the test is deterministic
 * and fast — no AI call is made.
 */

import { runOrderAgent } from '../ai/orderAgent';
import type { ChatFn, ChatWithToolsFn, FlowInput, TenantContext } from '../types';
import { FlowType } from '@ringback/shared-types';

const TENANT_ID = '00000000-0000-0000-0000-00000000aaaa';
const LUMPIA_ID = '00000000-0000-0000-0000-00000000bbbb';

const chatFn: ChatFn = jest.fn().mockResolvedValue('{"intent":"ORDER","confidence":0.9}');

const tenantContext: TenantContext = {
  tenantId: TENANT_ID,
  tenantName: 'Test Kitchen',
  tenantSlug: 'test-kitchen',
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
  // hoursInfo with openNow=true avoids the hard closed-hours gate.
  hoursInfo: {
    openNow: true,
    nextOpenDisplay: null,
    todayHoursDisplay: '11am–9pm',
    weeklyHoursDisplay: 'Every day 11am–9pm',
    minutesUntilClose: 120,
    closesAtDisplay: '9pm',
    closingSoon: false,
  },
  flows: [
    {
      id: 'f1',
      tenantId: TENANT_ID,
      type: FlowType.ORDER,
      isEnabled: true,
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
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
    } as any,
  ],
};

function mockChatWithTools(opts: {
  text?: string;
  toolCalls?: Array<{ name: string; input: any }>;
}): ChatWithToolsFn {
  return jest.fn().mockResolvedValue({
    text: opts.text ?? '',
    toolCalls: (opts.toolCalls ?? []).map((tc, i) => ({
      id: `t${i}`,
      name: tc.name,
      input: tc.input,
    })),
    stopReason: 'end_turn',
    provider: 'claude' as const,
  });
}

function mkInput(
  message: string,
  withTools: ChatWithToolsFn,
  currentState: any = null,
): FlowInput {
  return {
    tenantContext,
    callerPhone: '+12175550199',
    inboundMessage: message,
    currentState,
    chatFn,
    chatWithToolsFn: withTools,
  };
}

describe('order ladder end-to-end', () => {
  beforeEach(() => jest.clearAllMocks());

  it('walks items → name → pickup → confirm and emits SAVE_ORDER + NOTIFY_OWNER', async () => {
    // ── Turn 1: customer picks an item ────────────────────────────────
    const turn1 = await runOrderAgent(
      mkInput(
        '2 lumpia',
        mockChatWithTools({
          text: 'Added 2 Lumpia Shanghai. What name should I put this under?',
          toolCalls: [
            {
              name: 'add_items',
              input: { items: [{ menu_item_id: LUMPIA_ID, quantity: 2 }] },
            },
          ],
        }),
      ),
    );
    expect(turn1.flowType).toBe(FlowType.ORDER);
    expect(turn1.nextState.orderDraft?.items).toHaveLength(1);
    expect(turn1.nextState.orderDraft?.items[0]?.menuItemId).toBe(LUMPIA_ID);
    // With items captured but no name, the enforcer must land us on ORDER_NAME.
    expect(turn1.nextState.flowStep).toBe('ORDER_NAME');
    expect(turn1.sideEffects).toEqual([]);

    // ── Turn 2: bare name — the regex capture path ────────────────────
    // The LLM mock deliberately returns NO tool calls, to prove the
    // name_captured_by_regex safety net still lifts the draft forward.
    const turn2 = await runOrderAgent(
      mkInput(
        'Maria',
        mockChatWithTools({ text: '', toolCalls: [] }),
        turn1.nextState,
      ),
    );
    expect(turn2.nextState.customerName).toBe('Maria');
    // Name is now known, pickup is the next missing slot.
    expect(turn2.nextState.flowStep).toBe('PICKUP_TIME');
    expect(turn2.sideEffects).toEqual([]);

    // ── Turn 3: pickup time ───────────────────────────────────────────
    const turn3 = await runOrderAgent(
      mkInput(
        '6:30pm',
        mockChatWithTools({
          text: 'Thanks, Maria. 2× Lumpia Shanghai for pickup at 6:30pm — $17.98. Ready to confirm?',
          toolCalls: [
            { name: 'set_pickup_time', input: { when: '6:30pm' } },
          ],
        }),
        turn2.nextState,
      ),
    );
    expect(turn3.nextState.orderDraft?.pickupTime).toBe('6:30pm');
    expect(turn3.nextState.customerName).toBe('Maria');
    expect(turn3.nextState.flowStep).toBe('ORDER_CONFIRM');
    expect(turn3.sideEffects).toEqual([]);

    // ── Turn 4: confirm ───────────────────────────────────────────────
    const turn4 = await runOrderAgent(
      mkInput(
        'yes',
        mockChatWithTools({
          text: "You're all set, Maria! Order placed for pickup at 6:30pm. Total $17.98.",
          toolCalls: [{ name: 'confirm_order', input: {} }],
        }),
        turn3.nextState,
      ),
    );
    expect(turn4.nextState.flowStep).toBe('ORDER_COMPLETE');
    const effectTypes = turn4.sideEffects.map((e) => e.type).sort();
    expect(effectTypes).toEqual(['NOTIFY_OWNER', 'SAVE_ORDER']);
    const save = turn4.sideEffects.find((e) => e.type === 'SAVE_ORDER')!;
    expect((save as any).payload.customerName).toBe('Maria');
    expect((save as any).payload.pickupTime).toBe('6:30pm');
    expect((save as any).payload.items).toHaveLength(1);
    expect((save as any).payload.items[0].menuItemId).toBe(LUMPIA_ID);
    expect((save as any).payload.items[0].quantity).toBe(2);
  });

  it('blocks confirm when a slot is still missing (regression for confirm_blocked_missing_slot)', async () => {
    // Customer has items but no name or pickup, then says "yes".
    // The enforcer must refuse to commit and ask for the first missing
    // slot (name) instead of firing SAVE_ORDER.
    const partialState = {
      tenantId: TENANT_ID,
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_CONFIRM',
      orderDraft: {
        items: [
          { menuItemId: LUMPIA_ID, name: 'Lumpia Shanghai', quantity: 2, price: 8.99 },
        ],
        pickupTime: null,
      },
      lastMessageAt: Date.now(),
      messageCount: 3,
      dedupKey: null,
    };
    const result = await runOrderAgent(
      mkInput(
        'yes',
        mockChatWithTools({
          text: 'Great — your total is $17.98. Confirmed!',
          toolCalls: [{ name: 'confirm_order', input: {} }],
        }),
        partialState as any,
      ),
    );
    expect(result.sideEffects).toEqual([]);
    // Enforcer forces us back to the missing slot (name first, per the ladder).
    expect(result.nextState.flowStep).toBe('ORDER_NAME');
  });
});
