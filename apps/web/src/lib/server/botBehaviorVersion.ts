import { createHash } from 'crypto';

export interface BotBehaviorStamp {
  behaviorVersion: string;
  promptVersion: string;
  ruleVersion: string;
  tenantConfigHash: string | null;
}

export const BOT_BEHAVIOR_VERSION =
  process.env.BOT_BEHAVIOR_VERSION?.trim() || 'accuracy-v1';
export const BOT_PROMPT_VERSION =
  process.env.BOT_PROMPT_VERSION?.trim() || BOT_BEHAVIOR_VERSION;
export const BOT_RULE_VERSION =
  process.env.BOT_RULE_VERSION?.trim() || BOT_BEHAVIOR_VERSION;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    return stableValue((value as { toJSON: () => unknown }).toJSON());
  }

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = stableValue((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

export function stableHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex')
    .slice(0, 12);
}

export function getBotBehaviorStamp(input?: {
  tenantConfig?: unknown;
}): BotBehaviorStamp {
  return {
    behaviorVersion: BOT_BEHAVIOR_VERSION,
    promptVersion: BOT_PROMPT_VERSION,
    ruleVersion: BOT_RULE_VERSION,
    tenantConfigHash:
      input?.tenantConfig === undefined ? null : stableHash(input.tenantConfig),
  };
}

export function mergeBotBehaviorMetadata(
  metadata?: Record<string, unknown>,
  stamp: BotBehaviorStamp = getBotBehaviorStamp(),
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    botBehavior: metadata?.botBehavior ?? stamp,
  };
}
