#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { PrismaClient } from '../apps/web/node_modules/@prisma/client/index.js';
import { runFlowEngine, runVerticalReadinessSuite, matchEscalationPolicy, matchSafetyPolicy } from '../packages/flow-engine/dist/index.js';
import { FlowType } from '../packages/shared-types/dist/index.js';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key]) continue;
    process.env[key] = raw.replace(/^(['"`])(.*)\1$/, '$2');
  }
}

loadEnvFile(path.join(repoRoot, 'apps/api/.env'));
loadEnvFile(path.join(repoRoot, 'apps/web/.env.local'));
process.env.DATABASE_URL = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL or DIRECT_URL is required.');
  process.exit(1);
}

const prisma = new PrismaClient();

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime(time) {
  const [hour, minute] = String(time).split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return String(time);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatDaysLabel(days) {
  if (!Array.isArray(days) || days.length === 0 || days.length === 7) return 'Every day';
  const sorted = [...days].sort((a, b) => a - b);
  const ranges = [];
  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i];
    let end = start;
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) {
      i += 1;
      end = sorted[i];
    }
    if (end - start >= 2) ranges.push(`${DAY_NAMES[start]}-${DAY_NAMES[end]}`);
    else if (end !== start) ranges.push(DAY_NAMES[start], DAY_NAMES[end]);
    else ranges.push(DAY_NAMES[start]);
    i += 1;
  }
  return ranges.join(', ');
}

function buildSmokeHoursInfo(config) {
  const schedule =
    config?.businessSchedule && Object.keys(config.businessSchedule).length > 0
      ? config.businessSchedule
      : null;
  if (schedule) {
    const [dayKey, firstDay] = Object.entries(schedule)[0] ?? [];
    const todayHoursDisplay = firstDay ? `${formatTime(firstDay.open)} - ${formatTime(firstDay.close)}` : 'Closed today';
    const weeklyHoursDisplay = Object.entries(schedule)
      .map(([day, hours]) => `${DAY_NAMES[Number(day)]} ${formatTime(hours.open)} - ${formatTime(hours.close)}`)
      .join(', ');
    return {
      openNow: true,
      nextOpenDisplay: null,
      todayHoursDisplay,
      weeklyHoursDisplay: weeklyHoursDisplay || todayHoursDisplay,
      minutesUntilClose: null,
      closesAtDisplay: firstDay ? formatTime(firstDay.close) : null,
      closingSoon: false,
    };
  }

  if (!config?.businessHoursStart || !config?.businessHoursEnd) {
    return {
      openNow: true,
      nextOpenDisplay: null,
      todayHoursDisplay: 'Always open',
      weeklyHoursDisplay: 'Always open',
      minutesUntilClose: null,
      closesAtDisplay: null,
      closingSoon: false,
    };
  }

  const hours = `${formatTime(config.businessHoursStart)} - ${formatTime(config.businessHoursEnd)}`;
  return {
    openNow: true,
    nextOpenDisplay: null,
    todayHoursDisplay: hours,
    weeklyHoursDisplay: `${formatDaysLabel(config.businessDays)} ${hours}`,
    minutesUntilClose: null,
    closesAtDisplay: formatTime(config.businessHoursEnd),
    closingSoon: false,
  };
}

