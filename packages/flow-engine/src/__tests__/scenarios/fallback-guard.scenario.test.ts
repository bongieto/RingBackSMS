import { FlowType } from '@ringback/shared-types';
import { buildLumpiaContext } from './_fixtures';
import { runScenario } from './_harness';

/**
 * Regression coverage for the FALLBACK hardening batch (fix #3):
 *   - Bare-confirmation deflection (no hallucinated order).
 *   - Prompt-template placeholder sanitizer (never leak "[link
 *     would be sent here]" style bracketed hallmarks).
 */

describe('FALLBACK hardening', () => {
  test('fix #3a: bare "yes confirm" with no order context gets deflection, never hallucinates', async () => {
    // Use a context with MEETING disabled so "confirm" doesn't keyword-
    // match INQUIRY/MEETING; it falls through to FALLBACK.
    await runScenario({
      name: 'bare-confirm-deflect',
      context: buildLumpiaContext({
        openNow: true,
        flowTypes: [FlowType.ORDER, FlowType.FALLBACK],
      }),
      turns: [
        {
          user: 'yes confirm',
          // The pre-LLM guard catches bare confirmations BEFORE
          // calling the LLM. No chatText needed — if the guard
          // misfires and the LLM is called, the test should still
          // not see a hallucinated confirmation.
          chatText:
            "Perfect! Your order is confirmed. [Stripe payment link would be sent here]",
          expect: {
            flowType: FlowType.FALLBACK,
            replyContains: 'Not sure what',
            replyDoesNotContain: [
              'order is confirmed',
              '[Stripe payment link',
              'payment link shortly',
            ],
          },
        },
      ],
    });
  });

  test('fix #3b: template-placeholder sanitizer strips "[X would be sent here]" leaks', async () => {
    await runScenario({
      name: 'template-leak-strip',
      context: buildLumpiaContext({
        openNow: true,
        flowTypes: [FlowType.ORDER, FlowType.FALLBACK],
      }),
      turns: [
        {
          // An open-ended question that routes to FALLBACK + lets the
          // LLM produce a reply (bypassing the bare-confirm guard).
          user: 'do you guys do delivery?',
          chatText:
            "Sure thing! [Delivery link would be sent here] Let us know if you need anything else!",
          expect: {
            flowType: FlowType.FALLBACK,
            replyDoesNotContain: [
              '[Delivery link',
              'would be sent here',
              'would be sent',
            ],
          },
        },
      ],
    });
  });
});
