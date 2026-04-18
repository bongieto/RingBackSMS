import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { upsertOption, deleteOption } from '@/lib/server/services/menuModifiersService';
import { UpdateOptionRequestSchema } from '@ringback/shared-types';
import { apiSuccess, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';
import { prisma } from '@/lib/server/db';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; optionId: string } },
) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    const body = UpdateOptionRequestSchema.parse(await req.json());
    if (!body.name) return apiError('name is required', 400);
    const existing = await prisma.menuItemModifier.findUnique({
      where: { id: params.optionId },
      select: { groupId: true },
    });
    if (!existing) return apiError('Option not found', 404);
    const updated = await upsertOption(params.id, {
      id: params.optionId,
      groupId: existing.groupId,
      name: body.name,
      priceAdjust: body.priceAdjust,
      isDefault: body.isDefault,
      sortOrder: body.sortOrder,
    });
    return apiSuccess(updated);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    console.error('[PATCH option] failed', err);
    return apiError('Failed to update option', 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; optionId: string } },
) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    await deleteOption(params.id, params.optionId);
    return apiSuccess({ deleted: true });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    console.error('[DELETE option] failed', err);
    return apiError('Failed to delete option', 500);
  }
}
