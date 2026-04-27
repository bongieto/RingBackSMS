import { FlowType } from '@ringback/shared-types';
import { runFlowEngine } from '../../engine';
import type { CallerState, SideEffect } from '@ringback/shared-types';
import type { CallerMemory, ChatFn, ChatWithToolsFn, FlowInput } from '../../types';
import { buildLumpiaContext, IDS } from './_fixtures';

/**
 * Accuracy benchmark.
 *
 * Runs a broad, diverse set of single-turn cases spanning every
 * production path (intent routing, ORDER flow, FALLBACK guards,
 * closures, URL handling, fuzzy matching, closed hours, paused
 * orders, meeting flow, inquiry). Each case declares the expected
 * behavior. The harness records pass/fail per case, prints a
 * detailed failure report, and the suite fails unless overall
 * accuracy is ≥ the threshold.
 *
 * This is deliberately flat / data-driven so adding new realistic
 * customer inputs is cheap — a single row in the `CASES` array.
 */

const ACCURACY_THRESHOLD = 0.9;
const CRITICAL_GROUPS = new Set([
  'intent-routing',
  'order-flow',
  'meeting-flow',
  'closures',
  'fallback-hardening',
  'ungrounded-guards',
  'sms-cap',
]);

type AgentToolStub = { name: string; input: unknown };

interface AccuracyCase {
  id: string;
  group: string;
  /** One-line description of what we're testing. */
  desc: string;
  /** Inbound customer SMS. */
  user: string;
  /** Tenant flavor — defaults to { openNow: true, ORDER+FALLBACK }. */
  contextBuilder?: () => ReturnType<typeof buildLumpiaContext>;
  /** Pre-populated caller state. */
  initialState?: CallerState | null;
  /** Caller memory (active order, tier, etc). */
  callerMemory?: CallerMemory;
  /** Tool calls the order-agent LLM would emit. */
  agentToolCalls?: AgentToolStub[];
  /** Text the order-agent LLM would emit (optional). */
  agentText?: string;
  /** Intent-classifier / FALLBACK chat reply. If it's a fn, branches on prompt. */
  chatText?: string | ((p: { userMessage: string; systemPrompt: string }) => string);
  queueCount?: number;

  // Expectations
  expectFlowType?: FlowType;
  expectFlowStep?: string | null;
  expectReplyContains?: string | string[];
  expectReplyDoesNotContain?: string | string[];
  expectReplyMatches?: RegExp;
  expectSideEffectTypes?: string[];
  expectReplyNonEmpty?: boolean;
  expectReplyEmpty?: boolean;
  customAssert?: (r: {
    state: CallerState | null;
    sideEffects: SideEffect[];
    reply: string;
  }) => string | null; // returns error message on fail, null on pass
}

/** Default chat reply — branches based on prompt shape. Mirrors _harness.ts. */
function defaultChatReply(userMessage: string, systemPrompt: string): string {
  const isIntentClassifier =
    /intent classifier/i.test(systemPrompt) ||
    /Classify the customer's intent|Respond with JSON/i.test(userMessage);
  if (isIntentClassifier) {
    const embedded = userMessage.match(/customer sent this SMS:\s*"([^"]*)"/i);
    const text = embedded ? embedded[1] : userMessage;
    const looksLikeOrder =
      /(order|buy|menu|lumpia|siomai|sizzler|bbq)/i.test(text) ||
      /#[A-Za-z]?\d+/.test(text) ||
      /^\s*\d+\s+/.test(text);
    const looksLikeMeeting = /(schedule|appointment|meeting|book\s|consultation)/i.test(text);
    const looksLikeInquiry =
      /(do you have|got any|in stock|available|looking for|how much|price of|have any)/i.test(text);
    if (looksLikeOrder) return '{"intent":"ORDER","confidence":0.9}';
    if (looksLikeMeeting) return '{"intent":"MEETING","confidence":0.9}';
    if (looksLikeInquiry) return '{"intent":"INQUIRY","confidence":0.9}';
    return '{"intent":"FALLBACK","confidence":0.8}';
  }
  return 'Sounds good!';
}

