import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);

  const tenantId = new URL(request.url).searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId required', 400);

  const logs = await prisma.posSyncLog.findMany({
    where: { tenantId },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });

  return apiSuccess({ logs });
}
