import { FlowType } from '@ringback/shared-types';
import { buildLumpiaContext } from './_fixtures';
import { runScenario } from './_harness';

/**
 * Regression coverage for the closed-hours batch of fixes:
 *   - Fix #1: bare greetings when closed → FALLBACK (not ORDER refusal)
 *   - Fix #2: ORDER refusal clears currentFlow so the caller can
 *             switch topics on the next turn.
 */

describe('closed hours', () => {
  test('fix #1: "hi" during closed hours routes to FALLBACK, not the ORDER refusal', async () => {
    await runScenario({
      name: 'closed-greeting',
      context: buildLumpiaContext({ openNow: false }),
      turns: [
        {
          user: 'hi',
          // FALLBACK reply text — the bare-greeting intent router sends
          // this to FALLBACK when closed, so the LLM produces a warm
          // acknowledgment. processInboundSms separately prepends the
          // after-hours notice, but that happens in the host app; the
          // flow engine's reply is just the friendly content.
          chatText: 'Hey there! What can I help you with?',
          expect: {
            flowType: FlowType.FALLBACK,
            replyDoesNotContain: [
              // The ORDER agent's hard refusal must NOT fire for a
              // bare greeting.
              "we're closed right now. Please text us back",
            ],
          },
        },
      ],
    });
  });

  test('fix #2: closed-hours ORDER refusal clears currentFlow so caller can switch topics', async () => {
    await runScenario({
      name: 'closed-refusal-escape',
      context: buildLumpiaContext({ openNow: false }),
      turns: [
        {
          user: '2 #A7 please',
          // The hard closed-hours gate fires BEFORE the LLM, so no
          // tool calls are scripted — the refusal is deterministic.
          expect: {
            flowType: FlowType.ORDER,
            flowStep: null,
            replyContains: "we're closed right now",
            assert: ({ state }) => {
              // The fix: currentFlow cleared so engine.ts line 31
              // won't continue the flow on the next turn.
              if (state?.currentFlow !== null) {
                throw new Error(
                  `expected currentFlow=null after closed refusal, got ${state?.currentFlow}`,
                );
              }
            },
          },
        },
        {
          // Second turn: caller asks about hours. Should re-classify
          // from scratch (not be stuck in CLOSED_REFUSED ORDER).
          user: 'what time do you open?',
          chatText: 'We open at 11 AM today!',
          expect: {
            // The `handleHoursIntent` pre-handler runs in the web app
            // layer, not inside the flow engine. Inside the engine,
            // this routes to FALLBACK.
            flowType: FlowType.FALLBACK,
          },
        },
      ],
    });
  });
});