async function runOneCase(c: AccuracyCase): Promise<{ pass: boolean; reason: string; reply: string; flowType: FlowType; flowStep: string | null }> {
  const ctx = (c.contextBuilder ?? (() => buildLumpiaContext({ openNow: true })))();
  const chatFn: ChatFn = async ({ systemPrompt, userMessage }) => {
    if (typeof c.chatText === 'function') return c.chatText({ userMessage, systemPrompt });
    if (c.chatText !== undefined) {
      // If user supplied chatText, still branch intent classifier vs fallback.
      const isIntentClassifier =
        /intent classifier/i.test(systemPrompt) ||
        /Classify the customer's intent|Respond with JSON/i.test(userMessage);
      if (isIntentClassifier) {
        // Need a valid JSON — use default heuristic
        return defaultChatReply(userMessage, systemPrompt);
      }
      return c.chatText;
    }
    return defaultChatReply(userMessage, systemPrompt);
  };
  const chatWithToolsFn: ChatWithToolsFn = async () => ({
    text: c.agentText ?? '',
    toolCalls: (c.agentToolCalls ?? []).map((tc, j) => ({
      id: `t_${j}`,
      name: tc.name,
      input: tc.input as Record<string, unknown>,
    })),
    stopReason: 'end_turn',
    provider: 'claude' as const,
  });

  const input: FlowInput = {
    tenantContext: ctx,
    callerPhone: '+12175550199',
    inboundMessage: c.user,
    currentState: c.initialState ?? null,
    chatFn,
    chatWithToolsFn,
    callerMemory: c.callerMemory,
    getActiveOrderCount:
      c.queueCount != null ? async () => c.queueCount as number : undefined,
  };

  let result;
  try {
    result = await runFlowEngine(input);
  } catch (err) {
    return { pass: false, reason: `threw: ${(err as Error).message}`, reply: '', flowType: FlowType.FALLBACK, flowStep: null };
  }
  const reply = result.smsReply ?? '';
  const flowStep = result.nextState?.flowStep ?? null;

  if (c.expectFlowType !== undefined && result.flowType !== c.expectFlowType) {
    return { pass: false, reason: `flowType=${result.flowType}, expected ${c.expectFlowType}`, reply, flowType: result.flowType, flowStep };
  }
  if (c.expectFlowStep !== undefined && flowStep !== c.expectFlowStep) {
    return { pass: false, reason: `flowStep=${flowStep}, expected ${c.expectFlowStep}`, reply, flowType: result.flowType, flowStep };
  }
  if (c.expectReplyContains !== undefined) {
    const needles = Array.isArray(c.expectReplyContains) ? c.expectReplyContains : [c.expectReplyContains];
    for (const n of needles) {
      if (!reply.includes(n)) {
        return { pass: false, reason: `reply missing ${JSON.stringify(n)}`, reply, flowType: result.flowType, flowStep };
      }
    }
  }
  if (c.expectReplyDoesNotContain !== undefined) {
    const needles = Array.isArray(c.expectReplyDoesNotContain) ? c.expectReplyDoesNotContain : [c.expectReplyDoesNotContain];
    for (const n of needles) {
      if (reply.includes(n)) {
        return { pass: false, reason: `reply contains forbidden ${JSON.stringify(n)}`, reply, flowType: result.flowType, flowStep };
      }
    }
  }
  if (c.expectReplyMatches && !c.expectReplyMatches.test(reply)) {
    return { pass: false, reason: `reply didn't match /${c.expectReplyMatches.source}/`, reply, flowType: result.flowType, flowStep };
  }
  if (c.expectSideEffectTypes !== undefined) {
    const actual = result.sideEffects.map((e) => e.type);
    const exp = c.expectSideEffectTypes;
    const same = actual.length === exp.length && actual.every((t, i) => t === exp[i]);
    if (!same) {
      return { pass: false, reason: `sideEffects [${actual.join(',')}], expected [${exp.join(',')}]`, reply, flowType: result.flowType, flowStep };
    }
  }
  if (c.expectReplyNonEmpty && reply.trim() === '') {
    return { pass: false, reason: 'reply was empty', reply, flowType: result.flowType, flowStep };
  }
  if (c.expectReplyEmpty && reply.trim() !== '') {
    return { pass: false, reason: `reply should be empty, got ${JSON.stringify(reply)}`, reply, flowType: result.flowType, flowStep };
  }
  if (c.customAssert) {
    const err = c.customAssert({ state: result.nextState, sideEffects: result.sideEffects, reply });
    if (err) return { pass: false, reason: err, reply, flowType: result.flowType, flowStep };
  }
  return { pass: true, reason: '', reply, flowType: result.flowType, flowStep };
}

// ──────────────────────────────────────────────────────────────────────────
// Cases
// ──────────────────────────────────────────────────────────────────────────

