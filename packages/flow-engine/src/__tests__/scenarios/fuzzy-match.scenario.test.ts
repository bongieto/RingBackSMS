import { FlowType } from '@ringback/shared-types';
import { buildLumpiaContext } from './_fixtures';
import { runScenario } from './_harness';

/**
 * End-to-end coverage for the Levenshtein-1 fuzzy-match safety net
 * in `orderAgent`. When the LLM fails to produce a tool call for a
 * lightly-misspelled item name, the safety net should still find
 * the item via 1-char-edit fuzzy matching.
 *
 * Scenario shape: the agent stub returns NO tool calls (simulating
 * the LLM getting confused by a typo). The safety net inside
 * `runOrderAgent` falls back to `findItemPhraseMatches` →
 * `findItemFuzzyMatches`, pulls the right menu item, and advances
 * the flow.
 */

describe('fuzzy item matching', () => {
  test('typo "siomi" adds the #A7 Siomai item via the safety net', async () => {
    await runScenario({
      name: 'fuzzy-siomi',
      context: buildLumpiaContext({ openNow: true }),
      turns: [
        {
          user: '1 siomi',
          // LLM "doesn't recognize" siomi — no tool calls. The
          // safety net's job is to still find the item.
          agentText: '',
          agentToolCalls: [],
          expect: {
            flowType: FlowType.ORDER,
            flowStep: 'ORDER_NAME',
            // Cart should have been populated by the fuzzy safety net.
            assert: ({ state }) => {
              const items = state?.orderDraft?.items ?? [];
              if (items.length !== 1) {
                throw new Error(`expected 1 cart item, got ${items.length}`);
              }
              if (!items[0].name.toLowerCase().includes('siomai')) {
                throw new Error(`expected Siomai in cart, got ${items[0].name}`);
              }
            },
          },
        },
      ],
    });
  });

  test('multi-word typos "calmansi sizzer" both land on #D1 Calamansi Sizzler', async () => {
    // Both tokens must be within distance-1 for a multi-word item.
    // "calmansi" → "calamansi" (dist 1, insertion) and "sizzer" →
    // "sizzler" (dist 1, insertion). Total = 2, per-token ≤ 1 = OK.
    await runScenario({
      name: 'fuzzy-multiword',
      context: buildLumpiaContext({ openNow: true }),
      turns: [
        {
          user: '1 calmansi sizzer',
          agentText: '',
          agentToolCalls: [],
          expect: {
            flowType: FlowType.ORDER,
            assert: ({ state }) => {
              const items = state?.orderDraft?.items ?? [];
              if (items.length === 0) {
                throw new Error(
                  'fuzzy safety net did not populate cart for multi-word typo',
                );
              }
              if (!items[0].name.toLowerCase().includes('calamansi')) {
                throw new Error(
                  `expected Calamansi Sizzler in cart, got ${items[0].name}`,
                );
              }
            },
          },
        },
      ],
    });
  });

  test('gibberish does NOT produce phantom cart items', async () => {
    await runScenario({
      name: 'fuzzy-gibberish',
      context: buildLumpiaContext({ openNow: true }),
      turns: [
        {
          user: 'zzzz qqqq',
          agentText: '',
          agentToolCalls: [],
          expect: {
            assert: ({ state }) => {
              const items = state?.orderDraft?.items ?? [];
              if (items.length > 0) {
                throw new Error(
                  `fuzzy matcher false-positive: added ${items.length} items for gibberish`,
                );
              }
            },
          },
        },
      ],
    });
  });
});
