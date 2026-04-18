import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { listMenuCategories, upsertMenuCategory } from '@/lib/server/services/tenantService';
import { CreateMenuCategoryRequestSchema } from '@ringback/shared-types';
import { apiSuccess, apiCreated, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    return apiSuccess(await listMenuCategories(params.id));
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    console.error('[GET categories] failed', err);
    return apiError('Internal server error', 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    const body = CreateMenuCategoryRequestSchema.parse(await req.json());
    const cat = await upsertMenuCategory(params.id, body);
    return apiCreated(cat);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    console.error('[POST categories] failed', err);
    return apiError('Failed to create category', 500);
  }
}
