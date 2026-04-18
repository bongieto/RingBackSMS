import { FlowInput, FlowOutput } from './types';
import { detectIntent } from './intentDetector';
import { processOrderFlow } from './flows/orderFlow';
import { processMeetingFlow } from './flows/meetingFlow';
import { processFallbackFlow } from './flows/fallbackFlow';
import { processInquiryFlow } from './flows/inquiryFlow';
import { runOrderAgent } from './ai/orderAgent';
import { FlowType } from '@ringback/shared-types';

function routeOrder(input: FlowInput): Promise<FlowOutput> {
  const cfg = input.tenantContext.config as { aiOrderAgentEnabled?: boolean };
  if (cfg.aiOrderAgentEnabled && input.chatWithToolsFn) {
    return runOrderAgent(input);
  }
  return processOrderFlow(input);
}

export async function runFlowEngine(input: FlowInput): Promise<FlowOutput> {
  const { currentState, tenantContext, inboundMessage } = input;

  // If in an active flow (not complete), continue it
  if (currentState?.currentFlow && currentState.flowStep !== 'ORDER_COMPLETE' && currentState.flowStep !== 'INQUIRY_COMPLETE') {
    // If orders got paused while the caller was mid-order, bail out
    // cleanly so we don't silently drop their in-progress order.
    if (
      currentState.currentFlow === FlowType.ORDER &&
      tenantContext.config.ordersAcceptingEnabled === false
    ) {
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

  // Detect intent from message
  const intentResult = await detectIntent(
    inboundMessage,
    tenantContext,
    input.chatFn,
  );

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
