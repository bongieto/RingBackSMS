import { NextRequest } from 'next/server';
import { BulkAvailabilityUpdateSchema, CommerceScopes } from '@ringback/shared-types';
import { Prisma } from '@prisma/client';
import { authenticateCommerceRequest } from '@/lib/server/commerce/apiAuth';
import { commerceError, commerceResponse, conflict } from '@/lib/server/commerce/http';
import { enqueueIntegrationEvent } from '@/lib/server/commerce/outbox';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: { locationId: string } }) {
  try {
    const auth = await authenticateCommerceRequest(request, [CommerceScopes.AVAILABILITY_WRITE]);
    const input = BulkAvailabilityUpdateSchema.parse(await request.json());
    const location = await prisma.tenantLocation.findFirst({
      where: { id: params.locationId, tenantId: auth.tenantId, isActive: true },
      select: { id: true },
    });
    if (!location) {
      return Response.json(
        { error: { code: 'not_found', message: 'Location not found' } },
        { status: 404 }
      );
    }
    const uniqueIds = [...new Set(input.items.map((item) => item.itemId))];
    if (uniqueIds.length !== input.items.length) {
      return Response.json(
        { error: { code: 'invalid_request', message: 'Duplicate item IDs are not allowed' } },
        { status: 400 }
      );
    }
    const ownedItems = await prisma.menuItem.count({
      where: { tenantId: auth.tenantId, id: { in: uniqueIds } },
    });
    if (ownedItems !== uniqueIds.length) {
      return Response.json(
        { error: { code: 'not_found', message: 'One or more menu items were not found' } },
        { status: 404 }
      );
    }

    const rows = await prisma
      .$transaction(
        async (tx) => {
          const currentRows = await tx.menuItemAvailability.findMany({
            where: { locationId: location.id, menuItemId: { in: uniqueIds } },
          });
          const currentByItem = new Map(currentRows.map((row) => [row.menuItemId, row]));
          for (const update of input.items) {
            const revision = currentByItem.get(update.itemId)?.revision ?? 1;
            if (update.expectedRevision && update.expectedRevision !== revision) {
              throw new Error(`AVAILABILITY_CONFLICT:${update.itemId}:${revision}`);
            }
          }
          const updated = [];
          for (const update of input.items) {
            const row = await tx.menuItemAvailability.upsert({
              where: {
                locationId_menuItemId: { locationId: location.id, menuItemId: update.itemId },
              },
              create: {
                tenantId: auth.tenantId,
                locationId: location.id,
                menuItemId: update.itemId,
                isAvailable: update.isAvailable,
                reason: update.reason ?? null,
                updatedBy: `api:${auth.credentialId}`,
              },
              update: {
                isAvailable: update.isAvailable,
                reason: update.reason ?? null,
                revision: { increment: 1 },
                updatedBy: `api:${auth.credentialId}`,
              },
            });
            updated.push(row);
          }
          await enqueueIntegrationEvent(tx, {
            tenantId: auth.tenantId,
            sourceConnectionId: auth.connectionId,
            type: 'menu.availability.updated',
            locationId: location.id,
            resourceType: 'menu',
            resourceId: location.id,
            data: {
              items: updated.map((row) => ({
                item_id: row.menuItemId,
                is_available: row.isAvailable,
                reason: row.reason,
                revision: row.revision,
              })),
            },
          });
          return updated;
        },
        { isolationLevel: 'Serializable' }
      )
      .catch((error) => {
        if (error instanceof Error && error.message.startsWith('AVAILABILITY_CONFLICT:')) {
          const [, itemId, revision] = error.message.split(':');
          return { conflict: { itemId, revision: Number(revision) } } as const;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code)
        ) {
          return { conflict: { itemId: null, revision: null } } as const;
        }
        throw error;
      });
    if (!Array.isArray(rows)) {
      return conflict(
        rows.conflict.itemId
          ? `Availability revision for ${rows.conflict.itemId} is ${rows.conflict.revision}`
          : 'Availability was updated concurrently; fetch the menu and retry'
      );
    }
    return commerceResponse(
      rows.map((row) => ({
        item_id: row.menuItemId,
        is_available: row.isAvailable,
        reason: row.reason,
        revision: row.revision,
        updated_at: row.updatedAt,
      }))
    );
  } catch (error) {
    logger.warn('Commerce bulk availability update failed', { error });
    return commerceError(error);
  }
}