function toTenantContext(tenant) {
  const config = {
    ...tenant.config,
    businessDays: tenant.config?.businessDays,
    businessSchedule: tenant.config?.businessSchedule,
    closedDates: tenant.config?.closedDates,
    salesTaxRate: tenant.config?.salesTaxRate == null ? null : Number(tenant.config.salesTaxRate),
  };

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    businessType: tenant.businessType,
    industryTemplateKey: tenant.config?.industryTemplateKey,
    tenantSlug: tenant.slug,
    tenantPhoneNumber: tenant.twilioPhoneNumber,
    config,
    flows: tenant.flows.map((flow) => ({
      id: flow.id,
      tenantId: flow.tenantId,
      type: flow.type,
      isEnabled: flow.isEnabled,
      config: flow.config ?? null,
      createdAt: flow.createdAt,
      updatedAt: flow.updatedAt,
    })),
    menuItems: tenant.menuItems.map((item) => ({
      ...item,
      price: Number(item.price),
      priceMin: item.priceMin == null ? null : Number(item.priceMin),
      priceMax: item.priceMax == null ? null : Number(item.priceMax),
      intakeQuestions: Array.isArray(item.intakeQuestions)
        ? item.intakeQuestions.filter((question) => typeof question === 'string')
        : [],
      squareCatalogId: item.squareCatalogId,
      squareVariationId: item.squareVariationId,
      lastSyncedAt: item.lastSyncedAt,
    })),
    hoursInfo: buildSmokeHoursInfo(config),
  };
}

function readinessChatFn() {
  return async ({ systemPrompt, userMessage }) => {
    const isClassifier =
      /intent classifier/i.test(systemPrompt) ||
      /Classify the customer's intent|Available flows/i.test(userMessage);
    if (!isClassifier) {
      return "Thanks for reaching out. I can help with that and connect you with a team member if needed.";
    }

    const smsMatch = userMessage.match(/customer sent this SMS:\s*"([^"]*)"/i);
    const lower = (smsMatch?.[1] ?? userMessage).toLowerCase();
    const intent =
      /\b(order|menu|buy|place order|i want)\b/.test(lower)
        ? FlowType.ORDER
        : /\b(schedule|appointment|meeting|book|consultation|come out|service|repair|not cooling|not heating|caregiver|haircut|brake|brakes)\b/.test(lower)
          ? FlowType.MEETING
          : /\b(do you have|in stock|available|how much|price|cost|estimate|quote|services do you|open|hours|question)\b/.test(lower)
            ? FlowType.FALLBACK
            : 'UNCLEAR';
    return JSON.stringify({ intent, confidence: intent === 'UNCLEAR' ? 0 : 0.9 });
  };
}

async function loadTenantByName(name) {
  return prisma.tenant.findFirst({
    where: { name },
    include: {
      config: true,
      flows: { where: { isEnabled: true } },
      menuItems: { where: { isAvailable: true } },
    },
  });
}

async function maybeCreateSmokeTenant() {
  if (process.env.SMOKE_CREATE_TENANT !== '1') return null;

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 12);
  const name = `Smoke Test HVAC ${stamp}`;
  const slug = `smoke-test-hvac-${stamp.toLowerCase()}`;
  const tenant = await prisma.tenant.create({
    data: {
      name,
      slug,
      businessType: 'SERVICE',
      plan: 'FREE',
      isActive: false,
      config: {
        create: {
          greeting: `Hi! Sorry we missed your call at ${name}. Reply with what you need and we will get back to you.`,
          aiPersonality: 'Professional HVAC receptionist. Triage urgency, collect details, and never imply emergency response capability.',
          timezone: 'America/Chicago',
          businessDays: [1, 2, 3, 4, 5],
          businessHoursStart: '08:00',
          businessHoursEnd: '18:00',
          industryTemplateKey: 'hvac',
        },
      },
      flows: {
        createMany: {
          data: [
            { type: 'MEETING', isEnabled: true },
            { type: 'FALLBACK', isEnabled: true },
          ],
        },
      },
    },
  });
  return tenant.id;
}

