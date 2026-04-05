import Anthropic from '@anthropic-ai/sdk';
import { TenantContext } from './types';
import { FlowType } from '@ringback/shared-types';

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

  // Use Claude for ambiguous messages
  const client = new Anthropic({ apiKey });

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
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
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
