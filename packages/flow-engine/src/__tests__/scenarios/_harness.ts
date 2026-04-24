import { runFlowEngine } from '../../engine';
import type { CallerMemory, ChatFn, ChatWithToolsFn, FlowInput, TenantContext } from '../../types';
import type { CallerState, FlowType, SideEffect } from '@ringback/shared-types';

/**
 * Scenario test harness.
 *
 * Each scenario is a scripted multi-turn conversation with an
 * expected reply shape and flow state per turn. The harness threads
 * `nextState` from turn N into `currentState` for turn N+1 so tests
 * reflect real multi-turn behavior.
 *
 * Why build this vs. hand-rolled jest tests? Two reasons:
 *   1. Every turn's expectations live in one data structure, so adding
 *      a regression test is copy-paste-tweak — not 40 lines of boilerplate.
 *   2. Failures surface as "scenario X, turn 3, expected flowStep to be
 *      ORDER_CONFIRM, got ORDER_NAME" with the full reply echoed, so a
 *      diff is readable without jumping through assertion stacks.
 *
 * Tool-use stubbing (chatWithToolsFn): scenarios script per-turn tool
 * calls that the stub returns when the order agent is invoked. If a
 * turn doesn't script any tool calls, the stub returns an empty
 * toolCalls array — which is fine for pre-handler / FALLBACK paths
 * that never reach the order agent.
 */

export interface ToolCallStub {
  name: string;
  input: unknown;
}

export interface TurnExpectation {
  flowType?: FlowType;
  flowStep?: string | null;
  /** Exact reply match. Prefer `replyContains` for less-brittle tests. */
  replyEquals?: string;
  /** Reply must match this regex. */
  replyMatches?: RegExp;
  /** Reply must contain each of these substrings (AND, not OR). */
  replyContains?: string | string[];
  /** Reply must NOT contain any of these substrings. */
  replyDoesNotContain?: string | string[];
  /** Exact list of side-effect `.type` values, in order. */
  sideEffectTypes?: string[];
  /** Custom assertion callback for state or side effects. */
  assert?: (result: {
    state: CallerState | null;
    sideEffects: SideEffect[];
    reply: string;
  }) => void;
}

export interface ScenarioTurn {
  /** Customer's inbound SMS. */
  user: string;
  /**
   * Text the order agent's LLM would say back. Used only if the turn
   * reaches `runOrderAgent`. For pre-handler / FALLBACK turns this is
   * ignored.
   */
  agentText?: string;
  /** Tool calls the order agent's LLM would emit this turn. */
  agentToolCalls?: ToolCallStub[];
  /**
   * Text the intent-classifier / FALLBACK chatFn returns this turn.
   * For intent detection this should be JSON like
   * `{"intent":"FALLBACK","confidence":0.9}`. For FALLBACK it should
   * be the plain-English reply body.
   */
  chatText?: string | ((params: { userMessage: string; systemPrompt: string }) => string);
  expect: TurnExpectation;
}

export interface Scenario {
  name: string;
  context: TenantContext;
  callerPhone?: string;
  callerMemory?: CallerMemory;
  /** Number of orders ahead in the queue, returned by `getActiveOrderCount`. */
  queueCount?: number;
  turns: ScenarioTurn[];
}

/**
 * Default stub behavior when the scenario doesn't override `chatText`.
 * Branches on which chatFn caller we're serving:
 *   - Intent classifier (prompt contains "intent"): return a JSON verdict.
 *     If the user's message looks like an order (has a digit, "#SKU",
 *     or the word "order"), classify ORDER; else FALLBACK. Real intent
 *     detection runs a richer LLM prompt on ambiguous messages, but
 *     these heuristics cover our scenarios without hand-scripting a
 *     chatText on every order turn.
 *   - FALLBACK reply path: return a bland acknowledgment so assertions
 *     focusing on flowType / sideEffects still work. Scenarios that
 *     care about reply content override chatText explicitly.
 */
function defaultChatReply(userMessage: string, systemPrompt: string): string {
  // intentDetector.ts uses `systemPrompt: "You are an intent classifier..."`
  // and puts the JSON-asking prompt in userMessage. Sniff either field.
  const isIntentClassifier =
    /intent classifier/i.test(systemPrompt) ||
    /Classify the customer's intent|Classify the intent|Respond with JSON/i.test(
      userMessage,
    );
  if (isIntentClassifier) {
    // The intent-classifier prompt embeds the original customer text
    // as: `The customer sent this SMS: "…"`. Extract it so our
    // order-detection heuristic runs on the real input rather than
    // the whole classification prompt boilerplate.
    const embeddedMatch = userMessage.match(/customer sent this SMS:\s*"([^"]*)"/i);
    const customerText = embeddedMatch ? embeddedMatch[1] : userMessage;
    const looksLikeOrder =
      /(order|buy|menu|lumpia|siomai)/i.test(customerText) ||
      /#[A-Za-z]?\d+/.test(customerText) ||
      /^\s*\d+\s+/.test(customerText);
    return looksLikeOrder
      ? '{"intent":"ORDER","confidence":0.9}'
      : '{"intent":"FALLBACK","confidence":0.8}';
  }
  return 'OK, let me know what you need!';
}

