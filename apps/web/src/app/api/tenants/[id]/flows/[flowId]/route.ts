import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { invalidateTenantContext } from '@/lib/server/services/tenantContextCache';

const FlowUpdateSchema = z.object({
  isEnabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string; flowId: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    const body = FlowUpdateSchema.parse(await req.json());
    const flow = await prisma.flow.update({
      where: { id: params.flowId },
      data: {
        ...(body.isEnabled !== undefined && { isEnabled: body.isEnabled }),
        ...(body.config !== undefined && { config: body.config as Prisma.InputJsonValue }),
      },
    });
    // Enabling/disabling the ORDER flow changes how processInboundSms
    // routes — drop the tenant cache so it takes effect on the next SMS.
    await invalidateTenantContext(params.id);
    return apiSuccess(flow);
  } catch (err: any) {
    return apiError('Internal server error', 500);
  }
}
