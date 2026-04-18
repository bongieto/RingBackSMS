import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { upsertMenuCategory, deleteMenuCategory } from '@/lib/server/services/tenantService';
import { UpdateMenuCategoryRequestSchema } from '@ringback/shared-types';
import { apiSuccess, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; categoryId: string } },
) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    const body = UpdateMenuCategoryRequestSchema.parse(await req.json());
    if (!body.name) {
      return apiError('name is required for PATCH', 400);
    }
    const updated = await upsertMenuCategory(params.id, {
      id: params.categoryId,
      name: body.name,
      sortOrder: body.sortOrder,
      isAvailable: body.isAvailable,
    });
    return apiSuccess(updated);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    console.error('[PATCH category] failed', err);
    return apiError('Failed to update category', 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; categoryId: string } },
) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    await deleteMenuCategory(params.id, params.categoryId);
    return apiSuccess({ deleted: true });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    console.error('[DELETE category] failed', err);
    return apiError('Failed to delete category', 500);
  }
}
