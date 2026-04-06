import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(request: NextRequest) {
  const tenantId = new URL(request.url).searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId required', 400);

  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const logs = await prisma.posSyncLog.findMany({
    where: { tenantId },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });

  return apiSuccess({ logs });
}
