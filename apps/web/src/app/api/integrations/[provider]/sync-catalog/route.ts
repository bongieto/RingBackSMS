import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { PosProviderType } from '@prisma/client';
import { prisma } from '@/lib/server/db';
import { posRegistry } from '@/lib/server/pos/registry';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function POST(request: NextRequest, { params }: { params: { provider: string } }) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return apiError('Unauthorized', 401);

  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';

  const log = await prisma.posSyncLog.create({
    data: { tenantId, provider: params.provider as PosProviderType, direction: 'pull', totalItems: 0 },
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
    return apiError(err.message, 500);
  }
}
