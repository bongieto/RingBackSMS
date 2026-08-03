import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma, TenantMemberRole } from '@prisma/client';
import { requireTenantRole, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { posRegistry } from '@/lib/server/pos/registry';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  locationId: z.string().min(1),
});

/**
 * POST /api/integrations/:provider/configure-location?tenantId=...
 *
 * Changes which merchant location the tenant is synced to. Validates
 * the id is one of the locations actually available on the connected
 * account, then writes it to both posLocationId (current code path)
 * and squareLocationId (legacy code path in flowEngineService).
 */
export async function POST(request: NextRequest, { params }: { params: { provider: string } }) {
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  const authResult = await requireTenantRole(tenantId, [
    TenantMemberRole.OWNER,
    TenantMemberRole.MANAGER,
  ]);
  if (isNextResponse(authResult)) return authResult;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (err: any) {
    return apiError(err?.message ?? 'Invalid body', 400);
  }

  try {
    const adapter = posRegistry.get(params.provider);
    const locations = await adapter.listLocations(tenantId);
    const match = locations.find((l) => l.id === body.locationId);
    if (!match) {
      return apiError('Location id is not available on this merchant account', 400);
    }

    // A Square menu selection is location-specific. Clear it whenever the
    // location is configured so the operator must choose from the new
    // location's actual menu list before the next pull.
    let nextPosRaw: Prisma.InputJsonValue | undefined;
    if (params.provider === 'square') {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { posRaw: true },
      });
      const raw =
        tenant?.posRaw && typeof tenant.posRaw === 'object' && !Array.isArray(tenant.posRaw)
          ? { ...(tenant.posRaw as Prisma.JsonObject) }
          : {};
      delete raw.squareMenuCategoryId;
      delete raw.squareMenuName;
      nextPosRaw = raw as Prisma.InputJsonValue;
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        posLocationId: body.locationId,
        // Keep the legacy field in sync so the flow engine's existing
        // reads of squareLocationId pick up the new value too.
        squareLocationId: params.provider === 'square' ? body.locationId : undefined,
        posRaw: nextPosRaw,
      },
    });

    logger.info('POS location reassigned', {
      tenantId,
      provider: params.provider,
      locationId: body.locationId,
      locationName: match.name,
    });

    return apiSuccess({
      locationId: body.locationId,
      name: match.name,
      address: match.address,
    });
  } catch (err: any) {
    logger.error('[POST /integrations/:provider/configure-location] failed', {
      tenantId,
      provider: params.provider,
      err: err?.message,
    });
    return apiError(err?.message ?? 'Failed to change location', 500);
  }
}
