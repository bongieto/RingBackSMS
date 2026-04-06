import OpenAI from 'openai';
import { TenantContext } from './types';
import { FlowType } from '@ringback/shared-types';

const AI_MODEL = 'MiniMax-M2.7';

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
  apiKey: string
): Promise<IntentResult> {
  const enabledFlowTypes = tenantContext.flows
    .filter((f) => f.isEnabled)
    .map((f) => f.type);

  // Fast keyword detection before calling AI
  const upperMsg = message.trim().toUpperCase();

  if (enabledFlowTypes.includes(FlowType.ORDER)) {
    if (
      upperMsg === 'ORDER' ||
      upperMsg.includes('ORDER FOOD') ||
      upperMsg.includes('PLACE ORDER') ||
      upperMsg.includes('BUY') ||
      upperMsg.includes('MENU')
    ) {
      return { intent: FlowType.ORDER, confidence: 1.0 };
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

  // Use MiniMax for ambiguous messages
  const client = new OpenAI({
    baseURL: 'https://api.minimax.io/v1',
    apiKey,
  });

  const flowDescriptions: Record<FlowType, string> = {
    [FlowType.ORDER]: 'placing a food or product order',
    [FlowType.MEETING]: 'scheduling a meeting, appointment, or call',
    [FlowType.CUSTOM]: 'a custom business workflow',
    [FlowType.FALLBACK]: 'general conversation or questions',
  };

  const availableFlows = enabledFlowTypes
    .map((ft) => `- ${ft}: ${flowDescriptions[ft]}`)
    .join('\n');

  const prompt = `You are an intent classifier for ${tenantContext.tenantName}, a ${tenantContext.config.timezone} business.

The customer sent this SMS: "${message}"

Available flows:
${availableFlows}

Classify the customer's intent. Respond with JSON only:
{"intent": "<FLOW_TYPE or UNCLEAR>", "confidence": <0.0-1.0>}`;

  try {
    const response = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = stripThinkTags(response.choices[0]?.message?.content ?? '');
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
