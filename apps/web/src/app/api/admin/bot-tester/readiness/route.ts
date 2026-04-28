import { NextRequest } from 'next/server';
import { FlowType } from '@ringback/shared-types';
import { runVerticalReadinessSuite, type TenantContext } from '@ringback/flow-engine';
import { requireBotTesterAdmin, isNextResponse } from '@/lib/server/auth';
import { apiError, apiSuccess } from '@/lib/server/response';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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
  };

  try {
    const result = await runVerticalReadinessSuite({ tenantContext });
    return apiSuccess(result);
  } catch (err: any) {
    logger.error('Bot tester readiness failed', {
      tenantId,
      err: err?.message,
    });
    return apiError(`Readiness run failed: ${err?.message ?? 'unknown'}`, 500);
  }
}
