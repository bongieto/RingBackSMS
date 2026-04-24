import { FlowType } from '@ringback/shared-types';
import { buildLumpiaContext } from './_fixtures';
import { runScenario } from './_harness';

/**
 * End-to-end coverage for the ungrounded-action guard bank (fix #4
 * from the accuracy improvement plan). Each guard deflects a
 * specific pattern when the state needed for it doesn't exist,
 * instead of letting the LLM fabricate a response.
 */

describe('ungrounded guards', () => {
  test('"cancel" with no active order → deflection, no LLM fabrication', async () => {
    await runScenario({
      name: 'cancel-no-order',
      context: buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
      turns: [
        {
          user: 'cancel my order',
          // LLM would happily say "Order cancelled!" — the guard
          // prevents it. Stub returns a bad LLM text to make sure
          // the guard short-circuits before it's reached.
          chatText: 'Order cancelled! See you next time.',
          expect: {
            flowType: FlowType.FALLBACK,
            replyContains: "don't see a pending order",
            replyDoesNotContain: ['Order cancelled'],
          },
        },
      ],
    });
  });

  test('"cancel" WITH active order flows through to LLM (caller_memory present)', async () => {
    await runScenario({
      name: 'cancel-with-order',
      context: buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
      callerMemory: {
        contactName: 'Maria',
        contactStatus: null,
        tier: 'RETURNING',
        lastOrderSummary: null,
        lastConversationPreview: null,
        activeOrder: {
          orderNumber: 'ORD-TEST-123',
          status: 'CONFIRMED',
          estimatedReadyTime: null,
          pickupTime: '6:30pm',
          itemsSummary: '1× Siomai',
          total: 5.99,
        },
      },
      turns: [
        {
          user: 'cancel my order',
          chatText: "Sure thing — I'll pass that along to our staff to cancel.",
          expect: {
            flowType: FlowType.FALLBACK,
            replyContains: 'pass that along',
            replyDoesNotContain: ["don't see a pending order"],
          },
        },
      ],
    });
  });

  test('"where\'s my order" with no active order → deflection', async () => {
    await runScenario({
      name: 'status-no-order',
      context: buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
      turns: [
        {
          user: "where's my order",
          chatText: 'Your order is ready for pickup!',
          expect: {
            flowType: FlowType.FALLBACK,
            replyContains: "don't see an active order",
            replyDoesNotContain: ['ready for pickup'],
          },
        },
      ],
    });
  });

  test('"refund please" → always deflects to human, regardless of order state', async () => {
    await runScenario({
      name: 'refund-always-deflects',
      context: buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
      callerMemory: {
        contactName: 'Maria',
        contactStatus: null,
        tier: 'RETURNING',
        lastOrderSummary: null,
        lastConversationPreview: null,
        // Even WITH an active order, refund goes to human.
        activeOrder: {
          orderNumber: 'ORD-TEST-123',
          status: 'COMPLETED',
          estimatedReadyTime: null,
          pickupTime: null,
          itemsSummary: '1× Siomai',
          total: 5.99,
        },
      },
      turns: [
        {
          user: 'refund please',
          // LLM would say "Refund processed!" — guard prevents.
          chatText: 'Refund processed! Expect it on your card in 3-5 days.',
          expect: {
            flowType: FlowType.FALLBACK,
            replyContains: 'call',
            replyDoesNotContain: ['Refund processed'],
          },
        },
      ],
    });
  });
});
