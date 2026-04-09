import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { decryptNullable } from '@/lib/server/encryption';
import { listEventTypes } from '@/lib/server/services/calcomService';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenantId = new URL(req.url).searchParams.get('tenantId') ?? '';
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  try {
    const cfg = await prisma.tenantConfig.findUnique({
      where: { tenantId },
      select: { calcomApiKey: true, calcomEventTypeId: true },
    });
    const apiKey = decryptNullable(cfg?.calcomApiKey);
    if (!apiKey) return apiError('cal.com is not connected', 400);

    const eventTypes = await listEventTypes(apiKey);
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
