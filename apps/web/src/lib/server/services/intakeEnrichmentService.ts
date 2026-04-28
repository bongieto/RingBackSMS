import {
  resolveIntakeFields,
  type IntakeField,
  type StructuredIntake,
  type StructuredIntakeField,
  type TenantContext,
} from '@ringback/flow-engine';
import { FlowType } from '@ringback/shared-types';
import { chatCompletion } from './aiClient';
import { logger } from '../logger';

function activeRequirements(flowType: FlowType): Array<'booking' | 'quote' | 'handoff'> {
  if (flowType === FlowType.MEETING) return ['booking'];
  if (flowType === FlowType.INQUIRY) return ['quote'];
  if (flowType === FlowType.FALLBACK) return ['handoff', 'quote'];
  return ['quote'];
}

function hasCustomIntakeOverrides(value: unknown, defaultFields: IntakeField[]): boolean {
  if (!Array.isArray(value)) return false;
  const defaultKeys = new Set(defaultFields.map((field) => field.key));
  return value.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const key = (entry as { key?: unknown }).key;
    if (typeof key !== 'string' || !key.trim()) return false;
    if (!defaultKeys.has(key)) return true;
    const label = (entry as { label?: unknown }).label;
    const examples = (entry as { examples?: unknown }).examples;
    return typeof label === 'string' || Array.isArray(examples);
  });
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeCaptured(
  value: unknown,
  fieldsByKey: Map<string, IntakeField>,
  alreadyCaptured: Set<string>,
): StructuredIntakeField[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { captured?: unknown }).captured)) {
    return [];
  }

  const captured: StructuredIntakeField[] = [];
  for (const item of (value as { captured: unknown[] }).captured) {
    if (!item || typeof item !== 'object') continue;
    const key = (item as { key?: unknown }).key;
    const raw = (item as { value?: unknown }).value;
    if (typeof key !== 'string' || !fieldsByKey.has(key) || alreadyCaptured.has(key)) continue;
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (!text || text.length > 120) continue;
    const field = fieldsByKey.get(key)!;
    captured.push({
      key,
      label: field.label,
      value: text,
      confidence: 'low',
      source: 'message',
    });
    alreadyCaptured.add(key);
  }
  return captured;
}

export async function enrichIntakeWithStructuredAi(input: {
  tenantContext: TenantContext;
  inboundMessage: string;
  flowType: FlowType;
  intake?: StructuredIntake;
}): Promise<StructuredIntake | undefined> {
  const config = input.tenantContext.config as {
    intakeFieldOverrides?: unknown;
    structuredIntakeAiEnabled?: boolean;
  };
  if (config.structuredIntakeAiEnabled === false) return input.intake;
  if (input.inboundMessage.trim().length < 8) return input.intake;

  const defaultFields = resolveIntakeFields({
    businessType: input.tenantContext.businessType,
    industryTemplateKey: input.tenantContext.industryTemplateKey,
    tenantName: input.tenantContext.tenantName,
    websiteContext: (input.tenantContext.config as { websiteContext?: string | null }).websiteContext,
  });
  if (!hasCustomIntakeOverrides(config.intakeFieldOverrides, defaultFields)) {
    return input.intake;
  }

  const configuredFields = resolveIntakeFields({
    businessType: input.tenantContext.businessType,
    industryTemplateKey: input.tenantContext.industryTemplateKey,
    tenantName: input.tenantContext.tenantName,
    websiteContext: (input.tenantContext.config as { websiteContext?: string | null }).websiteContext,
    intakeFieldOverrides: config.intakeFieldOverrides,
  });
  const requirements = activeRequirements(input.flowType);
  const relevantFields = configuredFields.filter((field) =>
    field.requiredFor.some((required) => requirements.includes(required)),
  );
  if (relevantFields.length === 0) return input.intake;

  const capturedKeys = new Set(input.intake?.captured.map((field) => field.key) ?? []);
  const fieldsForAi = relevantFields.filter((field) => !capturedKeys.has(field.key));
  if (fieldsForAi.length === 0) return input.intake;

  try {
    const response = await chatCompletion({
      tenantId: input.tenantContext.tenantId,
      purpose: 'structured_intake',
      temperature: 0,
      maxTokens: 300,
      systemPrompt:
        'Extract only intake values explicitly present in the customer SMS. Do not infer, guess, normalize beyond trimming, or add facts. Return strict JSON only: {"captured":[{"key":"field_key","value":"exact text"}]}. If none, return {"captured":[]}.',
      userMessage: JSON.stringify({
        business: input.tenantContext.tenantName,
        industry: input.tenantContext.industryTemplateKey ?? input.tenantContext.businessType ?? 'unknown',
        message: input.inboundMessage,
        fields: fieldsForAi.map((field) => ({
          key: field.key,
          label: field.label,
          examples: field.examples,
          requiredFor: field.requiredFor,
        })),
      }),
    });

    const parsed = extractJsonObject(response);
    const fieldsByKey = new Map(configuredFields.map((field) => [field.key, field]));
    const aiCaptured = normalizeCaptured(parsed, fieldsByKey, capturedKeys);
    if (aiCaptured.length === 0) return input.intake;

    const baseCaptured = input.intake?.captured ?? [];
    const nextCaptured = [...baseCaptured, ...aiCaptured];
    const nextKeys = new Set(nextCaptured.map((field) => field.key));
    const baseMissing = input.intake?.missing ?? relevantFields.map((field) => ({
      key: field.key,
      label: field.label,
      requiredFor: field.requiredFor,
    }));

    return {
      verticalKey: input.intake?.verticalKey ?? 'other',
      verticalLabel: input.intake?.verticalLabel ?? 'Lead',
      captured: nextCaptured,
      missing: baseMissing.filter((field) => !nextKeys.has(field.key)),
    };
  } catch (err) {
    logger.warn('Structured intake enrichment skipped', {
      err: (err as Error).message,
      tenantId: input.tenantContext.tenantId,
    });
    return input.intake;
  }
}
