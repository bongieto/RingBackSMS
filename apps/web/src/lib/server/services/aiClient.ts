import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { logger } from '../logger';

const CLAUDE_MODEL =
  process.env.AI_PRIMARY_MODEL?.trim() || 'claude-sonnet-4-20250514';
const MINIMAX_MODEL = 'MiniMax-M2.7';
const TIMEOUT_MS = 8000;

let anthropicClient: Anthropic | null = null;
let minimaxClient: OpenAI | null = null;

function getAnthropicClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: key });
  }
  return anthropicClient;
}

function getMinimaxClient(): OpenAI | null {
  const key = process.env.MINIMAX_API_KEY?.trim();
  if (!key) return null;
  if (!minimaxClient) {
    minimaxClient = new OpenAI({
      baseURL: 'https://api.minimax.io/v1',
      apiKey: key,
    });
  }
  return minimaxClient;
}

export interface ChatCompletionParams {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Unified AI chat completion with automatic fallback.
 *
 * Priority:
 * 1. Claude (Anthropic) if ANTHROPIC_API_KEY is set
 * 2. MiniMax if MINIMAX_API_KEY is set (fallback)
 * 3. Throws if both fail or are unconfigured
 *
 * All calls have an 8-second timeout via AbortController.
 */
export async function chatCompletion(
  params: ChatCompletionParams,
): Promise<string> {
  const { systemPrompt, userMessage, maxTokens = 500, temperature = 0.7 } =
    params;

  // Try Claude first
  const claude = getAnthropicClient();
  if (claude) {
    try {
      const start = Date.now();
      const response = await claude.messages.create(
        {
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
          temperature,
        },
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      const text =
        response.content[0]?.type === 'text'
          ? response.content[0].text
          : '';
      logger.info('[ai] claude completion', {
        model: CLAUDE_MODEL,
        latencyMs: Date.now() - start,
        tokens: response.usage?.output_tokens,
      });
      return text;
    } catch (err: any) {
      logger.warn('[ai] claude failed, falling back to minimax', {
        error: err?.message,
        status: err?.status,
      });
      // Fall through to MiniMax
    }
  }

  // Fallback: MiniMax
  const minimax = getMinimaxClient();
  if (minimax) {
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await minimax.chat.completions.create(
        {
          model: MINIMAX_MODEL,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature,
        },
        { signal: controller.signal },
      );
      clearTimeout(timer);
      const text = response.choices[0]?.message?.content ?? '';
      logger.info('[ai] minimax completion', {
        model: MINIMAX_MODEL,
        latencyMs: Date.now() - start,
      });
      return text;
    } catch (err: any) {
      logger.error('[ai] minimax also failed', { error: err?.message });
      throw new Error(
        `AI unavailable: Claude failed, MiniMax failed (${err?.message})`,
      );
    }
  }

  // Neither configured
  if (!claude && !minimax) {
    throw new Error(
      'No AI provider configured (set ANTHROPIC_API_KEY or MINIMAX_API_KEY)',
    );
  }

  throw new Error('AI call failed on all configured providers');
}

/**
 * Convenience for simple classification / short replies where we want
 * lower temperature and fewer tokens.
 */
export async function chatClassify(
  params: ChatCompletionParams,
): Promise<string> {
  return chatCompletion({
    ...params,
    temperature: 0.1,
    maxTokens: params.maxTokens ?? 100,
  });
}
