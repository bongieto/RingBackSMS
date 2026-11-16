/**
 * Replay harness — runs one RealTrafficCase through the current
 * flow engine and captures what it produced.
 *
 * LLM stubbing strategy: we have two replay modes.
 *
 *  - `strict`  — the chatFn returns the original recorded reply (when
 *                it looks like a fallback-chat reply), so we measure
 *                only what the POST-LLM machinery does (guards, fact
 *                verifier, decision tagging, side-effect plumbing).
 *                This isolates the new code path from LLM variance.
 *
 *  - `mock`    — the chatFn returns canned shapes (JSON intent verdicts,
 *                bland fallback acks). Same heuristic as the in-repo
 *                scenario harness. Use this when you don't have a
 *                recorded reply, or when you want to test engine
 *                behavior without coupling to the original reply.
 *
 * The order agent's tool-use stub returns an empty toolCalls list. Real
 * order-flow accuracy will need a richer stub (recorded tool calls in
 * the case) — that's a P5 v2 follow-up. Today the harness is sound for
 * intent routing, FALLBACK behavior, and guard firing — the new
 * accuracy-relevant code paths.
 */
import { runFlowEngine } from '../engine';
import { FlowType } from '@ringback/shared-types';
import type { CallerState, DecisionDraft } from '@ringback/shared-types';
import type {
  ChatFn,
  ChatWithToolsFn,
  FlowInput,
  TenantContext,
} from '../types';
import type { RealTrafficCase, ReplayResult } from './types';

export type ReplayMode = 'strict' | 'mock';

export interface ReplayOptions {
  mode?: ReplayMode;
}

/** Heuristic — does this chatFn invocation look like an intent
 *  classifier prompt (vs the fallback-flow reply prompt)? Mirrors the
 *  detection used in the existing scenario harness. */
function isIntentClassifierCall(systemPrompt: string, userMessage: string): boolean {
  return (
    /intent classifier/i.test(systemPrompt) ||
    /Classify the customer's intent|Respond with JSON/i.test(userMessage)
  );
}

/** Best-effort canned intent verdict — same pattern as the synthetic
 *  benchmark. Lets the engine route intent without burning an LLM call. */
function cannedIntentVerdict(userMessage: string): string {
  const embedded = userMessage.match(/customer sent this SMS:\s*"([^"]*)"/i);
  const customerText = embedded ? embedded[1] : userMessage;
  const looksLikeOrder =
    /(order|buy|menu|lumpia|siomai|sizzler|bbq)/i.test(customerText) ||
    /#[A-Za-z]?\d+/.test(customerText) ||
    /^\s*\d+\s+/.test(customerText);
  const looksLikeMeeting =
    /(schedule|appointment|meeting|book\s|consultation)/i.test(customerText);
  const looksLikeInquiry =
    /(do you have|got any|in stock|available|looking for|how much|price of|have any)/i.test(
      customerText,
    );
  if (looksLikeOrder) return '{"intent":"ORDER","confidence":0.9}';
  if (looksLikeMeeting) return '{"intent":"MEETING","confidence":0.9}';
  if (looksLikeInquiry) return '{"intent":"INQUIRY","confidence":0.9}';
  return '{"intent":"FALLBACK","confidence":0.8}';
}

/** Build a TenantContext that's just rich enough to run the engine.
 *  Missing fields get production-safe defaults; unknown keys on the
 *  config object pass through unchanged so the engine can read them. */
export function buildTenantContextFromCase(c: RealTrafficCase): TenantContext {
  const cfg = (c.tenantConfigSnapshot ?? {}) as Record<string, unknown>;
  const enabled =
    c.enabledFlowTypes && c.enabledFlowTypes.length > 0
      ? c.enabledFlowTypes
      : ([FlowType.ORDER, FlowType.FALLBACK] as FlowType[]);

  return {
    tenantId: c.tenantId,
    tenantName: c.tenantName,
    businessType: (cfg.businessType as string | undefined) ?? null,
    industryTemplateKey: (cfg.industryTemplateKey as string | undefined) ?? null,
    tenantSlug: (cfg.tenantSlug as string | undefined) ?? null,
    tenantPhoneNumber: (cfg.tenantPhoneNumber as string | undefined) ?? null,
    config: {
      timezone: 'America/Chicago',
      ordersAcceptingEnabled: true,
      ...cfg,
    } as TenantContext['config'],
    flows: enabled.map(
      (type) =>
        ({
          id: `flow-${type}`,
          tenantId: c.tenantId,
          type,
          isEnabled: true,
          config: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        }) as unknown as TenantContext['flows'][number],
    ),
    menuItems: (c.menuItemsSnapshot ?? []) as TenantContext['menuItems'],
    hoursInfo: c.hoursInfoSnapshot
      ? ({
          openNow: c.hoursInfoSnapshot.openNow,
          nextOpenDisplay: c.hoursInfoSnapshot.nextOpenDisplay ?? null,
          todayHoursDisplay: c.hoursInfoSnapshot.todayHoursDisplay ?? '',
          weeklyHoursDisplay: c.hoursInfoSnapshot.weeklyHoursDisplay ?? '',
          minutesUntilClose: c.hoursInfoSnapshot.minutesUntilClose ?? null,
          closesAtDisplay: c.hoursInfoSnapshot.closesAtDisplay ?? null,
          closingSoon: c.hoursInfoSnapshot.closingSoon ?? false,
        } as TenantContext['hoursInfo'])
      : undefined,
  };
}

/** Replay a single case through the current engine. Never throws —
 *  errors land in ReplayResult.error so the report can show them
 *  alongside passing cases. */
export async function replayCase(
  c: RealTrafficCase,
  options: ReplayOptions = {},
): Promise<ReplayResult> {
  const mode: ReplayMode = options.mode ?? 'strict';
  const decisionsSink: DecisionDraft[] = [];

  try {
    const chatFn: ChatFn = async ({ systemPrompt, userMessage }) => {
      if (isIntentClassifierCall(systemPrompt, userMessage)) {
        return cannedIntentVerdict(userMessage);
      }
      // Fallback-chat reply. In strict mode replay the recorded reply
      // so the post-LLM machinery sees the same text the original ran
      // through. In mock mode return a bland ack.
      return mode === 'strict' ? c.originalReply : 'OK!';
    };

    const chatWithToolsFn: ChatWithToolsFn = async () => ({
      text: '',
      toolCalls: [],
      stopReason: 'end_turn',
      provider: 'claude' as const,
    });

    const input: FlowInput = {
      tenantContext: buildTenantContextFromCase(c),
      callerPhone: c.callerPhone,
      inboundMessage: c.inboundMessage,
      currentState: null as CallerState | null,
      chatFn,
      chatWithToolsFn,
      recentMessages: c.recentMessages,
      callerMemory: c.callerMemorySnapshot,
      decisions: decisionsSink,
    };

    const result = await runFlowEngine(input);
    return {
      caseId: c.id,
      ok: true,
      current: {
        reply: result.smsReply ?? '',
        flowType: result.flowType,
        flowStep: result.nextState?.flowStep ?? null,
        sideEffectTypes: result.sideEffects.map((s) => s.type),
        decisions: decisionsSink.map((d) => ({
          handler: d.handler,
          outcome: d.outcome,
        })),
      },
    };
  } catch (err) {
    return {
      caseId: c.id,
      ok: false,
      error: (err as Error).message,
    };
  }
}
