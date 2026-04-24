import { FlowType } from '@ringback/shared-types';
import { buildLumpiaContext, IDS } from './_fixtures';
import { runScenario } from './_harness';

/**
 * Regression coverage for the ORDER slot sequence:
 *   - Happy path: items → name → pickup → confirm.
 *   - Slot skip: "confirm now" with no name/pickup → blocked,
 *     prompted for next missing slot.
 *   - Fix #8: cart mutation at a non-items step echoes the new
 *     cart before re-asking the current slot.
 */

describe('ORDER slot sequence', () => {
  test('multi-turn happy path: items → name → pickup → confirm', async () => {
    await runScenario({
      name: 'happy-path-multi-turn',
      context: buildLumpiaContext({ openNow: true }),
      queueCount: 0,
      turns: [
        {
          user: '1 #A7',
          agentText: 'Added 1× #A7 Siomai.',
          agentToolCalls: [
            { name: 'add_items', input: { items: [{ menu_item_id: IDS.a7, quantity: 1 }] } },
          ],
          expect: {
            flowType: FlowType.ORDER,
            flowStep: 'ORDER_NAME',
            replyContains: '#A7 Siomai',
          },
        },
        {
          user: 'Maria',
          agentText: '',
          agentToolCalls: [
            { name: 'set_customer_name', input: { name: 'Maria' } },
          ],
          expect: {
            flowType: FlowType.ORDER,
            flowStep: 'PICKUP_TIME',
          },
        },
        {
          user: '15 min',
          agentText: '',
          agentToolCalls: [
            { name: 'set_pickup_time', input: { when: '15 min' } },
          ],
          expect: {
            flowType: FlowType.ORDER,
            flowStep: 'ORDER_CONFIRM',
            replyContains: '15 min',
          },
        },
        {
          user: 'yes',
          agentText: '',
          agentToolCalls: [{ name: 'confirm_order', input: {} }],
          expect: {
            flowType: FlowType.ORDER,
            flowStep: 'AWAITING_PAYMENT',
            sideEffectTypes: ['SAVE_ORDER', 'CREATE_PAYMENT_LINK', 'NOTIFY_OWNER'],
          },
        },
      ],
    });
  });

  test('slot-sequence: "confirm" with no name/pickup is blocked', async () => {
    await runScenario({
      name: 'slot-skip-blocked',
      context: buildLumpiaContext({ openNow: true }),
      turns: [
        {
          user: '1 #A7 and confirm now',
          // LLM tries to skip ahead. Tool calls include both add_items
          // and confirm_order — the confirm gate should reject because
          // name + pickup are missing.
          agentText: 'Order confirmed!',
          agentToolCalls: [
            { name: 'add_items', input: { items: [{ menu_item_id: IDS.a7, quantity: 1 }] } },
            { name: 'confirm_order', input: {} },
          ],
          expect: {
            flowType: FlowType.ORDER,
            // Sequencer forces us to ORDER_NAME (next missing slot).
            flowStep: 'ORDER_NAME',
            replyContains: 'name',
            // No side effects — confirm was blocked.
            sideEffectTypes: [],
          },
        },
      ],
    });
  });

  test('fix #8: quantity update at ORDER_NAME step echoes the new cart before re-asking', async () => {
    await runScenario({
      name: 'cart-edit-echo',
      context: buildLumpiaContext({ openNow: true }),
      turns: [
        {
          user: '1 #A7',
          agentToolCalls: [
            { name: 'add_items', input: { items: [{ menu_item_id: IDS.a7, quantity: 1 }] } },
          ],
          expect: {
            flowStep: 'ORDER_NAME',
            replyContains: ['Updated:', '1×'],
          },
        },
        {
          user: 'actually make it 3 instead of 1',
          agentToolCalls: [
            { name: 'update_quantity', input: { menu_item_id: IDS.a7, quantity: 3 } },
          ],
          expect: {
            flowStep: 'ORDER_NAME',
            // The echo shows the new quantity; without fix #8 this
            // would be the bare "What name…" prompt with no echo.
            replyContains: ['Updated:', '3×'],
          },
        },
      ],
    });
  });
});
