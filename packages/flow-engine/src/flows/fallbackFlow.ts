import OpenAI from 'openai';
import { FlowInput, FlowOutput } from '../types';
import { FlowType } from '@ringback/shared-types';
import { CallerState } from '@ringback/shared-types';

const AI_MODEL = 'MiniMax-M2.7';

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

export async function processFallbackFlow(input: FlowInput): Promise<FlowOutput> {
  const { tenantContext, inboundMessage, currentState, aiApiKey } = input;

  const client = new OpenAI({
    baseURL: 'https://api.minimax.io/v1',
    apiKey: aiApiKey,
  });

  const personality = tenantContext.config.aiPersonality ?? 'helpful, friendly, and professional';
  const enabledFlows = tenantContext.flows
    .filter((f) => f.isEnabled && f.type !== FlowType.FALLBACK)
    .map((f) => f.type);

  const capabilities =
    enabledFlows.length > 0
      ? `You can help customers with: ${enabledFlows.map((f) => f.toLowerCase()).join(', ')}.`
      : '';

  const websiteContext = tenantContext.config.websiteContext
    ? `\nBusiness context from their website: ${tenantContext.config.websiteContext.substring(0, 1500)}`
    : '';

  const businessAddress = tenantContext.config.businessAddress
    ? `\nBusiness address: ${tenantContext.config.businessAddress}`
    : '';

  let catalogContext = '';
  if (tenantContext.menuItems.length > 0) {
    const itemLines = tenantContext.menuItems
      .filter((m) => m.isAvailable)
      .map((item) => {
        let line = `- ${item.name}: $${item.price.toFixed(2)}`;
        if (item.duration) line += ` (${item.duration} min)`;
        if (item.requiresBooking) line += ' [booking required]';
        return line;
      });
    catalogContext = `\nAvailable products/services:\n${itemLines.join('\n')}`;
  }

  const systemPrompt = `You are a helpful SMS assistant for ${tenantContext.tenantName}.
Be ${personality}. Keep responses under 160 characters when possible (SMS limit).
${capabilities}${businessAddress}${websiteContext}${catalogContext}
If asked about ordering food, direct them to reply ORDER.
If asked about scheduling, direct them to reply MEETING.
When asked about services or products, reference the available list above.
Never share internal business details. Be warm and helpful.`;

  const previousMessages: OpenAI.ChatCompletionMessageParam[] = [];

  try {
    const response = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 200,
      messages: [
        { role: 'system', content: systemPrompt },
        ...previousMessages,
        { role: 'user', content: inboundMessage },
      ],
    });

    const replyText = stripThinkTags(response.choices[0]?.message?.content ?? '')
      || "Thanks for reaching out! How can I help you today?";

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
