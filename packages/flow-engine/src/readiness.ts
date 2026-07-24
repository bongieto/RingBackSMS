import { FlowType, type CallerState } from '@ringback/shared-types';
import { runFlowEngine } from './engine';
import type { ChatFn, TenantContext } from './types';
import {
  getVerticalProfile,
  getVerticalProfileWithOverrides,
  matchEscalationPolicy,
  matchSafetyPolicy,
  resolveEscalationPolicies,
  type ReadinessScenarioCategory,
  type ReadinessScenarioSeed,
} from './verticals';

export interface ReadinessScenarioResult {
  id: string;
  label: string;
  category: ReadinessScenarioCategory;
  message: string;
  passed: boolean;
  failures: string[];
  suggestedFixes: string[];
  reply: string;
  flowType: FlowType;
  flowStep: string | null;
  expected: ReadinessScenarioSeed['expect'];
}

export interface ReadinessSuiteResult {
  verticalKey: string;
  verticalLabel: string;
  score: number;
  passed: number;
  total: number;
  results: ReadinessScenarioResult[];
  recommendedIntegrations: string[];
  valueMetrics: string[];
  intakeFields: Array<{ key: string; label: string; examples: string[]; requiredFor: string[] }>;
  defaultIntakeFields: Array<{ key: string; label: string; examples: string[]; requiredFor: string[] }>;
  categoryBreakdown: Array<{
    category: ReadinessScenarioCategory;
    passed: number;
    total: number;
    score: number;
  }>;
  escalationPolicies: Array<{
    id: string;
    label: string;
    severity: string;
    keywords: string[];
    customerReply: string;
    ownerSubject: string;
    ownerMessage?: string;
    taskTitle?: string;
    taskPriority?: string;
    stopAutomation: boolean;
    source: string;
  }>;
}

function localReadinessChat(message: string): string {
  const smsMatch = message.match(/customer sent this SMS:\s*"([^"]*)"/i);
  const lower = (smsMatch?.[1] ?? message).toLowerCase();
  const intent =
    /\b(order|menu|buy|place order|i want)\b/.test(lower)
      ? FlowType.ORDER
      : /\b(schedule|appointment|meeting|book|consultation|come out|service|repair|not cooling|not heating|caregiver|haircut|brake|brakes)\b/.test(lower)
        ? FlowType.MEETING
        : /\b(do you have|in stock|available|how much|price|cost|estimate|quote|services do you)\b/.test(lower)
          ? FlowType.FALLBACK
          : 'UNCLEAR';
  const confidence = intent === 'UNCLEAR' ? 0 : 0.9;
  return JSON.stringify({ intent, confidence });
}

function defaultChatFn(): ChatFn {
  return async ({ systemPrompt, userMessage }) => {
    const isClassifier =
      /intent classifier/i.test(systemPrompt) ||
      /Classify the customer's intent|Available flows/i.test(userMessage);
    if (isClassifier) return localReadinessChat(userMessage);
    if (/strict JSON only with exactly these keys/i.test(systemPrompt)) {
      const fact = systemPrompt.match(/^\[([^\]]+)\]\s+[^:]+:\s+(.+)$/m);
      if (fact) {
        return JSON.stringify({
          answer: fact[2].slice(0, 320),
          supportedFactIds: [fact[1]],
          confidence: 1,
          needsHuman: false,
        });
      }
    }
    return "Thanks for reaching out. I'll help with that and can connect you with a team member if needed.";
  };
}

function buildSafetyState(
  tenantContext: TenantContext,
  callerPhone: string,
): CallerState {
  return {
    tenantId: tenantContext.tenantId,
    callerPhone,
    conversationId: null,
    currentFlow: FlowType.FALLBACK,
    flowStep: 'FALLBACK',
    orderDraft: null,
    lastMessageAt: Date.now(),
    messageCount: 1,
    dedupKey: null,
  };
}