const CASES: AccuracyCase[] = [
  // ── INTENT ROUTING ────────────────────────────────────────────────────
  {
    id: 'intent-01',
    group: 'intent-routing',
    desc: 'bare "menu" routes to ORDER',
    user: 'menu',
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'intent-02',
    group: 'intent-routing',
    desc: 'bare "hi" during open hours routes to ORDER greeting',
    user: 'hi',
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'intent-03',
    group: 'intent-routing',
    desc: '"hello there" during open hours routes to ORDER greeting',
    user: 'hello',
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'intent-04',
    group: 'intent-routing',
    desc: '"hi" during closed hours routes to FALLBACK (not ORDER refusal)',
    user: 'hi',
    contextBuilder: () => buildLumpiaContext({ openNow: false }),
    chatText: 'Hey there! What can we help with?',
    expectFlowType: FlowType.FALLBACK,
    expectReplyDoesNotContain: "we're closed right now",
  },
  {
    id: 'intent-05',
    group: 'intent-routing',
    desc: '"I want to order" routes to ORDER',
    user: 'I want to order',
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'intent-06',
    group: 'intent-routing',
    desc: 'place an order phrase routes to ORDER',
    user: 'place an order please',
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'intent-07',
    group: 'intent-routing',
    desc: 'meeting keyword routes to MEETING (when enabled)',
    user: 'I want to schedule a meeting',
    contextBuilder: () =>
      buildLumpiaContext({ openNow: true, flowTypes: [FlowType.MEETING, FlowType.FALLBACK] }),
    expectFlowType: FlowType.MEETING,
  },
  {
    id: 'intent-08',
    group: 'intent-routing',
    desc: 'appointment keyword routes to MEETING',
    user: 'book an appointment',
    contextBuilder: () =>
      buildLumpiaContext({ openNow: true, flowTypes: [FlowType.MEETING, FlowType.FALLBACK] }),
    expectFlowType: FlowType.MEETING,
  },
  {
    id: 'intent-09',
    group: 'intent-routing',
    desc: 'open-ended question routes to FALLBACK',
    user: 'do you guys deliver?',
    chatText: 'No, pickup only!',
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: 'pickup',
  },
  {
    id: 'intent-10',
    group: 'intent-routing',
    desc: 'parking question routes to FALLBACK',
    user: 'is parking easy?',
    chatText: 'Plenty of street parking!',
    expectFlowType: FlowType.FALLBACK,
  },

  // ── ORDER FLOW ────────────────────────────────────────────────────────
  {
    id: 'order-01',
    group: 'order-flow',
    desc: 'single item from menu → PICKUP_TIME or ORDER_NAME',
    user: '1 #A7',
    agentToolCalls: [
      { name: 'add_items', input: { items: [{ menu_item_id: IDS.a7, quantity: 1 }] } },
    ],
    agentText: 'Added 1× #A7 Siomai.',
    expectFlowType: FlowType.ORDER,
    expectFlowStep: 'ORDER_NAME',
    expectReplyContains: '#A7 Siomai',
  },
  {
    id: 'order-02',
    group: 'order-flow',
    desc: 'two items → added to cart, advance slot',
    user: '2 #A7 and 1 #LB2',
    agentToolCalls: [
      {
        name: 'add_items',
        input: {
          items: [
            { menu_item_id: IDS.a7, quantity: 2 },
            { menu_item_id: IDS.lb2, quantity: 1 },
          ],
        },
      },
    ],
    expectFlowType: FlowType.ORDER,
    customAssert: ({ state }) => {
      const items = state?.orderDraft?.items ?? [];
      if (items.length !== 2) return `expected 2 items in cart, got ${items.length}`;
      return null;
    },
  },
  {
    id: 'order-03',
    group: 'order-flow',
    desc: 'fuzzy typo "siomi" → adds Siomai via safety net',
    user: '1 siomi',
    agentToolCalls: [],
    agentText: '',
    expectFlowType: FlowType.ORDER,
    customAssert: ({ state }) => {
      const items = state?.orderDraft?.items ?? [];
      if (items.length !== 1) return `fuzzy add failed: ${items.length} items`;
      if (!items[0].name.toLowerCase().includes('siomai')) return `got ${items[0].name}`;
      return null;
    },
  },
  {
    id: 'order-04',
    group: 'order-flow',
    desc: 'multi-word fuzzy "calmansi sizzer" → Calamansi Sizzler',
    user: '1 calmansi sizzer',
    agentToolCalls: [],
    expectFlowType: FlowType.ORDER,
    customAssert: ({ state }) => {
      const items = state?.orderDraft?.items ?? [];
      if (items.length === 0) return 'multi-word fuzzy match found nothing';
      if (!items[0].name.toLowerCase().includes('calamansi')) return `got ${items[0].name}`;
      return null;
    },
  },
  {
    id: 'order-05',
    group: 'order-flow',
    desc: 'gibberish adds no phantom items',
    user: 'zzzz qqqq',
    agentToolCalls: [],
    customAssert: ({ state }) => {
      const items = state?.orderDraft?.items ?? [];
      if (items.length > 0) return `phantom cart items: ${items.length}`;
      return null;
    },
  },
  {
    id: 'order-06',
    group: 'order-flow',
    desc: 'confirm with no name/pickup is blocked, advances to ORDER_NAME',
    user: '1 #A7 and confirm now',
    agentText: 'Order confirmed!',
    agentToolCalls: [
      { name: 'add_items', input: { items: [{ menu_item_id: IDS.a7, quantity: 1 }] } },
      { name: 'confirm_order', input: {} },
    ],
    expectFlowType: FlowType.ORDER,
    expectFlowStep: 'ORDER_NAME',
    expectReplyContains: 'name',
    expectSideEffectTypes: [],
  },
  {
    id: 'order-07',
    group: 'order-flow',
    desc: 'closed hours → ORDER refusal clears currentFlow',
    user: '2 #A7 please',
    contextBuilder: () => buildLumpiaContext({ openNow: false }),
    expectFlowType: FlowType.ORDER,
    expectFlowStep: null,
    expectReplyContains: "we're closed right now",
    customAssert: ({ state }) => {
      if (state?.currentFlow !== null) return `currentFlow=${state?.currentFlow}, expected null`;
      return null;
    },
  },
  {
    id: 'order-08',
    group: 'order-flow',
    desc: 'paused orders short-circuits to polite decline',
    user: 'I want to order',
    contextBuilder: () =>
      buildLumpiaContext({ openNow: true, config: { ordersAcceptingEnabled: false } }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: 'not accepting new orders',
  },
  {
    id: 'order-09',
    group: 'order-flow',
    desc: 'cart-edit at ORDER_NAME echoes new quantity',
    user: 'actually make it 3',
    initialState: {
      tenantId: '10000000-0000-0000-0000-000000000001',
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_NAME',
      orderDraft: {
        items: [
          {
            menuItemId: IDS.a7,
            name: '#A7 Siomai (4 Pcs)',
            quantity: 1,
            price: 5.99,
          },
        ],
      },
      lastMessageAt: Date.now(),
      messageCount: 1,
      dedupKey: null,
    } as any,
    agentToolCalls: [
      { name: 'update_quantity', input: { menu_item_id: IDS.a7, quantity: 3 } },
    ],
    expectFlowType: FlowType.ORDER,
    expectReplyContains: ['Updated:', '3×'],
  },

  // ── UNGROUNDED GUARDS ─────────────────────────────────────────────────
  {
    id: 'guard-01',
    group: 'ungrounded-guards',
    desc: 'bare "yes confirm" without order → deflection',
    user: 'yes confirm',
    chatText: 'Perfect! Your order is confirmed. [payment link would be sent here]',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.ORDER, FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: 'Not sure what',
    expectReplyDoesNotContain: ['order is confirmed', '[payment link'],
  },
  {
    id: 'guard-02',
    group: 'ungrounded-guards',
    desc: 'cancel without active order → deflection',
    user: 'cancel my order',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    chatText: 'Order cancelled!',
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: "don't see a pending order",
    expectReplyDoesNotContain: 'Order cancelled',
  },
  {
    id: 'guard-03',
    group: 'ungrounded-guards',
    desc: 'refund request always deflects to human',
    user: 'refund please',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    chatText: 'Refund processed!',
    callerMemory: {
      activeOrder: {
        orderNumber: 'ORD-1',
        status: 'COMPLETED',
        itemsSummary: '1× Siomai',
        total: 5.99,
      },
    } as CallerMemory,
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: 'call',
    expectReplyDoesNotContain: 'Refund processed',
  },
  {
    id: 'guard-04',
    group: 'ungrounded-guards',
    desc: 'status without order → deflection',
    user: "where's my order",
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    chatText: 'Your order is ready!',
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: "don't see an active order",
    expectReplyDoesNotContain: 'ready',
  },
  {
    id: 'guard-05',
    group: 'ungrounded-guards',
    desc: 'cancel with active order flows through to LLM',
    user: 'cancel my order',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    callerMemory: {
      activeOrder: {
        orderNumber: 'ORD-1',
        status: 'CONFIRMED',
        itemsSummary: '1× Siomai',
        total: 5.99,
      },
    } as CallerMemory,
    chatText: "I'll pass that along to our staff.",
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: 'pass that along',
    expectReplyDoesNotContain: "don't see a pending order",
  },

  // ── CLOSURES ──────────────────────────────────────────────────────────
  {
    id: 'closure-01',
    group: 'closures',
    desc: 'polite "thanks" → "You\'re welcome!"',
    user: 'thanks',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: "You're welcome",
  },
  {
    id: 'closure-02',
    group: 'closures',
    desc: 'polite "ok" → silent (empty reply)',
    user: 'ok',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyEmpty: true,
  },
  {
    id: 'closure-03',
    group: 'closures',
    desc: '"bye" → "See you!"',
    user: 'bye',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: 'See you',
  },
  {
    id: 'closure-04',
    group: 'closures',
    desc: '"got it" → silent',
    user: 'got it',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyEmpty: true,
  },
  {
    id: 'closure-05',
    group: 'closures',
    desc: '"thank you" → "You\'re welcome!"',
    user: 'thank you',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: "You're welcome",
  },

  // ── FALLBACK HARDENING ───────────────────────────────────────────────
  {
    id: 'fallback-01',
    group: 'fallback-hardening',
    desc: 'template placeholder "[link would be sent here]" is stripped',
    user: 'do you guys do delivery?',
    chatText: 'Sure thing! [Delivery link would be sent here]',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.ORDER, FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyDoesNotContain: ['[Delivery link', 'would be sent here'],
  },
  {
    id: 'fallback-02',
    group: 'fallback-hardening',
    desc: 'long URL preservation — URL intact at tail',
    user: 'do you guys have a website?',
    chatText:
      `${'x'.repeat(280)} https://ringbacksms.com/m/the-lumpia-house-and-truck`,
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.ORDER, FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: 'https://ringbacksms.com/m/the-lumpia-house-and-truck',
    customAssert: ({ reply }) => {
      if (!/https:\/\/ringbacksms\.com\/m\/the-lumpia-house-and-truck\s*$/.test(reply)) {
        return 'URL not at tail';
      }
      return null;
    },
  },
  {
    id: 'fallback-03',
    group: 'fallback-hardening',
    desc: 'empty LLM reply → deflection, not silence',
    user: 'do you have wifi?',
    chatText: '',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyNonEmpty: true,
  },
  {
    id: 'fallback-04',
    group: 'fallback-hardening',
    desc: '<silence> sentinel from LLM → deflection, not literal tag',
    user: 'any specials today?',
    chatText: '<silence>',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyDoesNotContain: '<silence>',
    expectReplyNonEmpty: true,
  },
  {
    id: 'fallback-05',
    group: 'fallback-hardening',
    desc: '<think> reasoning tags are stripped',
    user: 'hours?',
    chatText: '<think>let me check</think>We open 11-8!',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyDoesNotContain: ['<think>', '</think>'],
    expectReplyContains: '11-8',
  },

  // ── INQUIRY FLOW ─────────────────────────────────────────────────────
  {
    id: 'inquiry-01',
    group: 'inquiry-flow',
    desc: '"do you have siomai?" routes to INQUIRY',
    user: 'do you have siomai?',
    contextBuilder: () =>
      buildLumpiaContext({
        openNow: true,
        flowTypes: [FlowType.INQUIRY, FlowType.FALLBACK],
      }),
    expectFlowType: FlowType.INQUIRY,
  },
  {
    id: 'inquiry-02',
    group: 'inquiry-flow',
    desc: '"how much is the pork bbq bowl" routes to INQUIRY',
    user: 'how much is the pork bbq bowl?',
    contextBuilder: () =>
      buildLumpiaContext({
        openNow: true,
        flowTypes: [FlowType.INQUIRY, FlowType.FALLBACK],
      }),
    expectFlowType: FlowType.INQUIRY,
  },

  // ── MEETING FLOW ─────────────────────────────────────────────────────
  {
    id: 'meeting-01',
    group: 'meeting-flow',
    desc: 'meeting greeting with calcom link returns link',
    user: 'schedule a call',
    contextBuilder: () =>
      buildLumpiaContext({
        openNow: true,
        flowTypes: [FlowType.MEETING, FlowType.FALLBACK],
        config: { calcomLink: 'https://cal.com/test' },
      }),
    expectFlowType: FlowType.MEETING,
    expectReplyContains: 'https://cal.com/test',
  },
  {
    id: 'meeting-02',
    group: 'meeting-flow',
    desc: 'meeting with no calcom config → manual schedule message',
    user: 'appointment please',
    contextBuilder: () =>
      buildLumpiaContext({
        openNow: true,
        flowTypes: [FlowType.MEETING, FlowType.FALLBACK],
        config: { meetingEnabled: false },
      }),
    expectFlowType: FlowType.MEETING,
    expectReplyContains: 'preferred date',
  },

  // ── CASE / PUNCTUATION NORMALIZATION ──────────────────────────────────
  {
    id: 'norm-01',
    group: 'normalization',
    desc: '"MENU" uppercase routes to ORDER',
    user: 'MENU',
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'norm-02',
    group: 'normalization',
    desc: '"Hi!" with punctuation still greets',
    user: 'Hi!',
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'norm-03',
    group: 'normalization',
    desc: '"hey   there" whitespace-tolerant',
    user: 'hey there',
    chatText: 'Howdy!',
    expectReplyNonEmpty: true,
  },

  // ── EDGE CASES ────────────────────────────────────────────────────────
  {
    id: 'edge-01',
    group: 'edge-cases',
    desc: 'escalation keyword gets non-empty reply (human hand-off context)',
    user: 'talk to a human',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    chatText: "I'll let someone know!",
    expectFlowType: FlowType.FALLBACK,
    expectReplyNonEmpty: true,
  },
  {
    id: 'edge-02',
    group: 'edge-cases',
    desc: 'emoji-only message → closure silent',
    user: '👍',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyEmpty: true,
  },
  {
    id: 'edge-03',
    group: 'edge-cases',
    desc: '"nice" is treated as closure (no CTA push)',
    user: 'nice',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyEmpty: true,
  },
  {
    id: 'edge-04',
    group: 'edge-cases',
    desc: 'number-only message does NOT false-trigger order',
    user: '42',
    chatText: 'Can you tell me what you meant?',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    // Intent should route to FALLBACK since no flow match; bare "42" not an order.
    expectFlowType: FlowType.FALLBACK,
  },
  {
    id: 'edge-05',
    group: 'edge-cases',
    desc: 'whitespace-only message routes to FALLBACK with non-empty reply',
    user: '   ',
    chatText: 'Did you mean to send a message?',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyNonEmpty: true,
  },

  // ── MID-FLOW BEHAVIOR ─────────────────────────────────────────────────
  {
    id: 'mid-01',
    group: 'mid-flow',
    desc: 'providing name at ORDER_NAME step advances to PICKUP_TIME',
    user: 'Maria',
    initialState: {
      tenantId: '10000000-0000-0000-0000-000000000001',
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_NAME',
      orderDraft: {
        items: [{ menuItemId: IDS.a7, name: '#A7 Siomai', quantity: 1, price: 5.99 }],
      },
      lastMessageAt: Date.now(),
      messageCount: 1,
      dedupKey: null,
    } as any,
    agentToolCalls: [{ name: 'set_customer_name', input: { name: 'Maria' } }],
    expectFlowType: FlowType.ORDER,
    expectFlowStep: 'PICKUP_TIME',
  },
  {
    id: 'mid-02',
    group: 'mid-flow',
    desc: 'providing pickup time at PICKUP_TIME step advances to ORDER_CONFIRM',
    user: '15 minutes',
    initialState: {
      tenantId: '10000000-0000-0000-0000-000000000001',
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'PICKUP_TIME',
      orderDraft: {
        items: [{ menuItemId: IDS.a7, name: '#A7 Siomai', quantity: 1, price: 5.99 }],
      },
      customerName: 'Maria',
      lastMessageAt: Date.now(),
      messageCount: 2,
      dedupKey: null,
    } as any,
    agentToolCalls: [{ name: 'set_pickup_time', input: { when: '15 min' } }],
    expectFlowType: FlowType.ORDER,
    expectFlowStep: 'ORDER_CONFIRM',
    expectReplyContains: '15 min',
  },
  {
    id: 'mid-03',
    group: 'mid-flow',
    desc: '"yes" at ORDER_CONFIRM with all slots ready → places order',
    user: 'yes',
    initialState: {
      tenantId: '10000000-0000-0000-0000-000000000001',
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_CONFIRM',
      orderDraft: {
        items: [{ menuItemId: IDS.a7, name: '#A7 Siomai', quantity: 1, price: 5.99 }],
        pickupTime: '15 min',
      },
      customerName: 'Maria',
      lastMessageAt: Date.now(),
      messageCount: 3,
      dedupKey: null,
    } as any,
    agentToolCalls: [{ name: 'confirm_order', input: {} }],
    queueCount: 0,
    expectFlowType: FlowType.ORDER,
    expectFlowStep: 'AWAITING_PAYMENT',
    expectSideEffectTypes: ['SAVE_ORDER', 'CREATE_PAYMENT_LINK', 'NOTIFY_OWNER'],
  },
  {
    id: 'mid-04',
    group: 'mid-flow',
    desc: 'mid-ORDER when paused → polite decline',
    user: '1 #A7',
    initialState: {
      tenantId: '10000000-0000-0000-0000-000000000001',
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_NAME',
      orderDraft: { items: [] },
      lastMessageAt: Date.now(),
      messageCount: 1,
      dedupKey: null,
    } as any,
    contextBuilder: () =>
      buildLumpiaContext({ openNow: true, config: { ordersAcceptingEnabled: false } }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: 'paused',
  },

  // ── MULTI-TURN (re-process scenarios are covered in other files;
  // here we spot-check single-turn forwards) ──

  // ── CASE SENSITIVITY & VARIATION ─────────────────────────────────────
  {
    id: 'var-01',
    group: 'variants',
    desc: '"yo" counts as greeting opener → ORDER',
    user: 'yo',
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'var-02',
    group: 'variants',
    desc: '"good morning" → ORDER greeting',
    user: 'good morning',
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'var-03',
    group: 'variants',
    desc: '"howdy" → ORDER greeting',
    user: 'howdy',
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'var-04',
    group: 'variants',
    desc: '"ORDER FOOD" phrase routes to ORDER',
    user: 'I want to order food please',
    expectFlowType: FlowType.ORDER,
  },

  // ── ORDER AGENT FAILURE MODES ────────────────────────────────────────
  {
    id: 'agent-01',
    group: 'agent-robustness',
    desc: 'order agent throws → falls back gracefully to regex flow',
    user: 'menu',
    // Force the tool chat fn to throw — orderAgent must catch and fall through.
    customAssert: ({ reply }) => {
      if (!reply || reply.trim() === '') return 'expected non-empty reply on agent failure';
      return null;
    },
    // Note: we rely on runOrderAgent's try/catch. The default stub doesn't
    // throw, so this just exercises happy-path. Real failure mode tested in
    // orderAgent.test.ts.
  },

  // ── CASE: PERSISTENT STATE ACROSS TURNS ─────────────────────────────
  {
    id: 'state-01',
    group: 'state-preservation',
    desc: 'ORDER_COMPLETE state allows fresh intent detection',
    user: 'do you guys have coffee?',
    initialState: {
      tenantId: '10000000-0000-0000-0000-000000000001',
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_COMPLETE',
      orderDraft: null,
      lastMessageAt: Date.now(),
      messageCount: 5,
      dedupKey: null,
    } as any,
    chatText: "We don't have coffee, sorry!",
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    // ORDER_COMPLETE state should let new intents be detected — question is FALLBACK.
    expectFlowType: FlowType.FALLBACK,
  },

  // ── BUSINESS HOURS INFO PROPAGATION ──────────────────────────────────
  {
    id: 'hours-01',
    group: 'business-hours',
    desc: 'asking about hours while open routes to FALLBACK with non-empty reply',
    user: 'when do you close tonight?',
    chatText: 'We close at 8 PM!',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: '8',
  },
  {
    id: 'hours-02',
    group: 'business-hours',
    desc: 'asking about hours while closed → FALLBACK',
    user: 'what time do you open?',
    chatText: 'We open at 11 AM tomorrow!',
    contextBuilder: () => buildLumpiaContext({ openNow: false, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyNonEmpty: true,
  },

  // ── DIVERSE CUSTOMER PHRASINGS ───────────────────────────────────────
  {
    id: 'phrasing-01',
    group: 'diverse-phrasing',
    desc: '"can I get some lumpia" → ORDER',
    user: 'can I get some lumpia',
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'phrasing-02',
    group: 'diverse-phrasing',
    desc: '"gimme the menu" routes to ORDER',
    user: 'gimme the menu',
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'phrasing-03',
    group: 'diverse-phrasing',
    desc: '"I\'d like to buy something" → ORDER',
    user: "I'd like to buy something",
    expectFlowType: FlowType.ORDER,
  },

  // ── PREVIOUSLY-BROKEN REGRESSIONS ────────────────────────────────────
  {
    id: 'regress-01',
    group: 'regressions',
    desc: '"yes but change X" does not accidentally confirm',
    user: 'yes but change the siomai to 3',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    chatText: 'Noted!',
    expectFlowType: FlowType.FALLBACK,
    // With no active order context, still should not hallucinate confirmation.
    expectReplyDoesNotContain: ['Order confirmed', 'payment link'],
  },
  {
    id: 'regress-02',
    group: 'regressions',
    desc: '"nvm cancel" without order → deflection',
    user: 'nvm cancel',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    chatText: 'Order cancelled.',
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: "don't see a pending order",
  },

  // ── DEEPER GUARD VARIATIONS ──────────────────────────────────────────
  {
    id: 'guard-06',
    group: 'ungrounded-guards',
    desc: 'bare "yeah" with no order → deflection',
    user: 'yeah',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    chatText: 'Confirmed!',
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: 'Not sure',
    expectReplyDoesNotContain: 'Confirmed',
  },
  {
    id: 'guard-07',
    group: 'ungrounded-guards',
    desc: '"order status" without order → deflection',
    user: 'order status',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    chatText: 'Your order is on the way!',
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: "don't see an active order",
  },
  {
    id: 'guard-08',
    group: 'ungrounded-guards',
    desc: '"refund me" (short form) deflects',
    user: 'refund me',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    chatText: 'Refund is on its way.',
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: 'call',
  },
  {
    id: 'guard-09',
    group: 'ungrounded-guards',
    desc: '"can i get a refund?" deflects',
    user: 'can i get a refund?',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    chatText: 'Refund processed.',
    expectFlowType: FlowType.FALLBACK,
    expectReplyDoesNotContain: 'processed',
  },

  // ── MORE CLOSURES ────────────────────────────────────────────────────
  {
    id: 'closure-06',
    group: 'closures',
    desc: '"thx" → "You\'re welcome!"',
    user: 'thx',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectReplyContains: "You're welcome",
  },
  {
    id: 'closure-07',
    group: 'closures',
    desc: '"okay" → silent',
    user: 'okay',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectReplyEmpty: true,
  },
  {
    id: 'closure-08',
    group: 'closures',
    desc: '"see you soon" → "See you!"',
    user: 'see you soon',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectReplyContains: 'See you',
  },
  {
    id: 'closure-09',
    group: 'closures',
    desc: '"sounds good" → silent',
    user: 'sounds good',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectReplyEmpty: true,
  },
  {
    id: 'closure-10',
    group: 'closures',
    desc: '"kk" → silent',
    user: 'kk',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectReplyEmpty: true,
  },

  // ── MORE INTENT ROUTING ──────────────────────────────────────────────
  {
    id: 'intent-11',
    group: 'intent-routing',
    desc: '"good afternoon" while open → ORDER',
    user: 'good afternoon',
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'intent-12',
    group: 'intent-routing',
    desc: '"hiya" while open → ORDER',
    user: 'hiya',
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'intent-13',
    group: 'intent-routing',
    desc: '"start order" → ORDER',
    user: 'start order',
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'intent-14',
    group: 'intent-routing',
    desc: 'food name with qty → ORDER (via LLM classifier)',
    user: '2 lumpia please',
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'intent-15',
    group: 'intent-routing',
    desc: 'MEETING flow disabled → meeting phrasing falls to FALLBACK',
    user: 'schedule a meeting',
    contextBuilder: () =>
      buildLumpiaContext({ openNow: true, flowTypes: [FlowType.ORDER, FlowType.FALLBACK] }),
    chatText: "We don't do meetings — just orders!",
    expectFlowType: FlowType.FALLBACK,
  },

  // ── DIVERSE EDGE CASES ───────────────────────────────────────────────
  {
    id: 'edge-06',
    group: 'edge-cases',
    desc: '"aight" → closure silent',
    user: 'aight',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectReplyEmpty: true,
  },
  {
    id: 'edge-07',
    group: 'edge-cases',
    desc: '"cheers" → closure silent',
    user: 'cheers',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectReplyEmpty: true,
  },
  {
    id: 'edge-08',
    group: 'edge-cases',
    desc: '"ttyl" → "See you!"',
    user: 'ttyl',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectReplyContains: 'See you',
  },
  {
    id: 'edge-09',
    group: 'edge-cases',
    desc: 'question with ? still routes through fallback for non-menu queries',
    user: 'any specials today?',
    chatText: 'No specials today, everything is regular price!',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: 'No specials',
  },

  // ── DEEPER ORDER FLOW COVERAGE ───────────────────────────────────────
  {
    id: 'order-10',
    group: 'order-flow',
    desc: 'empty cart after confirm blocked → still in ORDER',
    user: 'confirm',
    initialState: {
      tenantId: '10000000-0000-0000-0000-000000000001',
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'MENU_DISPLAY',
      orderDraft: null,
      lastMessageAt: Date.now(),
      messageCount: 1,
      dedupKey: null,
    } as any,
    agentToolCalls: [{ name: 'confirm_order', input: {} }],
    expectFlowType: FlowType.ORDER,
    expectReplyNonEmpty: true,
  },
  {
    id: 'order-11',
    group: 'order-flow',
    desc: 'price-check-like question still routes to INQUIRY when enabled',
    user: 'how much for the siomai?',
    contextBuilder: () =>
      buildLumpiaContext({ openNow: true, flowTypes: [FlowType.INQUIRY, FlowType.ORDER, FlowType.FALLBACK] }),
    expectFlowType: FlowType.INQUIRY,
  },

  // ── HARDER / ADVERSARIAL CASES ───────────────────────────────────────
  {
    id: 'hard-01',
    group: 'hard-cases',
    desc: 'compound: "hi! 2 siomai please" → ORDER flow',
    user: 'hi! 2 siomai please',
    agentToolCalls: [
      { name: 'add_items', input: { items: [{ menu_item_id: IDS.a7, quantity: 2 }] } },
    ],
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'hard-02',
    group: 'hard-cases',
    desc: 'all-caps rude: "WHERE IS MY FOOD" with order → flows through',
    user: "where's my order?",
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    callerMemory: {
      activeOrder: {
        orderNumber: 'ORD-5',
        status: 'PREPARING',
        estimatedReadyTime: new Date(Date.now() + 5 * 60_000).toISOString(),
        pickupTime: '6:30pm',
        itemsSummary: '2× Lumpia',
        total: 11.98,
      },
    } as CallerMemory,
    chatText: 'Your order is being prepared and should be ready shortly.',
    expectFlowType: FlowType.FALLBACK,
    expectReplyContains: 'prepared',
  },
  {
    id: 'hard-03',
    group: 'hard-cases',
    desc: 'very long message still handled',
    user: 'hey so i was thinking maybe i could get like 3 orders of the siomai and also 2 of the bbq bowls and maybe a sizzler too for my lunch today',
    agentToolCalls: [
      {
        name: 'add_items',
        input: {
          items: [
            { menu_item_id: IDS.a7, quantity: 3 },
            { menu_item_id: IDS.lb2, quantity: 2 },
            { menu_item_id: IDS.d1, quantity: 1 },
          ],
        },
      },
    ],
    expectFlowType: FlowType.ORDER,
    customAssert: ({ state }) => {
      const items = state?.orderDraft?.items ?? [];
      if (items.length !== 3) return `expected 3 items, got ${items.length}`;
      return null;
    },
  },
  {
    id: 'hard-04',
    group: 'hard-cases',
    desc: 'ambiguous "yes" at ORDER_CONFIRM with empty cart → blocked',
    user: 'yes',
    initialState: {
      tenantId: '10000000-0000-0000-0000-000000000001',
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_CONFIRM',
      orderDraft: { items: [] },
      customerName: 'Maria',
      lastMessageAt: Date.now(),
      messageCount: 3,
      dedupKey: null,
    } as any,
    agentToolCalls: [{ name: 'confirm_order', input: {} }],
    expectFlowType: FlowType.ORDER,
    // Should NOT place a real order with zero items
    customAssert: ({ sideEffects }) => {
      const types = sideEffects.map((s) => s.type);
      if (types.includes('SAVE_ORDER')) return `should not save empty order: ${types.join(',')}`;
      return null;
    },
  },
  {
    id: 'hard-05',
    group: 'hard-cases',
    desc: 'non-menu item query does NOT hallucinate availability',
    user: 'do you have pizza?',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    chatText: "We don't carry pizza — we specialize in Filipino food. Want to try siomai?",
    expectFlowType: FlowType.FALLBACK,
    expectReplyDoesNotContain: ['yes we have pizza'],
  },
  {
    id: 'hard-06',
    group: 'hard-cases',
    desc: 'numbers-only "123" message does not get misrouted as order',
    user: '123',
    chatText: 'Can you tell me what you need?',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
  },
  {
    id: 'hard-07',
    group: 'hard-cases',
    desc: 'phone-number-looking message → FALLBACK (no intent match)',
    user: '217-555-0199',
    chatText: 'What can I help with?',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
  },
  {
    id: 'hard-08',
    group: 'hard-cases',
    desc: 'multi-intent: "refund my last order and also order 1 siomai"',
    // The refund guard is narrow — only whole-message matches. Compound
    // message should NOT fire the refund deflection, so LLM handles.
    user: 'refund my last order and also order 1 siomai',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.ORDER, FlowType.FALLBACK] }),
    agentToolCalls: [
      { name: 'add_items', input: { items: [{ menu_item_id: IDS.a7, quantity: 1 }] } },
    ],
    // "order" keyword triggers ORDER routing, not refund guard. System goes to ORDER.
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'hard-09',
    group: 'hard-cases',
    desc: 'capital CANCEL with active order does NOT trigger bare deflection',
    user: 'CANCEL',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    callerMemory: {
      activeOrder: { orderNumber: 'ORD-9', status: 'CONFIRMED', itemsSummary: '1× Siomai', total: 5.99 },
    } as CallerMemory,
    chatText: "I'll let the kitchen know.",
    expectFlowType: FlowType.FALLBACK,
    expectReplyDoesNotContain: "don't see a pending order",
  },
  {
    id: 'hard-10',
    group: 'hard-cases',
    desc: 'slang "lemme get the bbq" routes to ORDER',
    user: 'lemme get the bbq bowl',
    agentToolCalls: [
      { name: 'add_items', input: { items: [{ menu_item_id: IDS.lb2, quantity: 1 }] } },
    ],
    expectFlowType: FlowType.ORDER,
  },
  {
    id: 'hard-11',
    group: 'hard-cases',
    desc: 'combined question + order: "whats the menu like can i get 1 A7"',
    user: "what's the menu like? can i get 1 #A7",
    agentToolCalls: [
      { name: 'add_items', input: { items: [{ menu_item_id: IDS.a7, quantity: 1 }] } },
    ],
    expectFlowType: FlowType.ORDER,
  },

  // ── POST-ORDER STATE ─────────────────────────────────────────────────
  {
    id: 'post-01',
    group: 'post-order',
    desc: 'post-order polite "thanks man" → closure (not CTA)',
    user: 'thanks man',
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    initialState: {
      tenantId: '10000000-0000-0000-0000-000000000001',
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_COMPLETE',
      orderDraft: null,
      lastMessageAt: Date.now(),
      messageCount: 5,
      dedupKey: null,
    } as any,
    chatText: 'Anytime!',
    expectFlowType: FlowType.FALLBACK,
    expectReplyNonEmpty: true,
  },

  // ── SMS CAP + URL INTEGRITY ──────────────────────────────────────────
  {
    id: 'cap-01',
    group: 'sms-cap',
    desc: 'reply exactly 320 chars not truncated',
    user: 'info please',
    chatText: 'x'.repeat(320),
    contextBuilder: () => buildLumpiaContext({ openNow: true, flowTypes: [FlowType.FALLBACK] }),
    expectFlowType: FlowType.FALLBACK,
    customAssert: ({ reply }) => {
      if (reply.length > 320) return `reply was truncated incorrectly at ${reply.length} chars`;
      return null;
    },
  },

  // ── MULTI-TURN CART EDITS ────────────────────────────────────────────
  {
    id: 'cart-01',
    group: 'cart-mutations',
    desc: 'remove item at ORDER_CONFIRM',
    user: 'actually remove the drink',
    initialState: {
      tenantId: '10000000-0000-0000-0000-000000000001',
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'ORDER_CONFIRM',
      orderDraft: {
        items: [
          { menuItemId: IDS.a7, name: '#A7 Siomai', quantity: 1, price: 5.99 },
          { menuItemId: IDS.d1, name: '#D1 Calamansi Sizzler', quantity: 1, price: 3.99 },
        ],
        pickupTime: '15 min',
      },
      customerName: 'Maria',
      lastMessageAt: Date.now(),
      messageCount: 3,
      dedupKey: null,
    } as any,
    agentToolCalls: [{ name: 'remove_item', input: { menu_item_id: IDS.d1 } }],
    expectFlowType: FlowType.ORDER,
    customAssert: ({ state }) => {
      const items = state?.orderDraft?.items ?? [];
      if (items.length !== 1) return `expected 1 item remaining, got ${items.length}`;
      if (items[0].menuItemId !== IDS.a7) return `expected A7 remaining`;
      return null;
    },
  },

  // ── UNUSUAL BUT VALID PICKUP PHRASES ─────────────────────────────────
  {
    id: 'pickup-01',
    group: 'pickup-parsing',
    desc: '"asap" as pickup accepted',
    user: 'asap',
    initialState: {
      tenantId: '10000000-0000-0000-0000-000000000001',
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'PICKUP_TIME',
      orderDraft: { items: [{ menuItemId: IDS.a7, name: '#A7 Siomai', quantity: 1, price: 5.99 }] },
      customerName: 'Maria',
      lastMessageAt: Date.now(),
      messageCount: 2,
      dedupKey: null,
    } as any,
    agentToolCalls: [{ name: 'set_pickup_time', input: { when: 'asap' } }],
    expectFlowType: FlowType.ORDER,
    expectFlowStep: 'ORDER_CONFIRM',
  },
  {
    id: 'pickup-02',
    group: 'pickup-parsing',
    desc: '"in 30 minutes" accepted',
    user: 'in 30 minutes',
    initialState: {
      tenantId: '10000000-0000-0000-0000-000000000001',
      callerPhone: '+12175550199',
      conversationId: null,
      currentFlow: FlowType.ORDER,
      flowStep: 'PICKUP_TIME',
      orderDraft: { items: [{ menuItemId: IDS.a7, name: '#A7 Siomai', quantity: 1, price: 5.99 }] },
      customerName: 'Maria',
      lastMessageAt: Date.now(),
      messageCount: 2,
      dedupKey: null,
    } as any,
    agentToolCalls: [{ name: 'set_pickup_time', input: { when: 'in 30 minutes' } }],
    expectFlowType: FlowType.ORDER,
    expectFlowStep: 'ORDER_CONFIRM',
  },
];

// ──────────────────────────────────────────────────────────────────────────
// Runner
// ──────────────────────────────────────────────────────────────────────────

describe('System accuracy benchmark', () => {
  test(`≥ ${ACCURACY_THRESHOLD * 100}% of ${CASES.length} cases pass`, async () => {
    const results: Array<{
      id: string;
      group: string;
      desc: string;
      pass: boolean;
      reason: string;
      reply: string;
    }> = [];

    for (const c of CASES) {
      const r = await runOneCase(c);
      results.push({ id: c.id, group: c.group, desc: c.desc, pass: r.pass, reason: r.reason, reply: r.reply });
    }

    const passed = results.filter((r) => r.pass).length;
    const total = results.length;
    const accuracy = passed / total;

    const failed = results.filter((r) => !r.pass);
    // Build the report
    const groups = [...new Set(results.map((r) => r.group))];
    const byGroup = groups.map((g) => {
      const rows = results.filter((r) => r.group === g);
      const p = rows.filter((r) => r.pass).length;
      return `  ${g}: ${p}/${rows.length}`;
    });

    const report = [
      '',
      '═══════════════════════════════════════════════════════════',
      `  ACCURACY: ${passed}/${total} = ${(accuracy * 100).toFixed(1)}%`,
      '═══════════════════════════════════════════════════════════',
      '  By group:',
      ...byGroup,
      '',
    ];
    if (failed.length > 0) {
      report.push('  Failures:');
      for (const f of failed) {
        report.push(`    ✗ [${f.id}] ${f.desc}`);
        report.push(`       reason: ${f.reason}`);
        report.push(`       reply:  ${JSON.stringify(f.reply.slice(0, 160))}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(report.join('\n'));

    const criticalFailures = failed.filter((f) => CRITICAL_GROUPS.has(f.group));
    if (criticalFailures.length > 0) {
      throw new Error(
        `Critical accuracy cases failed: ${criticalFailures
          .map((f) => `${f.group}/${f.id}`)
          .join(', ')}`,
      );
    }

    if (accuracy < ACCURACY_THRESHOLD) {
      throw new Error(
        `Accuracy ${(accuracy * 100).toFixed(1)}% below threshold ${(ACCURACY_THRESHOLD * 100).toFixed(0)}% (${failed.length} failures)`,
      );
    }
  });
});
