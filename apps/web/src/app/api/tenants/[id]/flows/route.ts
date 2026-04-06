import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';

const ALL_FLOW_TYPES = ['ORDER', 'MEETING', 'FALLBACK', 'CUSTOM'] as const;

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;

  const flows = await prisma.flow.findMany({ where: { tenantId: params.id }, orderBy: { type: 'asc' } });

  // Auto-create any missing flow types for existing tenants
  const existingTypes = new Set(flows.map((f) => f.type));
  const missingTypes = ALL_FLOW_TYPES.filter((t) => !existingTypes.has(t));

  if (missingTypes.length > 0) {
    await prisma.flow.createMany({
      data: missingTypes.map((type) => ({
        tenantId: params.id,
        type: type as any,
        isEnabled: false,
      })),
    });
    // Re-fetch with newly created flows
    const allFlows = await prisma.flow.findMany({ where: { tenantId: params.id }, orderBy: { type: 'asc' } });
    return apiSuccess(allFlows);
  }

  return apiSuccess(flows);
}
