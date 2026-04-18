import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { listOptionGroups, upsertOptionGroup } from '@/lib/server/services/menuModifiersService';
import { CreateOptionGroupRequestSchema } from '@ringback/shared-types';
import { apiSuccess, apiCreated, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    return apiSuccess(await listOptionGroups(params.id));
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    console.error('[GET option-groups] failed', err);
    return apiError('Internal server error', 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    const body = CreateOptionGroupRequestSchema.parse(await req.json());
    const group = await upsertOptionGroup(params.id, body);
    return apiCreated(group);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    console.error('[POST option-groups] failed', err);
    return apiError('Failed to create option group', 500);
  }
}
