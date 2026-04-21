import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { waitUntil } from '@vercel/functions';
import { logger } from '../logger';
import { prisma } from '../db';
import { markLlmCall } from '../turn/TurnContext';

const CLAUDE_MODEL =
  process.env.AI_PRIMARY_MODEL?.trim() || 'claude-sonnet-4-20250514';
const MINIMAX_MODEL = 'MiniMax-M2.7';
const TIMEOUT_MS = 8000;

/** Fire-and-forget AI usage logger. Never blocks the request path; writes
 *  a single row to `AiUsageLog` so we can bill tenants by real usage and
 *  debug cost spikes. Swallows all errors (logging must never cascade). */
function logAiUsage(row: {
  tenantId?: string;
  provider: 'claude' | 'minimax' | 'openai';
  model: string;
  purpose?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  success?: boolean;
  metadata?: Record<string, unknown>;
}): void {
  // No tenantId = system-level call (intent classifier on bare webhook). Skip.
  if (!row.tenantId) return;
  // waitUntil keeps the insert alive past the serverless response so a
  // 10-20ms DB write doesn't block customer latency AND isn't killed
  // when Vercel tears down the request context.
  waitUntil(
    prisma.aiUsageLog
      .create({
        data: {
          tenantId: row.tenantId,
          provider: row.provider,
          model: row.model,
          purpose: row.purpose ?? 'unknown',
          inputTokens: row.inputTokens ?? 0,
          outputTokens: row.outputTokens ?? 0,
          latencyMs: row.latencyMs,
          success: row.success ?? true,
          metadata: row.metadata ? (row.metadata as any) : undefined,
        },
      })
      .then(() => undefined)
      .catch((err) => {
        logger.warn('[ai] failed to write AiUsageLog', { err: err?.message });
      }),
  );
}

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
  /** Used only for usage logging/billing; optional. */
  tenantId?: string;
  /** Short label like "intent_classifier", "fallback_chat". */
  purpose?: string;
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
  const { systemPrompt, userMessage, maxTokens = 500, temperature = 0.7, tenantId, purpose } =
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
      const latencyMs = Date.now() - start;
      markLlmCall(latencyMs);
      logger.info('[ai] claude completion', {
        model: CLAUDE_MODEL,
        latencyMs,
        tokens: response.usage?.output_tokens,
      });
      logAiUsage({
        tenantId, provider: 'claude', model: CLAUDE_MODEL, purpose,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        latencyMs,
      });
      return text;
    } catch (err: any) {
      logger.warn('[ai] claude failed, falling back to minimax', {
        error: err?.message,
        status: err?.status,
      });
      logAiUsage({
        tenantId, provider: 'claude', model: CLAUDE_MODEL, purpose,
        success: false, metadata: { error: err?.message },
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
      const latencyMs = Date.now() - start;
      markLlmCall(latencyMs);
      logger.info('[ai] minimax completion', { model: MINIMAX_MODEL, latencyMs });
      logAiUsage({
        tenantId, provider: 'minimax', model: MINIMAX_MODEL, purpose,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        latencyMs,
      });
      return text;
    } catch (err: any) {
      logger.error('[ai] minimax also failed', { error: err?.message });
      logAiUsage({
        tenantId, provider: 'minimax', model: MINIMAX_MODEL, purpose,
        success: false, metadata: { error: err?.message },
      });
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

// ── Tool-use (AI agent) ───────────────────────────────────────────────────────

export interface ToolSchema {
  name: string;
  description: string;
  // Anthropic-format JSON Schema for the tool's input parameters.
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ChatWithToolsParams {
  systemPrompt: string;
  userMessage: string;
  messageHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools: ToolSchema[];
  maxTokens?: number;
  temperature?: number;
  /** Used only for usage logging/billing; optional. */
  tenantId?: string;
  /** Short label like "order_agent". */
  purpose?: string;
}

export interface ChatWithToolsResult {
  text: string;
  toolCalls: ToolCall[];
  stopReason: string | null;
  provider: 'claude' | 'minimax';
}

/**
 * Claude-first tool-use chat. Returns the assistant's text reply AND any
 * tool_use blocks it emitted, so the caller can execute validated handlers
 * against its own domain. Falls back to MiniMax (OpenAI-compatible) if Claude
 * fails entirely; the tool schemas are translated to OpenAI function format.
 */
export async function chatWithTools(
  params: ChatWithToolsParams,
): Promise<ChatWithToolsResult> {
  const {
    systemPrompt,
    userMessage,
    messageHistory = [],
    tools,
    maxTokens = 1024,
    temperature = 0.3,
    tenantId,
    purpose,
  } = params;

  // ── Claude ──
  const claude = getAnthropicClient();
  if (claude) {
    try {
      const start = Date.now();
      const messages: Anthropic.Messages.MessageParam[] = [
        ...messageHistory.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: 'user' as const, content: userMessage },
      ];
      const response = await claude.messages.create(
        {
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages,
          temperature,
          tools: tools as unknown as Anthropic.Messages.Tool[],
        },
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );

      let text = '';
      const toolCalls: ToolCall[] = [];
      for (const block of response.content) {
        if (block.type === 'text') {
          text += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: (block.input ?? {}) as Record<string, unknown>,
          });
        }
      }

      const latencyMs = Date.now() - start;
      markLlmCall(latencyMs);
      logger.info('[ai] claude tool-use', {
        model: CLAUDE_MODEL,
        latencyMs,
        tokens: response.usage?.output_tokens,
        toolCalls: toolCalls.length,
        stopReason: response.stop_reason,
      });
      logAiUsage({
        tenantId, provider: 'claude', model: CLAUDE_MODEL, purpose,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        latencyMs,
        metadata: { toolCalls: toolCalls.length },
      });

      return {
        text: text.trim(),
        toolCalls,
        stopReason: response.stop_reason,
        provider: 'claude',
      };
    } catch (err: any) {
      logger.warn('[ai] claude tool-use failed, falling back to minimax', {
        error: err?.message,
        status: err?.status,
      });
      logAiUsage({
        tenantId, provider: 'claude', model: CLAUDE_MODEL, purpose,
        success: false, metadata: { error: err?.message },
      });
    }
  }

  // ── MiniMax fallback (OpenAI-compatible function calling) ──
  const minimax = getMinimaxClient();
  if (minimax) {
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const openAiTools = tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }));

      const response = await minimax.chat.completions.create(
        {
          model: MINIMAX_MODEL,
          max_tokens: maxTokens,
          temperature,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messageHistory.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            { role: 'user', content: userMessage },
          ],
          tools: openAiTools,
        },
        { signal: controller.signal },
      );
      clearTimeout(timer);

      const choice = response.choices[0];
      const text = choice?.message?.content ?? '';
      const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? [])
        .filter((tc: any) => tc.type === 'function')
        .map((tc: any) => {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(tc.function.arguments || '{}');
          } catch {
            input = {};
          }
          return {
            id: tc.id,
            name: tc.function.name,
            input,
          };
        });

      const latencyMs = Date.now() - start;
      markLlmCall(latencyMs);
      logger.info('[ai] minimax tool-use', {
        model: MINIMAX_MODEL,
        latencyMs,
        toolCalls: toolCalls.length,
        stopReason: choice?.finish_reason ?? null,
      });
      logAiUsage({
        tenantId, provider: 'minimax', model: MINIMAX_MODEL, purpose,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
        latencyMs,
        metadata: { toolCalls: toolCalls.length },
      });

      return {
        text: text.trim(),
        toolCalls,
        stopReason: choice?.finish_reason ?? null,
        provider: 'minimax',
      };
    } catch (err: any) {
      logger.error('[ai] minimax tool-use also failed', {
        error: err?.message,
      });
      logAiUsage({
        tenantId, provider: 'minimax', model: MINIMAX_MODEL, purpose,
        success: false, metadata: { error: err?.message },
      });
      throw new Error(
        `AI tool-use unavailable: Claude failed, MiniMax failed (${err?.message})`,
      );
    }
  }

  if (!claude && !minimax) {
    throw new Error(
      'No AI provider configured (set ANTHROPIC_API_KEY or MINIMAX_API_KEY)',
    );
  }
  throw new Error('AI tool-use failed on all configured providers');
}
