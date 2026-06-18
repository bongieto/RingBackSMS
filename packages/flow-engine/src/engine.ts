import { FlowInput, FlowOutput } from './types';
import { detectIntent } from './intentDetector';
import { processOrderFlow } from './flows/orderFlow';
import { processMeetingFlow } from './flows/meetingFlow';
import { findUngroundedGuard, processFallbackFlow } from './flows/fallbackFlow';
import { processInquiryFlow } from './flows/inquiryFlow';
import { runOrderAgent } from './ai/orderAgent';
import { FlowType } from '@ringback/shared-types';
import { pushDecision } from './decisions';
import { extractVerticalIntake } from './intake';

function routeOrder(input: FlowInput): Promise<FlowOutput> {
  // AI order agent is the default when a tool-use chat fn is wired.
  // Tenants can opt OUT via `aiOrderAgentEnabled: false` as a kill
  // switch — e.g. if the agent is misbehaving for a specific tenant's
  // menu shape — but the legacy regex flow is no longer the default.
  // Previous default (opt-in) left tenants on a flow that silently
  // dropped 3 of 4 items in comma-separated orders; the agent with
  // its deterministic safety nets handles multi-item reliably.
  const cfg = input.tenantContext.config as { aiOrderAgentEnabled?: boolean };
  const agentEnabled = cfg.aiOrderAgentEnabled !== false;
  if (agentEnabled && input.chatWithToolsFn) {
    return runOrderAgent(input);
  }
  return processOrderFlow(input);
}

function shouldReclassifyActiveFlow(input: FlowInput): boolean {
  const { currentState, tenantContext, inboundMessage } = input;
  if (!currentState?.currentFlow) return false;

  const enabled = new Set(
    tenantContext.flows.filter((f) => f.isEnabled).map((f) => f.type),
  );
  const msg = inboundMessage.trim();
  const upper = msg.toUpperCase();

  if (currentState.currentFlow !== FlowType.ORDER && enabled.has(FlowType.ORDER)) {
    if (
      upper === 'ORDER' ||
      upper === 'START ORDER' ||
      upper.includes('PLACE ORDER') ||
      upper.includes('I WANT TO ORDER') ||
      upper.includes('ORDER FOOD')
    ) {
      return true;
    }
  }

  if (currentState.currentFlow !== FlowType.MEETING && enabled.has(FlowType.MEETING)) {
    if (
      upper === 'MEETING' ||
      upper === 'APPOINTMENT' ||
      upper === 'SCHEDULE' ||
      /\b(schedule|appointment|book (?:a |an )?(?:meeting|appointment|call)|schedule (?:a |an )?(?:meeting|appointment|call))\b/i.test(msg)
    ) {
      return true;
    }
  }

  if (currentState.currentFlow !== FlowType.FALLBACK && enabled.has(FlowType.FALLBACK)) {
    if (
      /\?$/.test(msg) ||
      /^\s*(what|where|why|how|when|who|do you|does|did|is it|are you|can you|can i)\b/i.test(msg)
    ) {
      return true;
    }
  }

  return false;
}

function attachIntake(input: FlowInput, output: FlowOutput): FlowOutput {
  const intake = extractVerticalIntake({
    tenantContext: input.tenantContext,
    inboundMessage: input.inboundMessage,
    flowType: output.flowType,
  });
  return intake ? { ...output, intake } : output;
}

function shouldRunFreshUngroundedGuard(input: FlowInput): boolean {
  const draft = input.currentState?.orderDraft;
  return !draft || (draft.items.length === 0 && !draft.pickupTime);
}

