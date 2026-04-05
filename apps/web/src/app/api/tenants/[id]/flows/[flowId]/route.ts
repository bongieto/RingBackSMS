import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';

const FlowUpdateSchema = z.object({
  isEnabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string; flowId: string } }) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return apiError('Unauthorized', 401);
  try {
    const body = FlowUpdateSchema.parse(await req.json());
    const flow = await prisma.flow.update({
      where: { id: params.flowId },
      data: {
        ...(body.isEnabled !== undefined && { isEnabled: body.isEnabled }),
        ...(body.config !== undefined && { config: body.config as Prisma.InputJsonValue }),
      },
    });
    return apiSuccess(flow);
  } catch (err: any) {
    return apiError(err.message ?? 'Internal server error', 500);
  }
}
