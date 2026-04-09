import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const tenantId = new URL(req.url).searchParams.get('tenantId') ?? '';
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  try {
    await prisma.tenantConfig.update({
      where: { tenantId },
      data: {
        calcomAccessToken: null,
        calcomRefreshToken: null,
        calcomTokenExpiresAt: null,
        calcomUserId: null,
        calcomUserEmail: null,
        calcomEventTypeId: null,
        calcomEventTypeSlug: null,
      },
    });
    logger.info('cal.com disconnected', { tenantId });
    return apiSuccess({ disconnected: true });
  } catch (err: any) {
    logger.error('[POST /api/integrations/calcom/disconnect] failed', {
      tenantId,
      err: err?.message,
    });
    return apiError('Failed to disconnect cal.com', 500);
  }
}
