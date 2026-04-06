import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { posRegistry } from '@/lib/server/pos/registry';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function POST(request: NextRequest, { params }: { params: { provider: string } }) {
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const log = await prisma.posSyncLog.create({
    data: { tenantId, provider: params.provider, direction: 'push', totalItems: 0 },
  });

  try {
    const count = await posRegistry.get(params.provider).pushCatalogToPOS(tenantId);

    await prisma.posSyncLog.update({
      where: { id: log.id },
      data: { status: 'completed', completedAt: new Date(), totalItems: count },
    });

    return apiSuccess({ pushed: count, provider: params.provider, logId: log.id });
  } catch (err: any) {
    await prisma.posSyncLog.update({
      where: { id: log.id },
      data: { status: 'failed', completedAt: new Date(), errorDetail: { message: err.message } },
    });
    return apiError('Internal server error', 500);
  }
}
