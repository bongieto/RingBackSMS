import { NextRequest } from 'next/server';
import { CommerceScopes, MenuSnapshotSchema } from '@ringback/shared-types';
import { Prisma } from '@prisma/client';
import { authenticateCommerceRequest } from '@/lib/server/commerce/apiAuth';
import { commerceError, commerceResponse } from '@/lib/server/commerce/http';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';
import { enqueueIntegrationEvent } from '@/lib/server/commerce/outbox';
import { conflict } from '@/lib/server/commerce/http';
import {
  decideSnapshot,
  deterministicIntegrationUuid,
  hasDuplicateMenuExternalIds,
  isDeterministicIntegrationMenu,
} from '@/lib/server/commerce/syncVersion';

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
      orderBy: [{ categoryRef: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { name: 'asc' }],
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
            conditions: Array.isArray(group.conditions) ? group.conditions : [],
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
    if (hasDuplicateMenuExternalIds(input)) {
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
          const cursor = await tx.menuSyncCursor.findUnique({
            where: {
              connectionId_locationId: {
                connectionId: auth.connectionId!,
                locationId: location.id,
              },
            },
          });
          const snapshotDecision = decideSnapshot(cursor, input);
          if (snapshotDecision === 'stale') {
            return {
              conflict: `Stale menu sequence ${input.sequence}; current sequence is ${cursor!.sequence}`,
            };
          }
          if (snapshotDecision === 'conflict') {
            return { conflict: 'Menu sequence was reused with different content' };
          }
          if (snapshotDecision === 'idempotent') {
            return {
              revision: cursor!.revision,
              sequence: cursor!.sequence,
              checksum: cursor!.checksum,
              created: 0,
              updated: 0,
              unavailable: 0,
              total: input.items.length,
              idempotent: true,
            };
          }
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
          const [tenantCategoryCount, tenantItemCount] = await Promise.all([
            tx.menuCategory.count({ where: { tenantId: auth.tenantId } }),
            tx.menuItem.count({ where: { tenantId: auth.tenantId } }),
          ]);
          const tenantMenuIsIntegrationManaged = isDeterministicIntegrationMenu(
            auth.connectionId!,
            existingMappings,
            tenantCategoryCount,
            tenantItemCount
          );
          if (tenantMenuIsIntegrationManaged) {
            const categoryIdByExternalId = new Map(
              input.categories.map((category) => [
                category.externalId,
                deterministicIntegrationUuid(
                  `${auth.connectionId}:menu-category:${category.externalId}`
                ),
              ])
            );
            const itemIdByExternalId = new Map(
              input.items.map((item) => [
                item.externalId,
                deterministicIntegrationUuid(`${auth.connectionId}:menu-item:${item.externalId}`),
              ])
            );
            const categoryNameByExternalId = new Map(
              input.categories.map((category) => [category.externalId, category.name])
            );
            for (const category of input.categories) {
              const id = categoryIdByExternalId.get(category.externalId)!;
              await tx.menuCategory.upsert({
                where: { id },
                create: {
                  id,
                  tenantId: auth.tenantId,
                  name: category.name,
                  sortOrder: category.sortOrder,
                  isAvailable: category.isAvailable,
                },
                update: {
                  name: category.name,
                  sortOrder: category.sortOrder,
                  isAvailable: category.isAvailable,
                },
              });
            }
            for (const [index, item] of input.items.entries()) {
              const id = itemIdByExternalId.get(item.externalId)!;
              const data = {
                name: item.name,
                description: item.description ?? null,
                price: item.price,
                categoryId: item.categoryExternalId
                  ? (categoryIdByExternalId.get(item.categoryExternalId) ?? null)
                  : null,
                category: item.categoryExternalId
                  ? (categoryNameByExternalId.get(item.categoryExternalId) ?? null)
                  : null,
                sortOrder: index,
                imageUrl: item.imageUrl ?? null,
                isAvailable: true,
                posDeletedAt: null,
              };
              await tx.menuItem.upsert({
                where: { id },
                create: { id, tenantId: auth.tenantId, ...data },
                update: data,
              });
            }
            const groupRows = input.items.flatMap((item) => {
              const menuItemId = itemIdByExternalId.get(item.externalId)!;
              return item.modifierGroups.map((group) => ({
                id: deterministicIntegrationUuid(
                  `${auth.connectionId}:menu-group:${item.externalId}:${group.externalId}`
                ),
                menuItemId,
                name: group.name,
                required: group.required,
                minSelections: group.minSelections,
                maxSelections: group.maxSelections,
                selectionType: group.maxSelections === 1 ? 'SINGLE' : 'MULTIPLE',
                sortOrder: group.sortOrder,
                posGroupId: group.externalId,
                conditions: group.conditions as Prisma.InputJsonValue,
              }));
            });
            await tx.menuItemModifierGroup.deleteMany({
              where: { menuItemId: { in: [...itemIdByExternalId.values()] } },
            });
            if (groupRows.length > 0) {
              await tx.menuItemModifierGroup.createMany({ data: groupRows });
            }
            const optionRows = input.items.flatMap((item) =>
              item.modifierGroups.flatMap((group) => {
                const groupId = deterministicIntegrationUuid(
                  `${auth.connectionId}:menu-group:${item.externalId}:${group.externalId}`
                );
                return group.options.map((option) => ({
                  id: deterministicIntegrationUuid(
                    `${auth.connectionId}:menu-option:${item.externalId}:${group.externalId}:${option.externalId}`
                  ),
                  groupId,
                  name: option.name,
                  priceAdjust: option.priceAdjustment,
                  isDefault: option.isDefault,
                  sortOrder: option.sortOrder,
                  posModifierId: option.externalId,
                }));
              })
            );
            if (optionRows.length > 0) {
              await tx.menuItemModifier.createMany({ data: optionRows });
            }
            for (const item of input.items) {
              const menuItemId = itemIdByExternalId.get(item.externalId)!;
              await tx.menuItemAvailability.upsert({
                where: { locationId_menuItemId: { locationId: location.id, menuItemId } },
                create: {
                  tenantId: auth.tenantId,
                  locationId: location.id,
                  menuItemId,
                  isAvailable: item.isAvailable,
                  reason: item.isAvailable ? null : 'Unavailable in source menu',
                  updatedBy: `api:${auth.credentialId}`,
                },
                update: {
                  isAvailable: item.isAvailable,
                  reason: item.isAvailable ? null : 'Unavailable in source menu',
                  revision: { increment: 1 },
                  updatedBy: `api:${auth.credentialId}`,
                },
              });
            }
            const mappingRows = [
              ...input.categories.map((category) => ({
                tenantId: auth.tenantId,
                connectionId: auth.connectionId!,
                resourceType: 'menu_category',
                internalId: categoryIdByExternalId.get(category.externalId)!,
                externalId: category.externalId,
                externalVersion: input.revision,
                lastSyncedAt: new Date(),
              })),
              ...input.items.map((item) => ({
                tenantId: auth.tenantId,
                connectionId: auth.connectionId!,
                resourceType: 'menu_item',
                internalId: itemIdByExternalId.get(item.externalId)!,
                externalId: item.externalId,
                externalVersion: input.revision,
                lastSyncedAt: new Date(),
              })),
            ];
            if (mappingRows.length > 0) {
              await tx.externalResourceMapping.createMany({
                data: mappingRows,
                skipDuplicates: true,
              });
            }
            await tx.externalResourceMapping.updateMany({
              where: {
                connectionId: auth.connectionId!,
                resourceType: 'menu_category',
                externalId: { in: categoryExternalIds },
              },
              data: { externalVersion: input.revision, lastSyncedAt: new Date() },
            });
            await tx.externalResourceMapping.updateMany({
              where: {
                connectionId: auth.connectionId!,
                resourceType: 'menu_item',
                externalId: { in: itemExternalIds },
              },
              data: { externalVersion: input.revision, lastSyncedAt: new Date() },
            });
            const removedMappings = existingMappings.filter(
              (mapping) =>
                mapping.resourceType === 'menu_item' &&
                !itemExternalIds.includes(mapping.externalId)
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
            const created = input.items.filter((item) => !itemMappings.has(item.externalId)).length;
            const updated = input.items.length - created;
            await enqueueIntegrationEvent(tx, {
              tenantId: auth.tenantId,
              sourceConnectionId: auth.connectionId,
              type: 'menu.updated',
              locationId: location.id,
              resourceType: 'menu',
              resourceId: location.id,
              data: {
                revision: input.revision,
                sequence: input.sequence,
                checksum: input.checksum,
                created,
                updated,
                unavailable: removedMappings.length,
                item_ids: [...itemIdByExternalId.values()],
              },
            });
            await tx.menuSyncCursor.upsert({
              where: {
                connectionId_locationId: {
                  connectionId: auth.connectionId!,
                  locationId: location.id,
                },
              },
              create: {
                tenantId: auth.tenantId,
                connectionId: auth.connectionId!,
                locationId: location.id,
                revision: input.revision,
                sequence: input.sequence,
                checksum: input.checksum,
              },
              update: {
                revision: input.revision,
                sequence: input.sequence,
                checksum: input.checksum,
              },
            });
            return {
              revision: input.revision,
              sequence: input.sequence,
              checksum: input.checksum,
              created,
              updated,
              unavailable: removedMappings.length,
              total: input.items.length,
            };
          }
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
            const existingGroups = await tx.menuItemModifierGroup.findMany({
              where: { menuItemId: row.id },
              include: { modifiers: true },
            });
            const retainedGroupIds: string[] = [];
            for (const group of item.modifierGroups) {
              const existingGroup = existingGroups.find(
                (candidate) => candidate.posGroupId === group.externalId
              );
              const groupData = {
                menuItemId: row.id,
                name: group.name,
                required: group.required,
                minSelections: group.minSelections,
                maxSelections: group.maxSelections,
                selectionType: group.maxSelections === 1 ? 'SINGLE' : 'MULTIPLE',
                sortOrder: group.sortOrder,
                posGroupId: group.externalId,
                conditions: group.conditions as Prisma.InputJsonValue,
              };
              const groupRow = existingGroup
                ? await tx.menuItemModifierGroup.update({
                    where: { id: existingGroup.id },
                    data: groupData,
                  })
                : await tx.menuItemModifierGroup.create({ data: groupData });
              retainedGroupIds.push(groupRow.id);
              const existingOptions = existingGroup?.modifiers ?? [];
              const retainedOptionIds: string[] = [];
              for (const option of group.options) {
                const existingOption = existingOptions.find(
                  (candidate) => candidate.posModifierId === option.externalId
                );
                const optionData = {
                  name: option.name,
                  priceAdjust: option.priceAdjustment,
                  isDefault: option.isDefault,
                  sortOrder: option.sortOrder,
                  posModifierId: option.externalId,
                };
                const optionRow = existingOption
                  ? await tx.menuItemModifier.update({
                      where: { id: existingOption.id },
                      data: optionData,
                    })
                  : await tx.menuItemModifier.create({
                      data: { ...optionData, groupId: groupRow.id },
                    });
                retainedOptionIds.push(optionRow.id);
              }
              await tx.menuItemModifier.deleteMany({
                where: {
                  groupId: groupRow.id,
                  ...(retainedOptionIds.length > 0 ? { id: { notIn: retainedOptionIds } } : {}),
                },
              });
            }
            await tx.menuItemModifierGroup.deleteMany({
              where: {
                menuItemId: row.id,
                ...(retainedGroupIds.length > 0 ? { id: { notIn: retainedGroupIds } } : {}),
              },
            });
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
              sequence: input.sequence,
              checksum: input.checksum,
              created,
              updated,
              unavailable: removedMappings.length,
              item_ids: activeItemIds,
            },
          });
          await tx.menuSyncCursor.upsert({
            where: {
              connectionId_locationId: {
                connectionId: auth.connectionId!,
                locationId: location.id,
              },
            },
            create: {
              tenantId: auth.tenantId,
              connectionId: auth.connectionId!,
              locationId: location.id,
              revision: input.revision,
              sequence: input.sequence,
              checksum: input.checksum,
            },
            update: {
              revision: input.revision,
              sequence: input.sequence,
              checksum: input.checksum,
            },
          });
          return {
            revision: input.revision,
            sequence: input.sequence,
            checksum: input.checksum,
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
    if ('conflict' in result) return conflict(result.conflict!);
    return commerceResponse(result);
  } catch (error) {
    logger.warn('Commerce menu snapshot update failed', { error });
    return commerceError(error);
  }
}
