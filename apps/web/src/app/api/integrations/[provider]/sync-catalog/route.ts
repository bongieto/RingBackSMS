import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { posRegistry } from '@/lib/server/pos/registry';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function POST(request: NextRequest, { params }: { params: { provider: string } }) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return apiError('Unauthorized', 401);

  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  const provider = params.provider;

  const log = await prisma.posSyncLog.create({
    data: {
      tenantId,
      provider,
      direction: 'pull',
      status: 'running',
      startedAt: new Date(),
    },
  });

  try {
    const result = await posRegistry.get(provider).syncCatalogFromPOS(tenantId);

    await prisma.posSyncLog.update({
      where: { id: log.id },
      data: {
        status: 'success',
        itemsSynced: result.total,
        created: result.created,
        updated: result.updated,
        removed: result.removed,
        finishedAt: new Date(),
      },
    });

    return apiSuccess({
      synced: result.total,
      created: result.created,
      updated: result.updated,
      removed: result.removed,
      provider,
      logId: log.id,
    });
  } catch (err) {
    await prisma.posSyncLog.update({
      where: { id: log.id },
      data: {
        status: 'error',
        error: (err as Error).message,
        finishedAt: new Date(),
      },
    });
    throw err;
  }
}
