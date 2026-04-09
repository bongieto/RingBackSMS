import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { listEventTypes } from '@/lib/server/services/calcomService';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenantId = new URL(req.url).searchParams.get('tenantId') ?? '';
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  try {
    const eventTypes = await listEventTypes(tenantId);
    const cfg = await prisma.tenantConfig.findUnique({
      where: { tenantId },
      select: { calcomEventTypeId: true },
    });
    return apiSuccess({
      eventTypes,
      currentEventTypeId: cfg?.calcomEventTypeId ?? null,
    });
  } catch (err: any) {
    logger.warn('[GET /api/integrations/calcom/event-types] failed', {
      tenantId,
      err: err?.message,
    });
    return apiError(err?.message ?? 'Failed to load event types', 500);
  }
}
