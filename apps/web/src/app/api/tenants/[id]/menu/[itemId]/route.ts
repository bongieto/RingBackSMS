import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  const item = await prisma.menuItem.findUnique({ where: { id: params.itemId } });
  if (!item) return apiError('Menu item not found', 404);
  if (item.tenantId !== params.id) return apiError('Forbidden', 403);
  await prisma.menuItem.delete({ where: { id: params.itemId } });
  return apiSuccess({ deleted: true });
}
