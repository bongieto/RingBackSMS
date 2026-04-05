import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return apiError('Unauthorized', 401);
  const item = await prisma.menuItem.findUnique({ where: { id: params.itemId } });
  if (!item) return apiError('Menu item not found', 404);
  if (item.tenantId !== params.id) return apiError('Forbidden', 403);
  await prisma.menuItem.delete({ where: { id: params.itemId } });
  return apiSuccess({ deleted: true });
}
