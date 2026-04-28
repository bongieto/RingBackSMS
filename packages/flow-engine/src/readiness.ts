import { FlowType, type CallerState } from '@ringback/shared-types';
import { runFlowEngine } from './engine';
import type { ChatFn, TenantContext } from './types';
import { getVerticalProfile, matchSafetyPolicy, type ReadinessScenarioSeed } from './verticals';

export interface ReadinessScenarioResult {
  id: string;
  label: string;
  message: string;
  passed: boolean;
  failures: string[];
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
  intakeFields: Array<{ key: string; label: string; examples: string[] }>;
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

export async function runVerticalReadinessSuite(input: {
  tenantContext: TenantContext;
  scenarios?: ReadinessScenarioSeed[];
  chatFn?: ChatFn;
  callerPhoneBase?: string;
}): Promise<ReadinessSuiteResult> {
  const profile = getVerticalProfile({
    businessType: input.tenantContext.businessType,
    industryTemplateKey:
      input.tenantContext.industryTemplateKey ??
      (input.tenantContext.config as { industryTemplateKey?: string | null }).industryTemplateKey,
    tenantName: input.tenantContext.tenantName,
    websiteContext: input.tenantContext.config.websiteContext,
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

    const actual = safetyMatch
      ? {
          reply: safetyMatch.customerReply,
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
    results.push({
      id: scenario.id,
      label: scenario.label,
      message: scenario.message,
      passed: failures.length === 0,
      failures,
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
    intakeFields: profile.intakeFields.map(({ key, label, examples }) => ({ key, label, examples })),
  };
}
