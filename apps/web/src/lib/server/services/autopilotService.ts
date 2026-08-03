import { FlowType as PrismaFlowType, Prisma } from '@prisma/client';
import { AUTOPILOT_VERSION, buildAutopilotPlan, type AutopilotPlan } from '@ringback/flow-engine';
import { prisma } from '../db';
import { NotFoundError, ValidationError } from '../errors';
import { logger } from '../logger';

export interface TenantAutopilotState {
  enabled: boolean;
  mode: 'AUTOPILOT';
  version: string | null;
  profileKey: string | null;
  lastAppliedAt: string | null;
  ownerQuestionKeys: string[];
  setupWarnings: string[];
}

function readState(value: unknown): TenantAutopilotState {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    enabled: row.enabled === true,
    mode: 'AUTOPILOT',
    version: typeof row.version === 'string' ? row.version : null,
    profileKey: typeof row.profileKey === 'string' ? row.profileKey : null,
    lastAppliedAt: typeof row.lastAppliedAt === 'string' ? row.lastAppliedAt : null,
    ownerQuestionKeys: Array.isArray(row.ownerQuestionKeys)
      ? row.ownerQuestionKeys.filter((key): key is string => typeof key === 'string')
      : [],
    setupWarnings: Array.isArray(row.setupWarnings)
      ? row.setupWarnings.filter((warning): warning is string => typeof warning === 'string')
      : [],
  };
}

async function loadAutopilotTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      config: true,
      flows: { select: { type: true, isEnabled: true } },
      knowledgeFacts: {
        where: {
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { key: true, isVerified: true },
      },
      _count: { select: { menuItems: true } },
    },
  });
  if (!tenant) throw new NotFoundError('Tenant');
  const config = tenant.config;
  if (!config) throw new NotFoundError('Tenant config');
  return { ...tenant, config };
}

function planForTenant(tenant: Awaited<ReturnType<typeof loadAutopilotTenant>>): {
  plan: AutopilotPlan;
  state: TenantAutopilotState;
} {
  const state = readState(tenant.config.verticalOnboarding);
  const hasBuiltInCalendar =
    tenant.config.meetingEnabled !== false &&
    !tenant.config.calcomLink &&
    !(tenant.config.calcomAccessToken && tenant.config.calcomEventTypeId);
  const hasCalcom = Boolean(
    tenant.config.calcomLink || (tenant.config.calcomAccessToken && tenant.config.calcomEventTypeId)
  );
  const plan = buildAutopilotPlan({
    businessType: tenant.businessType,
    industryTemplateKey: tenant.config.industryTemplateKey,
    tenantName: tenant.name,
    websiteContext: tenant.config.websiteContext,
    configuredFlowTypes: tenant.flows.filter((flow) => flow.isEnabled).map((flow) => flow.type),
    verifiedKnowledgeKeys: tenant.knowledgeFacts
      .filter((fact) => fact.isVerified)
      .map((fact) => fact.key),
    unverifiedKnowledgeKeys: tenant.knowledgeFacts
      .filter((fact) => !fact.isVerified)
      .map((fact) => fact.key),
    catalogItemCount: tenant._count.menuItems,
    hasBusinessAddress: Boolean(tenant.config.businessAddress?.trim()),
    hasWebsite: Boolean(tenant.config.websiteUrl?.trim()),
    hasBookingCalendar: hasBuiltInCalendar || hasCalcom,
    previousVersion: state.version,
  });
  return { plan, state };
}

export async function getTenantAutopilotPlan(tenantId: string) {
  return planForTenant(await loadAutopilotTenant(tenantId));
}

export async function applyTenantAutopilot(tenantId: string, options: { enabled?: boolean } = {}) {
  const tenant = await loadAutopilotTenant(tenantId);
  const current = planForTenant(tenant);
  const enabled = options.enabled ?? true;
  const appliedAt = new Date().toISOString();
  const onboardingState: TenantAutopilotState = {
    enabled,
    mode: 'AUTOPILOT',
    version: enabled ? AUTOPILOT_VERSION : current.state.version,
    profileKey: current.plan.verticalKey,
    lastAppliedAt: enabled ? appliedAt : current.state.lastAppliedAt,
    ownerQuestionKeys: current.plan.ownerQuestions.map((question) => question.key),
    setupWarnings: current.plan.setupWarnings,
  };

  await prisma.$transaction(async (tx) => {
    if (enabled) {
      for (const type of current.plan.enabledFlows) {
        await tx.flow.upsert({
          where: {
            tenantId_type: {
              tenantId,
              type: type as unknown as PrismaFlowType,
            },
          },
          update: { isEnabled: true },
          create: {
            tenantId,
            type: type as unknown as PrismaFlowType,
            isEnabled: true,
          },
        });
      }
    }
    await tx.tenantConfig.update({
      where: { tenantId },
      data: {
        verticalOnboarding: onboardingState as unknown as Prisma.InputJsonValue,
      },
    });
  });

  logger.info('Tenant Autopilot updated', {
    tenantId,
    enabled,
    version: onboardingState.version,
    vertical: current.plan.verticalKey,
    flowsEnabled: enabled ? current.plan.enabledFlows : [],
    ownerQuestions: onboardingState.ownerQuestionKeys.length,
  });

  return getTenantAutopilotPlan(tenantId);
}

export async function saveTenantAutopilotAnswer(input: {
  tenantId: string;
  key: string;
  answer: string;
}) {
  const tenant = await loadAutopilotTenant(input.tenantId);
  const current = planForTenant(tenant);
  const requirement = current.plan.ownerQuestions.find((question) => question.key === input.key);
  if (!requirement) {
    throw new ValidationError('This Autopilot question is already answered or is not required');
  }

  await prisma.knowledgeFact.upsert({
    where: {
      tenantId_key: {
        tenantId: input.tenantId,
        key: requirement.key,
      },
    },
    update: {
      category: requirement.category,
      question: requirement.question,
      answer: input.answer.trim(),
      aliases: requirement.aliases,
      source: 'OWNER',
      sourceUrl: null,
      isVerified: true,
      verifiedAt: new Date(),
      expiresAt: null,
      isActive: true,
    },
    create: {
      tenantId: input.tenantId,
      key: requirement.key,
      category: requirement.category,
      question: requirement.question,
      answer: input.answer.trim(),
      aliases: requirement.aliases,
      source: 'OWNER',
      isVerified: true,
      verifiedAt: new Date(),
    },
  });

  logger.info('Tenant Autopilot answer saved', {
    tenantId: input.tenantId,
    key: requirement.key,
  });

  return applyTenantAutopilot(input.tenantId, {
    enabled: current.state.enabled,
  });
}

export function isAutopilotEnabled(value: unknown): boolean {
  return readState(value).enabled;
}
