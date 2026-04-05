import { FlowInput, FlowOutput } from './types';
import { detectIntent } from './intentDetector';
import { processOrderFlow } from './flows/orderFlow';
import { processMeetingFlow } from './flows/meetingFlow';
import { processFallbackFlow } from './flows/fallbackFlow';
import { FlowType } from '@ringback/shared-types';

export async function runFlowEngine(input: FlowInput): Promise<FlowOutput> {
  const { currentState, tenantContext, inboundMessage } = input;

  // If in an active flow (not complete), continue it
  if (currentState?.currentFlow && currentState.flowStep !== 'ORDER_COMPLETE') {
    switch (currentState.currentFlow) {
      case FlowType.ORDER:
        return processOrderFlow(input);
      case FlowType.MEETING:
        return processMeetingFlow(input);
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
    input.anthropicApiKey
  );

  const enabledFlowTypes = tenantContext.flows
    .filter((f) => f.isEnabled)
    .map((f) => f.type);

  // Route to appropriate flow
  if (intentResult.intent !== 'UNCLEAR' && enabledFlowTypes.includes(intentResult.intent)) {
    switch (intentResult.intent) {
      case FlowType.ORDER:
        return processOrderFlow({ ...input, currentState: null });
      case FlowType.MEETING:
        return processMeetingFlow({ ...input, currentState: null });
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
