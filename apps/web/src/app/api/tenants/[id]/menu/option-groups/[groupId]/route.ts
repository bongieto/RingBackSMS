import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { upsertOptionGroup, deleteOptionGroup } from '@/lib/server/services/menuModifiersService';
import { UpdateOptionGroupRequestSchema } from '@ringback/shared-types';
import { apiSuccess, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';
import { prisma } from '@/lib/server/db';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; groupId: string } },
) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    const body = UpdateOptionGroupRequestSchema.parse(await req.json());
    if (!body.name) return apiError('name is required', 400);
    // Resolve existing group's menuItemId to satisfy upsert signature
    const existing = await prisma.menuItemModifierGroup.findUnique({
      where: { id: params.groupId },
      select: { menuItemId: true },
    });
    if (!existing) return apiError('Option group not found', 404);
    const updated = await upsertOptionGroup(params.id, {
      id: params.groupId,
      menuItemId: existing.menuItemId,
      name: body.name,
      selectionType: body.selectionType,
      required: body.required,
      minSelections: body.minSelections,
      maxSelections: body.maxSelections,
      sortOrder: body.sortOrder,
    });
    return apiSuccess(updated);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    console.error('[PATCH option-group] failed', err);
    return apiError('Failed to update option group', 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; groupId: string } },
) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    await deleteOptionGroup(params.id, params.groupId);
    return apiSuccess({ deleted: true });
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    console.error('[DELETE option-group] failed', err);
    return apiError('Failed to delete option group', 500);
  }
}
