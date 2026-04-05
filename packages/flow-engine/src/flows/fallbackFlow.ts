import Anthropic from '@anthropic-ai/sdk';
import { FlowInput, FlowOutput } from '../types';
import { FlowType } from '@ringback/shared-types';
import { CallerState } from '@ringback/shared-types';

export async function processFallbackFlow(input: FlowInput): Promise<FlowOutput> {
  const { tenantContext, inboundMessage, currentState, anthropicApiKey } = input;

  const client = new Anthropic({ apiKey: anthropicApiKey });

  const personality = tenantContext.config.aiPersonality ?? 'helpful, friendly, and professional';
  const enabledFlows = tenantContext.flows
    .filter((f) => f.isEnabled && f.type !== FlowType.FALLBACK)
    .map((f) => f.type);

  const capabilities =
    enabledFlows.length > 0
      ? `You can help customers with: ${enabledFlows.map((f) => f.toLowerCase()).join(', ')}.`
      : '';

  const systemPrompt = `You are a helpful SMS assistant for ${tenantContext.tenantName}.
Be ${personality}. Keep responses under 160 characters when possible (SMS limit).
${capabilities}
If asked about ordering food, direct them to reply ORDER.
If asked about scheduling, direct them to reply MEETING.
Never share internal business details. Be warm and helpful.`;

  const previousMessages = currentState
    ? []
    : [];

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: systemPrompt,
      messages: [
        ...previousMessages,
        { role: 'user', content: inboundMessage },
      ],
    });

    const replyText =
      response.content[0].type === 'text'
        ? response.content[0].text
        : "Thanks for reaching out! How can I help you today?";

    const nextState: CallerState = {
      tenantId: tenantContext.tenantId,
      callerPhone: input.callerPhone,
      conversationId: currentState?.conversationId ?? null,
      currentFlow: FlowType.FALLBACK,
      flowStep: 'FALLBACK',
      orderDraft: null,
      lastMessageAt: Date.now(),
      messageCount: (currentState?.messageCount ?? 0) + 1,
      dedupKey: null,
    };

    return {
      nextState,
      smsReply: replyText,
      sideEffects: [],
      flowType: FlowType.FALLBACK,
    };
  } catch {
    const nextState: CallerState = {
      tenantId: tenantContext.tenantId,
      callerPhone: input.callerPhone,
      conversationId: currentState?.conversationId ?? null,
      currentFlow: FlowType.FALLBACK,
      flowStep: 'FALLBACK',
      orderDraft: null,
      lastMessageAt: Date.now(),
      messageCount: (currentState?.messageCount ?? 0) + 1,
      dedupKey: null,
    };

    return {
      nextState,
      smsReply: `Thanks for reaching out to ${tenantContext.tenantName}! We'll get back to you shortly.`,
      sideEffects: [],
      flowType: FlowType.FALLBACK,
    };
  }
}
