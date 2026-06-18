import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { waitUntil } from '@vercel/functions';
import { logger } from '../logger';
import { prisma } from '../db';
import { markLlmCall } from '../turn/TurnContext';
import { mergeBotBehaviorMetadata } from '../botBehaviorVersion';

// Primary "generation" model — writes customer replies and runs the order
// agent. Sonnet 4.6 is the cost/latency sweet spot for SMS (1M context, fast).
// NOTE: the old default `claude-sonnet-4-20250514` (Sonnet 4.0) retired
// 2026-06-15 and now 404s, silently dropping every reply to the MiniMax
// backup. Override per-deploy with AI_PRIMARY_MODEL.
const CLAUDE_MODEL =
  process.env.AI_PRIMARY_MODEL?.trim() || 'claude-sonnet-4-6';
// Classifier model — fast/cheap, for intent detection and other short
// classify calls. Haiku is ~3x cheaper than Sonnet and lower latency, and
// "what does this customer want?" doesn't need the strong model. Override
// with AI_CLASSIFIER_MODEL.
const CLASSIFIER_MODEL =
  process.env.AI_CLASSIFIER_MODEL?.trim() || 'claude-haiku-4-5';
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
  /** Override the Claude model for this call (e.g. a cheap classifier model).
   *  Defaults to CLAUDE_MODEL. Does not affect the MiniMax fallback. */
  model?: string;
  /** Used only for usage logging/billing; optional. */
  tenantId?: string;
  /** Short label like "intent_classifier", "fallback_chat". */
  purpose?: string;
  /** Extra structured metadata for AiUsageLog. */
  metadata?: Record<string, unknown>;
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
  const { systemPrompt, userMessage, maxTokens = 500, temperature = 0.7, model, tenantId, purpose, metadata } =
    params;
  const claudeModel = model || CLAUDE_MODEL;

  // Try Claude first
  const claude = getAnthropicClient();
  if (claude) {
    try {
      const start = Date.now();
      const response = await claude.messages.create(
        {
          model: claudeModel,
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
        model: claudeModel,
        latencyMs,
        tokens: response.usage?.output_tokens,
      });
      logAiUsage({
        tenantId, provider: 'claude', model: claudeModel, purpose,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        latencyMs,
        metadata: mergeBotBehaviorMetadata(metadata),
      });
      return text;
    } catch (err: any) {
      logger.warn('[ai] claude failed, falling back to minimax', {
        error: err?.message,
        status: err?.status,
      });
      logAiUsage({
        tenantId, provider: 'claude', model: claudeModel, purpose,
        success: false, metadata: mergeBotBehaviorMetadata({ ...metadata, error: err?.message }),
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
        metadata: mergeBotBehaviorMetadata(metadata),
      });
      return text;
    } catch (err: any) {
      logger.error('[ai] minimax also failed', { error: err?.message });
      logAiUsage({
        tenantId, provider: 'minimax', model: MINIMAX_MODEL, purpose,
        success: false, metadata: mergeBotBehaviorMetadata({ ...metadata, error: err?.message }),
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
    // Run classification on the cheap/fast model unless the caller pinned one.
    model: params.model ?? CLASSIFIER_MODEL,
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
  /** Optional. `auto` (default) lets the model decide; `{type:'tool',name}`
   *  forces a specific tool — used by chatClassifyStructured to guarantee
   *  a typed response. */
  toolChoice?:
    | { type: 'auto' }
    | { type: 'any' }
    | { type: 'tool'; name: string };
  /** Override the Claude model (e.g. the cheap classifier for structured
   *  classification). Defaults to CLAUDE_MODEL. */
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Used only for usage logging/billing; optional. */
  tenantId?: string;
  /** Short label like "order_agent". */
  purpose?: string;
  /** Extra structured metadata for AiUsageLog. */
  metadata?: Record<string, unknown>;
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
    toolChoice,
    model,
    maxTokens = 1024,
    temperature = 0.3,
    tenantId,
    purpose,
    metadata,
  } = params;
  const claudeModel = model || CLAUDE_MODEL;

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
          model: claudeModel,
          max_tokens: maxTokens,
          // Cache the system prompt (menu, hours, brand voice, worked
          // examples). Render order is tools -> system -> messages, so one
          // breakpoint on the system block caches the tool definitions too.
          // Cuts cost/latency on repeat turns; below the model's minimum
          // cacheable prefix it silently no-ops (no error).
          system: [
            {
              type: 'text',
              text: systemPrompt,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages,
          temperature,
          tools: tools as unknown as Anthropic.Messages.Tool[],
          ...(toolChoice
            ? { tool_choice: toolChoice as Anthropic.Messages.ToolChoice }
            : {}),
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
        model: claudeModel,
        latencyMs,
        tokens: response.usage?.output_tokens,
        toolCalls: toolCalls.length,
        stopReason: response.stop_reason,
      });
      logAiUsage({
        tenantId, provider: 'claude', model: claudeModel, purpose,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        latencyMs,
        metadata: mergeBotBehaviorMetadata({ ...metadata, toolCalls: toolCalls.length }),
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
        tenantId, provider: 'claude', model: claudeModel, purpose,
        success: false, metadata: mergeBotBehaviorMetadata({ ...metadata, error: err?.message }),
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

      // Translate Anthropic tool_choice to OpenAI/MiniMax shape:
      //   {type:'auto'} -> 'auto'
      //   {type:'any'}  -> 'required'
      //   {type:'tool', name} -> {type:'function', function:{name}}
      const openAiToolChoice = toolChoice
        ? toolChoice.type === 'tool'
          ? { type: 'function' as const, function: { name: toolChoice.name } }
          : toolChoice.type === 'any'
            ? ('required' as const)
            : ('auto' as const)
        : undefined;

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
          ...(openAiToolChoice ? { tool_choice: openAiToolChoice } : {}),
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
        metadata: mergeBotBehaviorMetadata({ ...metadata, toolCalls: toolCalls.length }),
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
        success: false, metadata: mergeBotBehaviorMetadata({ ...metadata, error: err?.message }),
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

// ── Structured classification ────────────────────────────────────────────────

export interface ChatClassifyStructuredParams {
  systemPrompt: string;
  userMessage: string;
  /** Name of the single tool the model is forced to call. */
  toolName: string;
  /** Description shown to the model — phrase it as the task. */
  toolDescription: string;
  /** Anthropic-format JSON Schema for the response shape. */
  schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  maxTokens?: number;
  /** Override the classifier model. Defaults to CLASSIFIER_MODEL. */
  model?: string;
  tenantId?: string;
  purpose?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Forced-tool-use structured output. The model MUST emit a single
 * tool_use block whose `input` matches the JSON schema — no JSON parsing,
 * no fence-stripping, no regex fallbacks. Returns null only when both
 * providers fail or neither emitted a tool call, so the caller can fall
 * through to its own tolerant parser as a safety net.
 *
 * Routes to the cheap classifier model by default; intent classification
 * is a short call that doesn't need the strong model.
 */
export async function chatClassifyStructured<T = Record<string, unknown>>(
  params: ChatClassifyStructuredParams,
): Promise<T | null> {
  const {
    systemPrompt,
    userMessage,
    toolName,
    toolDescription,
    schema,
    maxTokens = 200,
    model,
    tenantId,
    purpose,
    metadata,
  } = params;

  try {
    const result = await chatWithTools({
      systemPrompt,
      userMessage,
      tools: [{ name: toolName, description: toolDescription, input_schema: schema }],
      toolChoice: { type: 'tool', name: toolName },
      model: model ?? CLASSIFIER_MODEL,
      maxTokens,
      // Deterministic for classification.
      temperature: 0,
      tenantId,
      purpose: purpose ?? 'intent_classifier_structured',
      metadata,
    });
    const call = result.toolCalls.find((c) => c.name === toolName);
    if (!call) return null;
    return call.input as unknown as T;
  } catch (err: any) {
    logger.warn('[ai] chatClassifyStructured failed', { error: err?.message });
    return null;
  }
}
