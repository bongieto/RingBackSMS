import { NextRequest } from 'next/server';
import { FlowType } from '@ringback/shared-types';
import { runVerticalReadinessSuite, type TenantContext } from '@ringback/flow-engine';
import { requireBotTesterAdmin, isNextResponse } from '@/lib/server/auth';
import { apiError, apiSuccess } from '@/lib/server/response';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';
import {
  getBusinessHoursDisplay,
  getClosesAtDisplay,
  getMinutesUntilClose,
  getNextOpenDisplay,
  getTodayHoursDisplay,
  isWithinBusinessHours,
} from '@/lib/server/businessHours';
import { logTiming, startTimer } from '@/lib/server/perf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const timer = startTimer();
  const auth = await requireBotTesterAdmin();
  if (isNextResponse(auth)) return auth;

  let body: { tenantId?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError('Invalid JSON body', 400);
  }

  const tenantId = typeof body.tenantId === 'string' ? body.tenantId : '';
  if (!tenantId) return apiError('tenantId is required', 400);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      config: true,
      flows: { where: { isEnabled: true } },
      menuItems: { where: { isAvailable: true } },
    },
  });

  if (!tenant || !tenant.config) return apiError('Tenant not found', 404);

  const hoursConfig = {
    businessHoursStart: tenant.config.businessHoursStart,
    businessHoursEnd: tenant.config.businessHoursEnd,
    businessDays: tenant.config.businessDays as number[],
    businessSchedule: tenant.config.businessSchedule as Record<string, { open: string; close: string }> | null,
    closedDates: tenant.config.closedDates as string[],
    timezone: tenant.config.timezone,
  };
  const openNow = isWithinBusinessHours(hoursConfig);
  const minutesUntilClose = openNow ? getMinutesUntilClose(hoursConfig) : null;

  const tenantContext: TenantContext = {
    tenantId: tenant.id,
    tenantName: tenant.name,
    businessType: tenant.businessType,
    industryTemplateKey: tenant.config.industryTemplateKey,
    tenantSlug: tenant.slug,
    tenantPhoneNumber: tenant.twilioPhoneNumber,
    config: {
      ...tenant.config,
      businessDays: tenant.config.businessDays as number[],
      businessSchedule: tenant.config.businessSchedule as Record<string, { open: string; close: string }> | null | undefined,
      closedDates: tenant.config.closedDates as string[],
      salesTaxRate: tenant.config.salesTaxRate != null ? Number(tenant.config.salesTaxRate) : null,
    },
    flows: tenant.flows.map((f) => ({
      id: f.id,
      tenantId: f.tenantId,
      type: f.type as unknown as FlowType,
      isEnabled: f.isEnabled,
      config: (f.config ?? null) as Record<string, unknown> | null,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
    menuItems: tenant.menuItems.map((m) => ({
      ...m,
      price: Number(m.price),
      priceMin: m.priceMin == null ? null : Number(m.priceMin),
      priceMax: m.priceMax == null ? null : Number(m.priceMax),
      intakeQuestions: Array.isArray(m.intakeQuestions)
        ? m.intakeQuestions.filter((q): q is string => typeof q === 'string')
        : [],
      squareCatalogId: m.squareCatalogId,
      squareVariationId: m.squareVariationId,
      lastSyncedAt: m.lastSyncedAt,
    })),
    hoursInfo: {
      openNow,
      nextOpenDisplay: openNow ? null : getNextOpenDisplay(hoursConfig),
      todayHoursDisplay: getTodayHoursDisplay(hoursConfig),
      weeklyHoursDisplay: getBusinessHoursDisplay(hoursConfig),
      minutesUntilClose,
      closesAtDisplay: openNow ? getClosesAtDisplay(hoursConfig) : null,
      closingSoon: minutesUntilClose != null && minutesUntilClose > 0 && minutesUntilClose <= 15,
    },
  };

  try {
    const result = await runVerticalReadinessSuite({ tenantContext });
    logTiming('Admin bot tester readiness completed', timer, {
      tenantId,
      vertical: result.verticalKey,
      score: result.score,
      passed: result.passed,
      total: result.total,
    });
    return apiSuccess(result);
  } catch (err: any) {
    logger.error('Bot tester readiness failed', {
      tenantId,
      latencyMs: timer.elapsedMs(),
      err: err?.message,
    });
    return apiError(`Readiness run failed: ${err?.message ?? 'unknown'}`, 500);
  }
}
