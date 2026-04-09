import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { posRegistry } from '@/lib/server/pos/registry';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/:provider/locations?tenantId=...
 *
 * Returns the list of merchant locations available from the connected
 * POS provider, plus the tenant's currently-selected locationId. Used
 * by the integrations page to render a location picker.
 */
export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  try {
    const adapter = posRegistry.get(params.provider);
    const [locations, tenant] = await Promise.all([
      adapter.listLocations(tenantId),
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { posLocationId: true },
      }),
    ]);

    return apiSuccess({
      locations,
      currentLocationId: tenant?.posLocationId ?? null,
    });
  } catch (err: any) {
    logger.warn('[GET /integrations/:provider/locations] failed', {
      tenantId,
      provider: params.provider,
      err: err?.message,
    });
    return apiError(err?.message ?? 'Failed to load locations', 500);
  }
}
