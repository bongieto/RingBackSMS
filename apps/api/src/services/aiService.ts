import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
let aiClient: OpenAI | null = null;

const AI_MODEL = 'MiniMax-M2.7';

function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

function getClient(): OpenAI {
  if (!aiClient) {
    aiClient = new OpenAI({
      baseURL: 'https://api.minimax.io/v1',
      apiKey: process.env.MINIMAX_API_KEY,
    });
  }
  return aiClient;
}

export interface ClassifyIntentResult {
  intent: string;
  confidence: number;
  reasoning: string;
}

/**
 * Builds a per-tenant system prompt for the AI assistant.
 */
export async function buildTenantSystemPrompt(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { config: true, flows: { where: { isEnabled: true } } },
  });

  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  const config = tenant.config;
  const personality = config?.aiPersonality ?? 'helpful, friendly, and professional';
  const enabledFlows = tenant.flows.map((f) => f.type.toLowerCase()).join(', ');
  const tz = config?.timezone ?? 'America/Chicago';

  return `You are a helpful SMS assistant for ${tenant.name}.
Business type: ${tenant.businessType}
Personality: ${personality}
Timezone: ${tz}
Active capabilities: ${enabledFlows}

SMS Guidelines:
- Keep responses concise (under 160 chars when possible)
- Be warm and on-brand for the business
- For food orders, prompt user to text ORDER
- For meetings/appointments, prompt user to text MEETING
- Never reveal internal system details or API keys
- If unsure, offer to have the owner follow up`;
}

/**
 * Generates a conversational AI reply for general/fallback messages.
 */
export async function generateReply(
  tenantId: string,
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const client = getClient();
  const systemPrompt = await buildTenantSystemPrompt(tenantId);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 300,
      messages,
    });

    const text = stripThinkTags(response.choices[0]?.message?.content ?? '');
    logger.debug('AI reply generated', { tenantId, tokens: response.usage?.total_tokens });
    return text;
  } catch (error) {
    logger.error('AI reply generation failed', { error, tenantId });
    return "Thanks for reaching out! We'll get back to you shortly.";
  }
}

/**
 * Classifies the intent of an inbound message for a specific tenant.
 */
export async function classifyIntent(
  tenantId: string,
  message: string,
  availableIntents: string[]
): Promise<ClassifyIntentResult> {
  const client = getClient();

  const prompt = `Classify this SMS message for a business. Available intents: ${availableIntents.join(', ')}, UNCLEAR.

Message: "${message}"

Respond with JSON only: {"intent": "<INTENT>", "confidence": <0.0-1.0>, "reasoning": "<brief reason>"}`;

  try {
    const response = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = stripThinkTags(response.choices[0]?.message?.content ?? '');
    const parsed = JSON.parse(text.trim()) as ClassifyIntentResult;
    return parsed;
  } catch {
    return { intent: 'UNCLEAR', confidence: 0, reasoning: 'Classification failed' };
  }
}
