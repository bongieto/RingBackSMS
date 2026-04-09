import { TenantContext, ChatFn } from './types';
import { FlowType } from '@ringback/shared-types';

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

const ESCALATION_KEYWORDS = [
  'talk to a human',
  'talk to a person',
  'talk to someone',
  'speak to a human',
  'speak to a person',
  'speak to someone',
  'real person',
  'real human',
  'live agent',
  'live person',
  'representative',
  'operator',
  'agent',
  'stop bot',
  'stop ai',
  'human please',
  'get me a human',
  'i need a human',
  'i want a human',
  'let me talk to',
  'customer service',
  'manager',
];

export function detectEscalationIntent(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return ESCALATION_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export interface IntentResult {
  intent: FlowType | 'UNCLEAR';
  confidence: number;
}

export async function detectIntent(
  message: string,
  tenantContext: TenantContext,
  chatFn: ChatFn,
): Promise<IntentResult> {
  const enabledFlowTypes = tenantContext.flows
    .filter((f) => f.isEnabled)
    .map((f) => f.type);

  // Fast keyword detection before calling AI
  const upperMsg = message.trim().toUpperCase();

  if (enabledFlowTypes.includes(FlowType.ORDER)) {
    if (
      upperMsg === 'ORDER' ||
      upperMsg === 'ORDERING' ||
      upperMsg === 'START ORDER' ||
      upperMsg.includes('ORDER FOOD') ||
      upperMsg.includes('PLACE ORDER') ||
      upperMsg.includes('START ORDER') ||
      upperMsg.includes('I WANT TO ORDER') ||
      upperMsg.includes('BUY') ||
      upperMsg.includes('MENU')
    ) {
      return { intent: FlowType.ORDER, confidence: 1.0 };
    }
  }

  if (enabledFlowTypes.includes(FlowType.INQUIRY)) {
    const lower = message.toLowerCase();
    if (
      /\b(do you have|got any|in stock|available|looking for|how much|price of|have any)\b/.test(lower)
    ) {
      return { intent: FlowType.INQUIRY, confidence: 0.9 };
    }
  }

  if (enabledFlowTypes.includes(FlowType.MEETING)) {
    if (
      upperMsg === 'MEETING' ||
      upperMsg.includes('SCHEDULE') ||
      upperMsg.includes('APPOINTMENT') ||
      upperMsg.includes('BOOK') ||
      upperMsg.includes('CALL')
    ) {
      return { intent: FlowType.MEETING, confidence: 1.0 };
    }
  }

  // Use AI for ambiguous messages
  const flowDescriptions: Record<FlowType, string> = {
    [FlowType.ORDER]: 'placing a food or product order',
    [FlowType.MEETING]: 'scheduling a meeting, appointment, or call',
    [FlowType.INQUIRY]: 'asking about a product — availability, price, or if the shop carries it',
    [FlowType.CUSTOM]: 'a custom business workflow',
    [FlowType.FALLBACK]: 'general conversation or questions',
  };

  const availableFlows = enabledFlowTypes
    .map((ft) => `- ${ft}: ${flowDescriptions[ft]}`)
    .join('\n');

  const prompt = `The customer sent this SMS: "${message}"

Available flows:
${availableFlows}

Classify the customer's intent. Respond with JSON only:
{"intent": "<FLOW_TYPE or UNCLEAR>", "confidence": <0.0-1.0>}`;

  try {
    const raw = await chatFn({
      systemPrompt: `You are an intent classifier for ${tenantContext.tenantName}.`,
      userMessage: prompt,
      maxTokens: 100,
      temperature: 0.1,
    });

    const text = stripThinkTags(raw);
    const parsed = JSON.parse(text.trim()) as { intent: string; confidence: number };

    const intent =
      parsed.intent === 'UNCLEAR'
        ? 'UNCLEAR'
        : (parsed.intent as FlowType);

    return { intent, confidence: parsed.confidence };
  } catch {
    return { intent: 'UNCLEAR', confidence: 0 };
  }
}