async function simulate(tenant, message) {
  const tenantContext = toTenantContext(tenant);
  const callerPhone = '+15550009999';
  const policyInput = {
    businessType: tenantContext.businessType,
    industryTemplateKey: tenantContext.industryTemplateKey,
    tenantName: tenantContext.tenantName,
    websiteContext: tenantContext.config.websiteContext,
    message,
    callerPhone,
  };
  const safety = matchSafetyPolicy(policyInput);
  if (safety) {
    return { kind: 'safety', flowType: FlowType.FALLBACK, reply: safety.customerReply };
  }
  const escalation = matchEscalationPolicy({
    ...policyInput,
    customKeywords: tenantContext.config.customEscalationKeywords,
    policyOverrides: tenantContext.config.escalationPolicyOverrides,
  });
  if (escalation?.stopAutomation) {
    return { kind: 'escalation', flowType: FlowType.FALLBACK, reply: escalation.customerReply };
  }

  const output = await runFlowEngine({
    tenantContext,
    callerPhone,
    inboundMessage: message,
    currentState: null,
    chatFn: readinessChatFn(),
  });
  return {
    kind: 'flow',
    flowType: output.flowType,
    step: output.nextState.flowStep,
    reply: output.smsReply,
  };
}

function assertIncludes(label, reply, expected) {
  for (const phrase of expected) {
    if (!reply.toLowerCase().includes(phrase.toLowerCase())) {
      throw new Error(`${label}: expected reply to include "${phrase}". Reply: ${reply}`);
    }
  }
}

async function main() {
  const createdTenantId = await maybeCreateSmokeTenant();
  const tenants = await prisma.tenant.findMany({
    include: {
      config: true,
      flows: { where: { isEnabled: true } },
      menuItems: { where: { isAvailable: true } },
    },
  });

  const readinessRows = [];
  let total = 0;
  let passed = 0;
  for (const tenant of tenants) {
    if (!tenant.config) {
      readinessRows.push({ name: tenant.name, passed: 0, total: 1, failures: ['missing config'] });
      total += 1;
      continue;
    }
    const result = await runVerticalReadinessSuite({ tenantContext: toTenantContext(tenant) });
    total += result.total;
    passed += result.passed;
    readinessRows.push({
      name: tenant.name,
      industry: tenant.config.industryTemplateKey ?? 'default',
      passed: result.passed,
      total: result.total,
      failures: result.results.filter((scenario) => !scenario.passed).map((scenario) => scenario.id),
    });
  }

  const smokeCases = [
    {
      tenant: "Bruno's HVAC Company",
      label: 'HVAC emergency',
      message: 'I smell gas from my furnace and I think there may be carbon monoxide.',
      expectedFlow: FlowType.FALLBACK,
      replyIncludes: ['911', 'not an emergency service'],
    },
    {
      tenant: "Bruno's HVAC Company",
      label: 'HVAC booking',
      message: 'My AC stopped cooling and I need someone to come out.',
      expectedFlow: FlowType.MEETING,
      replyIncludes: ['What day works'],
    },
    {
      tenant: 'Angels Over Us',
      label: 'Medical emergency',
      message: 'Urgent, my father fell and needs help right now.',
      expectedFlow: FlowType.FALLBACK,
      replyIncludes: ['911', 'not an emergency service'],
    },
    {
      tenant: 'Sari Sari Store',
      label: 'Retail unknown inventory',
      message: 'Can you guarantee you have every color in stock?',
      expectedFlow: FlowType.INQUIRY,
      replyIncludes: ['team member'],
    },
  ];

  const simulated = [];
  for (const testCase of smokeCases) {
    const tenant = await loadTenantByName(testCase.tenant);
    if (!tenant) throw new Error(`Missing smoke tenant: ${testCase.tenant}`);
    const result = await simulate(tenant, testCase.message);
    if (result.flowType !== testCase.expectedFlow) {
      throw new Error(`${testCase.label}: expected ${testCase.expectedFlow}, got ${result.flowType}`);
    }
    assertIncludes(testCase.label, result.reply, testCase.replyIncludes);
    simulated.push({ label: testCase.label, flowType: result.flowType, kind: result.kind });
  }

  const failures = readinessRows.filter((row) => row.failures.length > 0);
  console.log(JSON.stringify({
    createdTenantId,
    readiness: `${passed}/${total}`,
    failures,
    simulated,
  }, null, 2));

  if (failures.length > 0 || passed !== total) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