function evaluateScenario(
  scenario: ReadinessScenarioSeed,
  actual: { reply: string; flowType: FlowType; flowStep: string | null },
): string[] {
  const failures: string[] = [];
  if (scenario.expect.flowType && actual.flowType !== scenario.expect.flowType) {
    failures.push(`Expected flow ${scenario.expect.flowType}, got ${actual.flowType}`);
  }
  if (scenario.expect.flowStep && actual.flowStep !== scenario.expect.flowStep) {
    failures.push(`Expected step ${scenario.expect.flowStep}, got ${actual.flowStep ?? 'null'}`);
  }
  for (const needle of scenario.expect.replyIncludes ?? []) {
    if (!actual.reply.toLowerCase().includes(needle.toLowerCase())) {
      failures.push(`Expected reply to include "${needle}"`);
    }
  }
  for (const needle of scenario.expect.replyExcludes ?? []) {
    if (actual.reply.toLowerCase().includes(needle.toLowerCase())) {
      failures.push(`Expected reply to exclude "${needle}"`);
    }
  }
  return failures;
}

function suggestFixes(
  scenario: ReadinessScenarioSeed,
  failures: string[],
): string[] {
  const fixes = new Set<string>();
  for (const failure of failures) {
    if (/Expected flow/i.test(failure)) {
      fixes.add('Check enabled tenant flows and intent routing for this vertical.');
    }
    if (/Expected step/i.test(failure)) {
      fixes.add('Review the target flow state machine and the scenario starting state.');
    }
    if (/include/i.test(failure) && scenario.expect.replyIncludes?.some((s) => /911|emergency/i.test(s))) {
      fixes.add('Update the vertical safety policy response so emergency disclaimers are explicit.');
    } else if (/include/i.test(failure)) {
      fixes.add('Add missing business/policy wording to the vertical prompt or tenant configuration.');
    }
    if (/exclude/i.test(failure)) {
      fixes.add('Tighten the prompt or deterministic guard to avoid unsafe or irrelevant wording.');
    }
  }
  return [...fixes];
}

const CATEGORY_ORDER: ReadinessScenarioCategory[] = [
  'happy_path',
  'after_hours',
  'emergency',
  'handoff',
  'pricing',
  'booking',
  'cancellation',
  'vague',
  'impossible',
];

function buildCategoryBreakdown(results: ReadinessScenarioResult[]): ReadinessSuiteResult['categoryBreakdown'] {
  return CATEGORY_ORDER.flatMap((category) => {
    const categoryResults = results.filter((result) => result.category === category);
    if (categoryResults.length === 0) return [];
    const passed = categoryResults.filter((result) => result.passed).length;
    const total = categoryResults.length;
    return [{
      category,
      passed,
      total,
      score: total === 0 ? 1 : passed / total,
    }];
  });
}

