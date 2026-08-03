import { NextRequest } from 'next/server';
import { AvailabilityUpdateSchema, CommerceScopes } from '@ringback/shared-types';
import { authenticateCommerceRequest } from '@/lib/server/commerce/apiAuth';
import { commerceError, commerceResponse, conflict } from '@/lib/server/commerce/http';
import { enqueueIntegrationEvent } from '@/lib/server/commerce/outbox';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { locationId: string; itemId: string } }
) {
  try {
    const auth = await authenticateCommerceRequest(request, [CommerceScopes.AVAILABILITY_WRITE]);
    const input = AvailabilityUpdateSchema.parse(await request.json());
    const [location, item] = await Promise.all([
      prisma.tenantLocation.findFirst({
        where: { id: params.locationId, tenantId: auth.tenantId },
      }),
      prisma.menuItem.findFirst({ where: { id: params.itemId, tenantId: auth.tenantId } }),
    ]);
    if (!location || !item) {
      return Response.json(
        { error: { code: 'not_found', message: 'Location or menu item not found' } },
        { status: 404 }
      );
    }
    const availability = await prisma
      .$transaction(
        async (tx) => {
          const current = await tx.menuItemAvailability.findUnique({
            where: { locationId_menuItemId: { locationId: location.id, menuItemId: item.id } },
          });
          const currentRevision = current?.revision ?? 1;
          if (input.expectedRevision && input.expectedRevision !== currentRevision) {
            throw new Error(`AVAILABILITY_CONFLICT:${currentRevision}`);
          }
          const row = await tx.menuItemAvailability.upsert({
            where: { locationId_menuItemId: { locationId: location.id, menuItemId: item.id } },
            create: {
              tenantId: auth.tenantId,
              locationId: location.id,
              menuItemId: item.id,
              isAvailable: input.isAvailable,
              reason: input.reason ?? null,
              updatedBy: `api:${auth.credentialId}`,
            },
            update: {
              isAvailable: input.isAvailable,
              reason: input.reason ?? null,
              revision: { increment: 1 },
              updatedBy: `api:${auth.credentialId}`,
            },
          });
          await enqueueIntegrationEvent(tx, {
            tenantId: auth.tenantId,
            sourceConnectionId: auth.connectionId,
            type: 'menu.availability.updated',
            locationId: location.id,
            resourceType: 'menu_item',
            resourceId: item.id,
            data: {
              item_id: item.id,
              is_available: row.isAvailable,
              reason: row.reason,
              revision: row.revision,
            },
          });
          return row;
        },
        { isolationLevel: 'Serializable' }
      )
      .catch((error) => {
        if (error instanceof Error && error.message.startsWith('AVAILABILITY_CONFLICT:')) {
          return { conflictRevision: Number(error.message.split(':')[1]) } as const;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code)
        ) {
          return { conflictRevision: input.expectedRevision ?? 1 } as const;
        }
        throw error;
      });
    if ('conflictRevision' in availability) {
      return conflict(`Availability revision is ${availability.conflictRevision}`);
    }
    return commerceResponse({
      item_id: item.id,
      location_id: location.id,
      is_available: availability.isAvailable,
      reason: availability.reason,
      revision: availability.revision,
      updated_at: availability.updatedAt,
    });
  } catch (error) {
    logger.warn('Commerce availability update failed', { error });
    return commerceError(error);
  }
}
