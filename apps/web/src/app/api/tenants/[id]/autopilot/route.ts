import { NextRequest } from 'next/server';
import { TenantMemberRole } from '@prisma/client';
import { z } from 'zod';
import { requireTenantRole, verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { apiError, apiSuccess } from '@/lib/server/response';
import {
  applyTenantAutopilot,
  getTenantAutopilotPlan,
  saveTenantAutopilotAnswer,
} from '@/lib/server/services/autopilotService';
import { AppError } from '@/lib/server/errors';

const ApplySchema = z.object({
  enabled: z.boolean().optional().default(true),
  answer: z
    .object({
      key: z.string().trim().min(2).max(120),
      value: z.string().trim().min(1).max(2000),
    })
    .optional(),
});

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await verifyTenantAccess(params.id);
  if (isNextResponse(auth)) return auth;
  try {
    return apiSuccess(await getTenantAutopilotPlan(params.id));
  } catch (error) {
    if (error instanceof AppError) return apiError(error.message, error.statusCode);
    return apiError('Unable to prepare Autopilot', 500);
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireTenantRole(params.id, [
    TenantMemberRole.OWNER,
    TenantMemberRole.MANAGER,
  ]);
  if (isNextResponse(auth)) return auth;
  try {
    const body = ApplySchema.parse(await request.json().catch(() => ({})));
    if (body.answer) {
      return apiSuccess(
        await saveTenantAutopilotAnswer({
          tenantId: params.id,
          key: body.answer.key,
          answer: body.answer.value,
        })
      );
    }
    return apiSuccess(await applyTenantAutopilot(params.id, body));
  } catch (error) {
    if (error instanceof z.ZodError) return apiError(error.message, 400);
    if (error instanceof AppError) return apiError(error.message, error.statusCode);
    return apiError('Unable to apply Autopilot', 500);
  }
}