export async function runVerticalReadinessSuite(input: {
  tenantContext: TenantContext;
  scenarios?: ReadinessScenarioSeed[];
  chatFn?: ChatFn;
  callerPhoneBase?: string;
}): Promise<ReadinessSuiteResult> {
  const defaultProfile = getVerticalProfile({
    businessType: input.tenantContext.businessType,
    industryTemplateKey:
      input.tenantContext.industryTemplateKey ??
      (input.tenantContext.config as { industryTemplateKey?: string | null }).industryTemplateKey,
    tenantName: input.tenantContext.tenantName,
    websiteContext: input.tenantContext.config.websiteContext,
  });
  const profile = getVerticalProfileWithOverrides({
    businessType: input.tenantContext.businessType,
    industryTemplateKey:
      input.tenantContext.industryTemplateKey ??
      (input.tenantContext.config as { industryTemplateKey?: string | null }).industryTemplateKey,
    tenantName: input.tenantContext.tenantName,
    websiteContext: input.tenantContext.config.websiteContext,
    intakeFieldOverrides: (input.tenantContext.config as { intakeFieldOverrides?: unknown }).intakeFieldOverrides,
  });
  const scenarios = input.scenarios ?? profile.readinessScenarios;
  const chatFn = input.chatFn ?? defaultChatFn();
  const callerBase = input.callerPhoneBase ?? '+19995550000';
  const results: ReadinessScenarioResult[] = [];

  for (let i = 0; i < scenarios.length; i += 1) {
    const scenario = scenarios[i];
    const callerPhone = `${callerBase.slice(0, -2)}${String(i + 1).padStart(2, '0')}`;
    const safetyMatch = matchSafetyPolicy({
      businessType: input.tenantContext.businessType,
      industryTemplateKey:
        input.tenantContext.industryTemplateKey ??
        (input.tenantContext.config as { industryTemplateKey?: string | null }).industryTemplateKey,
      tenantName: input.tenantContext.tenantName,
      websiteContext: input.tenantContext.config.websiteContext,
      message: scenario.message,
      callerPhone,
    });

    const escalationMatch = !safetyMatch
      ? matchEscalationPolicy({
          businessType: input.tenantContext.businessType,
          industryTemplateKey:
            input.tenantContext.industryTemplateKey ??
            (input.tenantContext.config as { industryTemplateKey?: string | null }).industryTemplateKey,
          tenantName: input.tenantContext.tenantName,
          websiteContext: input.tenantContext.config.websiteContext,
          message: scenario.message,
          callerPhone,
          customKeywords: (input.tenantContext.config as { customEscalationKeywords?: unknown }).customEscalationKeywords,
          policyOverrides: (input.tenantContext.config as { escalationPolicyOverrides?: unknown }).escalationPolicyOverrides,
        })
      : null;

    const actual = safetyMatch
      ? {
          reply: safetyMatch.customerReply,
          flowType: FlowType.FALLBACK,
          flowStep: buildSafetyState(input.tenantContext, callerPhone).flowStep,
        }
      : escalationMatch?.stopAutomation
        ? {
            reply: escalationMatch.customerReply,
            flowType: FlowType.FALLBACK,
            flowStep: buildSafetyState(input.tenantContext, callerPhone).flowStep,
          }
      : await runFlowEngine({
          tenantContext: input.tenantContext,
          callerPhone,
          inboundMessage: scenario.message,
          currentState: null,
          chatFn,
        }).then((result) => ({
          reply: result.smsReply,
          flowType: result.flowType,
          flowStep: result.nextState.flowStep,
        }));

    const failures = evaluateScenario(scenario, actual);
    const suggestedFixes = suggestFixes(scenario, failures);
    results.push({
      id: scenario.id,
      label: scenario.label,
      category: scenario.category,
      message: scenario.message,
      passed: failures.length === 0,
      failures,
      suggestedFixes,
      reply: actual.reply,
      flowType: actual.flowType,
      flowStep: actual.flowStep,
      expected: scenario.expect,
    });
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  return {
    verticalKey: profile.key,
    verticalLabel: profile.label,
    score: total === 0 ? 1 : passed / total,
    passed,
    total,
    results,
    recommendedIntegrations: profile.recommendedIntegrations,
    valueMetrics: profile.valueMetrics,
    intakeFields: profile.intakeFields.map(({ key, label, examples, requiredFor }) => ({ key, label, examples, requiredFor })),
    defaultIntakeFields: defaultProfile.intakeFields.map(({ key, label, examples, requiredFor }) => ({ key, label, examples, requiredFor })),
    categoryBreakdown: buildCategoryBreakdown(results),
    escalationPolicies: resolveEscalationPolicies({
      businessType: input.tenantContext.businessType,
      industryTemplateKey:
        input.tenantContext.industryTemplateKey ??
        (input.tenantContext.config as { industryTemplateKey?: string | null }).industryTemplateKey,
      tenantName: input.tenantContext.tenantName,
      websiteContext: input.tenantContext.config.websiteContext,
      customKeywords: (input.tenantContext.config as { customEscalationKeywords?: unknown }).customEscalationKeywords,
      policyOverrides: (input.tenantContext.config as { escalationPolicyOverrides?: unknown }).escalationPolicyOverrides,
    }).map(({ id, label, severity, keywords, customerReply, ownerSubject, ownerMessage, taskTitle, taskPriority, stopAutomation, source }) => ({
      id,
      label,
      severity,
      keywords,
      customerReply,
      ownerSubject,
      ownerMessage,
      taskTitle,
      taskPriority,
      stopAutomation,
      source,
    })),
  };
}
