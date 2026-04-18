import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { listOptions, upsertOption } from '@/lib/server/services/menuModifiersService';
import { CreateOptionRequestSchema } from '@ringback/shared-types';
import { apiSuccess, apiCreated, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    return apiSuccess(await listOptions(params.id));
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    console.error('[GET options] failed', err);
    return apiError('Internal server error', 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    const body = CreateOptionRequestSchema.parse(await req.json());
    const opt = await upsertOption(params.id, body);
    return apiCreated(opt);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    console.error('[POST options] failed', err);
    return apiError('Failed to create option', 500);
  }
}
