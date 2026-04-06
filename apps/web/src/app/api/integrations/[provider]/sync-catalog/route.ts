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
    data: { tenantId, provider: params.provider, direction: 'pull', totalItems: 0 },
  });

  try {
    const result = await posRegistry.get(params.provider).syncCatalogFromPOS(tenantId);

    await prisma.posSyncLog.update({
      where: { id: log.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        totalItems: result.total,
        newItems: result.newItems,
        updatedItems: result.updated,
        unchangedItems: result.unchanged,
        errors: result.errors,
      },
    });

    return apiSuccess({
      synced: result.total,
      newItems: result.newItems,
      updated: result.updated,
      unchanged: result.unchanged,
      errors: result.errors,
      provider: params.provider,
      logId: log.id,
    });
  } catch (err: any) {
    await prisma.posSyncLog.update({
      where: { id: log.id },
      data: { status: 'failed', completedAt: new Date(), errorDetail: { message: err.message } },
    });
    return apiError('Internal server error', 500);
  }
}
