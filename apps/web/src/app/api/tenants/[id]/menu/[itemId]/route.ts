import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { invalidateTenantContext } from '@/lib/server/services/tenantContextCache';
import { checkAuthRateLimit } from '@/lib/server/rateLimit';

export async function DELETE(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  const { userId } = await auth();
  const limited = await checkAuthRateLimit(userId, req.headers, 'tenant-menu-mutate');
  if (limited) return limited;
  const item = await prisma.menuItem.findUnique({ where: { id: params.itemId } });
  if (!item) return apiError('Menu item not found', 404);
  if (item.tenantId !== params.id) return apiError('Forbidden', 403);
  await prisma.menuItem.delete({ where: { id: params.itemId } });
  await invalidateTenantContext(params.id);
  return apiSuccess({ deleted: true });
}