async function runFlowEngineCore(input: FlowInput): Promise<FlowOutput> {
  const { currentState, tenantContext, inboundMessage } = input;

  // If in an active flow (not complete), continue it
  if (currentState?.currentFlow && currentState.flowStep !== 'ORDER_COMPLETE' && currentState.flowStep !== 'INQUIRY_COMPLETE') {
    if (shouldReclassifyActiveFlow(input)) {
      pushDecision(input, {
        handler: 'engine.topicSwitch',
        phase: 'PRE_HANDLER',
        outcome: 'reclassified',
        evidence: { previousFlow: currentState.currentFlow, step: currentState.flowStep },
        durationMs: 0,
      });
      return runFlowEngine({ ...input, currentState: null });
    }

    pushDecision(input, {
      handler: 'engine.continueFlow',
      phase: 'FLOW',
      outcome: 'continue',
      evidence: { flow: currentState.currentFlow, step: currentState.flowStep },
      durationMs: 0,
    });
    // If orders got paused while the caller was mid-order, bail out
    // cleanly so we don't silently drop their in-progress order.
    if (
      currentState.currentFlow === FlowType.ORDER &&
      tenantContext.config.ordersAcceptingEnabled === false
    ) {
      pushDecision(input, {
        handler: 'engine.ordersPaused',
        phase: 'FLOW',
        outcome: 'mid_order_paused',
        reason: 'ordersAcceptingEnabled=false while caller was mid-order',
        durationMs: 0,
      });
      return {
        nextState: {
          tenantId: tenantContext.tenantId,
          callerPhone: input.callerPhone,
          conversationId: currentState.conversationId ?? null,
          currentFlow: null,
          flowStep: null,
          orderDraft: null,
          lastMessageAt: Date.now(),
          messageCount: (currentState.messageCount ?? 0) + 1,
          dedupKey: null,
        },
        smsReply: `Sorry, ${tenantContext.tenantName} just paused new orders. Please try again in a bit!`,
        sideEffects: [],
        flowType: FlowType.FALLBACK,
      };
    }
    switch (currentState.currentFlow) {
      case FlowType.ORDER:
        return routeOrder(input);
      case FlowType.MEETING:
        return processMeetingFlow(input);
      case FlowType.INQUIRY:
        return processInquiryFlow(input);
      case FlowType.FALLBACK:
        // Don't persist fallback, re-detect intent each time
        break;
      default:
        break;
    }
  }

  // Guard stateful action requests before fresh intent routing. A new
  // message like "I need to cancel my food order" contains "order", so
  // classifiers tend to send it to ORDER where the legacy regex flow can
  // open a menu prompt. If there is no active state/memory to ground the
  // action, deflect first instead of starting a new flow.
  const guard = findUngroundedGuard(inboundMessage.trim(), input.callerMemory);
  if (guard && shouldRunFreshUngroundedGuard(input)) {
    pushDecision(input, {
      handler: 'engine.ungroundedGuard',
      phase: 'PRE_HANDLER',
      outcome: guard.outcome,
      reason: guard.reason,
      durationMs: 0,
    });
    const reply =
      typeof guard.reply === 'function'
        ? guard.reply({
            tenantName: tenantContext.tenantName,
            tenantPhone: tenantContext.tenantPhoneNumber ?? null,
          })
        : guard.reply;
    return {
      nextState: {
        tenantId: tenantContext.tenantId,
        callerPhone: input.callerPhone,
        conversationId: currentState?.conversationId ?? null,
        currentFlow: FlowType.FALLBACK,
        flowStep: 'FALLBACK',
        orderDraft: null,
        lastMessageAt: Date.now(),
        messageCount: (currentState?.messageCount ?? 0) + 1,
        dedupKey: null,
      },
      smsReply: reply,
      sideEffects: [],
      flowType: FlowType.FALLBACK,
    };
  }

  // Detect intent from message
  const intentT0 = Date.now();
  const intentResult = await detectIntent(
    inboundMessage,
    tenantContext,
    input.chatFn,
    input.recentMessages,
    input.chatStructuredFn,
  );
  pushDecision(input, {
    handler: 'detectIntent',
    phase: 'FLOW',
    outcome: intentResult.intent === 'UNCLEAR' ? 'unclear' : `intent_${intentResult.intent.toLowerCase()}`,
    evidence: { confidence: intentResult.confidence, reason: intentResult.reason },
    durationMs: Date.now() - intentT0,
  });

  const enabledFlowTypes = tenantContext.flows
    .filter((f) => f.isEnabled)
    .map((f) => f.type);

  // Confidence gate: low-confidence intents (not UNCLEAR, but unsure) route
  // to FALLBACK so the fallback flow can ask a clarifying question rather
  // than pushing the caller into the wrong flow. Only applies when we're
  // NOT already mid-flow (continuing-flow case skips detectIntent entirely).
  const CONFIDENCE_THRESHOLD = 0.75;
  if (
    intentResult.intent !== 'UNCLEAR' &&
    intentResult.confidence < CONFIDENCE_THRESHOLD &&
    enabledFlowTypes.includes(FlowType.FALLBACK)
  ) {
    pushDecision(input, {
      handler: 'engine.confidenceGate',
      phase: 'FLOW',
      outcome: 'routed_to_fallback',
      reason: `confidence ${intentResult.confidence} < ${CONFIDENCE_THRESHOLD}`,
      evidence: { intent: intentResult.intent, confidence: intentResult.confidence },
      durationMs: 0,
    });
    return processFallbackFlow(input);
  }

  // Route to appropriate flow
  if (intentResult.intent !== 'UNCLEAR' && enabledFlowTypes.includes(intentResult.intent)) {
    // Short-circuit: if the tenant has temporarily paused new orders,
    // tell the caller rather than starting the order flow.
    if (
      intentResult.intent === FlowType.ORDER &&
      tenantContext.config.ordersAcceptingEnabled === false
    ) {
      pushDecision(input, {
        handler: 'engine.ordersPaused',
        phase: 'FLOW',
        outcome: 'new_order_paused',
        reason: 'ordersAcceptingEnabled=false at intent-route time',
        durationMs: 0,
      });
      return {
        nextState: {
          tenantId: tenantContext.tenantId,
          callerPhone: input.callerPhone,
          conversationId: currentState?.conversationId ?? null,
          currentFlow: null,
          flowStep: null,
          orderDraft: null,
          lastMessageAt: Date.now(),
          messageCount: (currentState?.messageCount ?? 0) + 1,
          dedupKey: null,
        },
        smsReply: `Sorry, ${tenantContext.tenantName} is temporarily not accepting new orders right now. Please try again in a bit!`,
        sideEffects: [],
        flowType: FlowType.FALLBACK,
      };
    }
    switch (intentResult.intent) {
      case FlowType.ORDER:
        return routeOrder({ ...input, currentState: null });
      case FlowType.MEETING:
        return processMeetingFlow({ ...input, currentState: null });
      case FlowType.INQUIRY:
        return processInquiryFlow({ ...input, currentState: null });
      default:
        break;
    }
  }

  // Fallback
  if (enabledFlowTypes.includes(FlowType.FALLBACK)) {
    return processFallbackFlow(input);
  }

  // No fallback flow enabled — generic response
  return {
    nextState: {
      tenantId: tenantContext.tenantId,
      callerPhone: input.callerPhone,
      conversationId: currentState?.conversationId ?? null,
      currentFlow: null,
      flowStep: null,
      orderDraft: null,
      lastMessageAt: Date.now(),
      messageCount: (currentState?.messageCount ?? 0) + 1,
      dedupKey: null,
    },
    smsReply: `Thanks for reaching out to ${tenantContext.tenantName}! We'll be in touch soon.`,
    sideEffects: [],
    flowType: FlowType.FALLBACK,
  };
}

export async function runFlowEngine(input: FlowInput): Promise<FlowOutput> {
  return attachIntake(input, await runFlowEngineCore(input));
}