export async function runScenario(scenario: Scenario): Promise<void> {
  let state: CallerState | null = null;
  const callerPhone = scenario.callerPhone ?? '+12175550199';

  for (let i = 0; i < scenario.turns.length; i++) {
    const turn = scenario.turns[i];
    const turnLabel = `[${scenario.name}] turn ${i + 1} (user="${turn.user.slice(0, 40)}")`;

    const chatFn: ChatFn = jest.fn().mockImplementation(async ({ systemPrompt, userMessage }) => {
      if (typeof turn.chatText === 'function') {
        return turn.chatText({ userMessage, systemPrompt });
      }
      if (turn.chatText !== undefined) return turn.chatText;
      return defaultChatReply(userMessage, systemPrompt);
    });

    const chatWithToolsFn: ChatWithToolsFn = jest.fn().mockResolvedValue({
      text: turn.agentText ?? '',
      toolCalls: (turn.agentToolCalls ?? []).map((tc, j) => ({
        id: `t${i}_${j}`,
        name: tc.name,
        input: tc.input,
      })),
      stopReason: 'end_turn',
      provider: 'claude' as const,
    });

    const input: FlowInput = {
      tenantContext: scenario.context,
      callerPhone,
      inboundMessage: turn.user,
      currentState: state,
      chatFn,
      chatWithToolsFn,
      callerMemory: scenario.callerMemory,
      getActiveOrderCount:
        scenario.queueCount != null
          ? jest.fn().mockResolvedValue(scenario.queueCount)
          : undefined,
    };

    const result = await runFlowEngine(input);
    assertTurn(turnLabel, turn.expect, result);
    state = result.nextState;
  }
}

function assertTurn(
  label: string,
  expect_: TurnExpectation,
  result: { smsReply: string; sideEffects: SideEffect[]; flowType: FlowType; nextState: CallerState },
): void {
  const reply = result.smsReply ?? '';

  if (expect_.flowType !== undefined) {
    if (result.flowType !== expect_.flowType) {
      throw new Error(
        `${label}: expected flowType=${expect_.flowType}, got ${result.flowType}. Reply was: ${JSON.stringify(reply)}`,
      );
    }
  }
  if (expect_.flowStep !== undefined) {
    const actual = result.nextState?.flowStep ?? null;
    if (actual !== expect_.flowStep) {
      throw new Error(
        `${label}: expected flowStep=${expect_.flowStep}, got ${actual}. Reply was: ${JSON.stringify(reply)}`,
      );
    }
  }
  if (expect_.replyEquals !== undefined && reply !== expect_.replyEquals) {
    throw new Error(
      `${label}: reply did not match exactly.\n  expected: ${JSON.stringify(expect_.replyEquals)}\n  actual:   ${JSON.stringify(reply)}`,
    );
  }
  if (expect_.replyMatches && !expect_.replyMatches.test(reply)) {
    throw new Error(
      `${label}: reply did not match /${expect_.replyMatches.source}/.\n  actual: ${JSON.stringify(reply)}`,
    );
  }
  if (expect_.replyContains !== undefined) {
    const needles = Array.isArray(expect_.replyContains)
      ? expect_.replyContains
      : [expect_.replyContains];
    for (const needle of needles) {
      if (!reply.includes(needle)) {
        throw new Error(
          `${label}: reply did not contain ${JSON.stringify(needle)}.\n  actual: ${JSON.stringify(reply)}`,
        );
      }
    }
  }
  if (expect_.replyDoesNotContain !== undefined) {
    const needles = Array.isArray(expect_.replyDoesNotContain)
      ? expect_.replyDoesNotContain
      : [expect_.replyDoesNotContain];
    for (const needle of needles) {
      if (reply.includes(needle)) {
        throw new Error(
          `${label}: reply contained forbidden substring ${JSON.stringify(needle)}.\n  actual: ${JSON.stringify(reply)}`,
        );
      }
    }
  }
  if (expect_.sideEffectTypes !== undefined) {
    const expected = expect_.sideEffectTypes;
    const actual = result.sideEffects.map((e) => e.type);
    const same =
      actual.length === expected.length &&
      actual.every((t, i) => t === expected[i]);
    if (!same) {
      throw new Error(
        `${label}: sideEffect mismatch.\n  expected: [${expected.join(', ')}]\n  actual:   [${actual.join(', ')}]`,
      );
    }
  }
  if (expect_.assert) {
    expect_.assert({
      state: result.nextState,
      sideEffects: result.sideEffects,
      reply,
    });
  }
}
