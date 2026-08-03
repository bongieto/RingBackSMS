import { NextRequest } from 'next/server';
import { CommerceScopes, MenuSnapshotSchema } from '@ringback/shared-types';
import { Prisma } from '@prisma/client';
import { authenticateCommerceRequest } from '@/lib/server/commerce/apiAuth';
import { commerceError, commerceResponse } from '@/lib/server/commerce/http';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';
import { enqueueIntegrationEvent } from '@/lib/server/commerce/outbox';
import { conflict } from '@/lib/server/commerce/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { locationId: string } }) {
  try {
    const auth = await authenticateCommerceRequest(request, [CommerceScopes.MENU_READ]);
    const location = await prisma.tenantLocation.findFirst({
      where: { id: params.locationId, tenantId: auth.tenantId, isActive: true },
      select: { id: true, name: true, updatedAt: true },
    });
    if (!location) {
      return Response.json(
        { error: { code: 'not_found', message: 'Location not found' } },
        { status: 404 }
      );
    }
    const items = await prisma.menuItem.findMany({
      where: { tenantId: auth.tenantId, posDeletedAt: null },
      orderBy: [{ categoryRef: { sortOrder: 'asc' } }, { name: 'asc' }],
      include: {
        categoryRef: { select: { id: true, name: true, isAvailable: true, sortOrder: true } },
        modifierGroups: {
          orderBy: { sortOrder: 'asc' },
          include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
        },
        locationAvailability: { where: { locationId: location.id } },
      },
    });
    const revision = items.reduce((max, item) => {
      const availability = item.locationAvailability[0];
      return Math.max(max, availability?.revision ?? 1);
    }, 1);
    return commerceResponse({
      location,
      revision,
      items: items.map((item) => {
        const availability = item.locationAvailability[0];
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          price: Number(item.price),
          category: item.categoryRef ?? (item.category ? { id: null, name: item.category } : null),
          is_available: item.isAvailable && (availability?.isAvailable ?? true),
          availability_reason: availability?.reason ?? null,
          availability_revision: availability?.revision ?? 1,
          updated_at: item.updatedAt,
          modifier_groups: item.modifierGroups.map((group) => ({
            id: group.id,
            name: group.name,
            required: group.required,
            min_selections: group.minSelections,
            max_selections: group.maxSelections,
            options: group.modifiers.map((modifier) => ({
              id: modifier.id,
              name: modifier.name,
              price_adjustment: Number(modifier.priceAdjust),
              is_default: modifier.isDefault,
            })),
          })),
        };
      }),
    });
  } catch (error) {
    logger.warn('Commerce menu request failed', { error });
    return commerceError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: { locationId: string } }) {
  try {
    const auth = await authenticateCommerceRequest(request, [CommerceScopes.MENU_WRITE]);
    if (!auth.connectionId) {
      return Response.json(
        {
          error: {
            code: 'invalid_connection',
            message: 'Credential is not linked to an integration connection',
          },
        },
        { status: 403 }
      );
    }
    const input = MenuSnapshotSchema.parse(await request.json());
    const categoryExternalIds = input.categories.map((category) => category.externalId);
    const itemExternalIds = input.items.map((item) => item.externalId);
    if (
      new Set(categoryExternalIds).size !== categoryExternalIds.length ||
      new Set(itemExternalIds).size !== itemExternalIds.length
    ) {
      return Response.json(
        { error: { code: 'invalid_request', message: 'Duplicate external IDs are not allowed' } },
        { status: 400 }
      );
    }
    const knownCategoryIds = new Set(categoryExternalIds);
    if (
      input.items.some(
        (item) => item.categoryExternalId && !knownCategoryIds.has(item.categoryExternalId)
      )
    ) {
      return Response.json(
        {
          error: {
            code: 'invalid_request',
            message: 'An item references an unknown categoryExternalId',
          },
        },
        { status: 400 }
      );
    }
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

    const result = await prisma
      .$transaction(
        async (tx) => {
          const existingMappings = await tx.externalResourceMapping.findMany({
            where: {
              connectionId: auth.connectionId!,
              resourceType: { in: ['menu_category', 'menu_item'] },
            },
          });
          const categoryMappings = new Map(
            existingMappings
              .filter((mapping) => mapping.resourceType === 'menu_category')
              .map((mapping) => [mapping.externalId, mapping])
          );
          const itemMappings = new Map(
            existingMappings
              .filter((mapping) => mapping.resourceType === 'menu_item')
              .map((mapping) => [mapping.externalId, mapping])
          );
          const categoryInternalIds = new Map<string, string>();
          for (const category of input.categories) {
            const mapping = categoryMappings.get(category.externalId);
            let row = mapping
              ? await tx.menuCategory.findFirst({
                  where: { id: mapping.internalId, tenantId: auth.tenantId },
                })
              : null;
            if (row) {
              row = await tx.menuCategory.update({
                where: { id: row.id },
                data: {
                  name: category.name,
                  sortOrder: category.sortOrder,
                  isAvailable: category.isAvailable,
                },
              });
            } else {
              row = await tx.menuCategory.upsert({
                where: { tenantId_name: { tenantId: auth.tenantId, name: category.name } },
                create: {
                  tenantId: auth.tenantId,
                  name: category.name,
                  sortOrder: category.sortOrder,
                  isAvailable: category.isAvailable,
                },
                update: { sortOrder: category.sortOrder, isAvailable: category.isAvailable },
              });
            }
            categoryInternalIds.set(category.externalId, row.id);
            await tx.externalResourceMapping.upsert({
              where: {
                connectionId_resourceType_externalId: {
                  connectionId: auth.connectionId!,
                  resourceType: 'menu_category',
                  externalId: category.externalId,
                },
              },
              create: {
                tenantId: auth.tenantId,
                connectionId: auth.connectionId!,
                resourceType: 'menu_category',
                internalId: row.id,
                externalId: category.externalId,
                externalVersion: input.revision,
                lastSyncedAt: new Date(),
              },
              update: {
                internalId: row.id,
                externalVersion: input.revision,
                lastSyncedAt: new Date(),
              },
            });
          }

          const activeItemIds: string[] = [];
          let created = 0;
          let updated = 0;
          for (const item of input.items) {
            const mapping = itemMappings.get(item.externalId);
            const existing = mapping
              ? await tx.menuItem.findFirst({
                  where: { id: mapping.internalId, tenantId: auth.tenantId },
                })
              : null;
            const categoryId = item.categoryExternalId
              ? (categoryInternalIds.get(item.categoryExternalId) ?? null)
              : null;
            const row = existing
              ? await tx.menuItem.update({
                  where: { id: existing.id },
                  data: {
                    name: item.name,
                    description: item.description ?? null,
                    price: item.price,
                    categoryId,
                    category: item.categoryExternalId
                      ? (input.categories.find(
                          (category) => category.externalId === item.categoryExternalId
                        )?.name ?? null)
                      : null,
                    imageUrl: item.imageUrl ?? null,
                    isAvailable: true,
                    posDeletedAt: null,
                  },
                })
              : await tx.menuItem.create({
                  data: {
                    tenantId: auth.tenantId,
                    name: item.name,
                    description: item.description ?? null,
                    price: item.price,
                    categoryId,
                    category: item.categoryExternalId
                      ? (input.categories.find(
                          (category) => category.externalId === item.categoryExternalId
                        )?.name ?? null)
                      : null,
                    imageUrl: item.imageUrl ?? null,
                    isAvailable: true,
                  },
                });
            existing ? (updated += 1) : (created += 1);
            activeItemIds.push(row.id);
            await tx.menuItemModifierGroup.deleteMany({ where: { menuItemId: row.id } });
            for (const group of item.modifierGroups) {
              await tx.menuItemModifierGroup.create({
                data: {
                  menuItemId: row.id,
                  name: group.name,
                  required: group.required,
                  minSelections: group.minSelections,
                  maxSelections: group.maxSelections,
                  selectionType: group.maxSelections === 1 ? 'SINGLE' : 'MULTIPLE',
                  sortOrder: group.sortOrder,
                  modifiers: {
                    create: group.options.map((option) => ({
                      name: option.name,
                      priceAdjust: option.priceAdjustment,
                      isDefault: option.isDefault,
                      sortOrder: option.sortOrder,
                      posModifierId: option.externalId,
                    })),
                  },
                },
              });
            }
            await tx.menuItemAvailability.upsert({
              where: { locationId_menuItemId: { locationId: location.id, menuItemId: row.id } },
              create: {
                tenantId: auth.tenantId,
                locationId: location.id,
                menuItemId: row.id,
                isAvailable: item.isAvailable,
                updatedBy: `api:${auth.credentialId}`,
              },
              update: {
                isAvailable: item.isAvailable,
                reason: item.isAvailable ? null : 'Unavailable in source menu',
                revision: { increment: 1 },
                updatedBy: `api:${auth.credentialId}`,
              },
            });
            await tx.externalResourceMapping.upsert({
              where: {
                connectionId_resourceType_externalId: {
                  connectionId: auth.connectionId!,
                  resourceType: 'menu_item',
                  externalId: item.externalId,
                },
              },
              create: {
                tenantId: auth.tenantId,
                connectionId: auth.connectionId!,
                resourceType: 'menu_item',
                internalId: row.id,
                externalId: item.externalId,
                externalVersion: input.revision,
                lastSyncedAt: new Date(),
              },
              update: {
                internalId: row.id,
                externalVersion: input.revision,
                lastSyncedAt: new Date(),
              },
            });
          }

          const removedMappings = existingMappings.filter(
            (mapping) =>
              mapping.resourceType === 'menu_item' && !itemExternalIds.includes(mapping.externalId)
          );
          if (removedMappings.length > 0) {
            await tx.menuItemAvailability.updateMany({
              where: {
                locationId: location.id,
                menuItemId: { in: removedMappings.map((mapping) => mapping.internalId) },
              },
              data: {
                isAvailable: false,
                reason: 'Removed from source menu',
                revision: { increment: 1 },
                updatedBy: `api:${auth.credentialId}`,
              },
            });
          }
          await enqueueIntegrationEvent(tx, {
            tenantId: auth.tenantId,
            sourceConnectionId: auth.connectionId,
            type: 'menu.updated',
            locationId: location.id,
            resourceType: 'menu',
            resourceId: location.id,
            data: {
              revision: input.revision,
              created,
              updated,
              unavailable: removedMappings.length,
              item_ids: activeItemIds,
            },
          });
          return {
            revision: input.revision,
            created,
            updated,
            unavailable: removedMappings.length,
            total: input.items.length,
          };
        },
        { isolationLevel: 'Serializable', maxWait: 5_000, timeout: 30_000 }
      )
      .catch((error) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code)
        ) {
          return null;
        }
        throw error;
      });
    if (!result)
      return conflict(
        'Menu was updated concurrently or contains a conflicting name; fetch and retry'
      );
    return commerceResponse(result);
  } catch (error) {
    logger.warn('Commerce menu snapshot update failed', { error });
    return commerceError(error);
  }
}
