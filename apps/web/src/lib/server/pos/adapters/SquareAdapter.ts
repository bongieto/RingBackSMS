import { Client, Environment } from 'square';
import axios from 'axios';
import { BasePosAdapter, PosTokenData, PosOrderItem, PosOrderResult, SyncResult, getAppBaseUrl } from './base';
import { encrypt } from '../../encryption';
import { logger } from '../../logger';

function getSquareEnvironment(): Environment {
  return process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production
    : Environment.Sandbox;
}

function buildSquareClient(accessToken: string): Client {
  return new Client({
    accessToken,
    environment: getSquareEnvironment(),
  });
}

function getSquareBaseUrl(): string {
  return process.env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';
}

export class SquareAdapter extends BasePosAdapter {
  readonly provider = 'square';
  readonly displayName = 'Square';
  readonly authType = 'oauth' as const;

  getOAuthUrl(tenantId: string): string {
    const baseUrl = getSquareBaseUrl();

    const params = new URLSearchParams({
      client_id: (process.env.SQUARE_APPLICATION_ID || process.env.SQUARE_APP_ID) ?? '',
      scope:
        'MERCHANT_PROFILE_READ ITEMS_READ ITEMS_WRITE ORDERS_WRITE PAYMENTS_WRITE',
      state: tenantId,
      redirect_uri: `${getAppBaseUrl()}/api/integrations/square/callback`,
    });

    return `${baseUrl}/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCode(tenantId: string, code: string): Promise<void> {
    const baseUrl = getSquareBaseUrl();

    const response = await axios.post(
      `${baseUrl}/oauth2/token`,
      {
        client_id: (process.env.SQUARE_APPLICATION_ID || process.env.SQUARE_APP_ID),
        client_secret: (process.env.SQUARE_APPLICATION_SECRET || process.env.SQUARE_APP_SECRET),
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${getAppBaseUrl()}/api/integrations/square/callback`,
      },
      { headers: { 'Content-Type': 'application/json' } },
    );

    const data = response.data as {
      access_token: string;
      refresh_token: string;
      expires_at: string;
      merchant_id: string;
    };

    const client = buildSquareClient(data.access_token);
    const locationsResponse = await client.locationsApi.listLocations();
    const locationId = locationsResponse.result.locations?.[0]?.id ?? null;

    // Save to generic pos* fields via base adapter
    await this.saveTokens(tenantId, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(data.expires_at),
      locationId,
      merchantId: data.merchant_id,
    });

    // Backward compatibility: also write legacy square* fields
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        squareAccessToken: encrypt(data.access_token),
        squareRefreshToken: encrypt(data.refresh_token),
        squareTokenExpiresAt: new Date(data.expires_at),
        squareMerchantId: data.merchant_id,
        squareLocationId: locationId,
      },
    });

    logger.info('Square OAuth completed', {
      tenantId,
      merchantId: data.merchant_id,
    });
  }

  async refreshToken(tenantId: string): Promise<void> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens?.refreshToken) throw new Error('No Square refresh token');

    const baseUrl = getSquareBaseUrl();

    const response = await axios.post(
      `${baseUrl}/oauth2/token`,
      {
        client_id: (process.env.SQUARE_APPLICATION_ID || process.env.SQUARE_APP_ID),
        client_secret: (process.env.SQUARE_APPLICATION_SECRET || process.env.SQUARE_APP_SECRET),
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token',
      },
      { headers: { 'Content-Type': 'application/json' } },
    );

    const data = response.data as {
      access_token: string;
      refresh_token: string;
      expires_at: string;
    };

    await this.saveTokens(tenantId, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(data.expires_at),
      locationId: tokens.locationId,
      merchantId: tokens.merchantId,
    });

    // Backward compatibility
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        squareAccessToken: encrypt(data.access_token),
        squareRefreshToken: encrypt(data.refresh_token),
        squareTokenExpiresAt: new Date(data.expires_at),
      },
    });
  }

  async syncCatalogFromPOS(tenantId: string): Promise<SyncResult> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens) throw new Error('Tenant not connected to Square');

    const client = buildSquareClient(tokens.accessToken);

    // Fetch items, categories, and modifier lists in parallel
    const [itemsResponse, categoriesResponse, modifierListsResponse] = await Promise.all([
      client.catalogApi.listCatalog(undefined, 'ITEM'),
      client.catalogApi.listCatalog(undefined, 'CATEGORY'),
      client.catalogApi.listCatalog(undefined, 'MODIFIER_LIST'),
    ]);

    const items = itemsResponse.result.objects ?? [];
    const categories = categoriesResponse.result.objects ?? [];
    const modifierLists = modifierListsResponse.result.objects ?? [];

    // Build a lookup map: category ID → category name
    const categoryNameById = new Map<string, string>();
    for (const cat of categories) {
      const name = (cat as { categoryData?: { name?: string } }).categoryData?.name;
      if (cat.id && name) categoryNameById.set(cat.id, name);
    }

    // Build a lookup map: modifier list ID → modifier list data
    const modifierListMap = new Map<string, { name: string; selectionType: string; modifiers: Array<{ id: string; name: string; priceMoney?: { amount?: bigint; currency?: string } }> }>();
    for (const ml of modifierLists) {
      if (!ml.modifierListData) continue;
      modifierListMap.set(ml.id, {
        name: ml.modifierListData.name ?? 'Options',
        selectionType: ml.modifierListData.selectionType === 'MULTIPLE' ? 'MULTIPLE' : 'SINGLE',
        modifiers: (ml.modifierListData.modifiers ?? []).map((mod) => ({
          id: mod.id,
          name: mod.modifierData?.name ?? 'Option',
          priceMoney: mod.modifierData?.priceMoney as { amount?: bigint; currency?: string } | undefined,
        })),
      });
    }

    const result: SyncResult = { total: 0, newItems: 0, updated: 0, unchanged: 0, errors: 0 };

    for (const item of items) {
      if (!item.itemData) continue;

      try {
        const variation = item.itemData.variations?.[0];
        const priceMoney = variation?.itemVariationData?.priceMoney;
        const price = priceMoney ? Number(priceMoney.amount ?? 0) / 100 : 0;

        // Resolve the item's category name from Square. Square's older
        // API stores a single categoryId on itemData; newer responses
        // may use a `categories` array. Try both.
        const rawItemData = item.itemData as {
          categoryId?: string | null;
          categories?: Array<{ id?: string }> | null;
        };
        const categoryId =
          rawItemData.categoryId ?? rawItemData.categories?.[0]?.id ?? null;
        const category = categoryId
          ? categoryNameById.get(categoryId) ?? null
          : null;

        const existing = await this.prisma.menuItem.findFirst({
          where: { tenantId, posCatalogId: item.id },
        });

        const itemData = {
          name: item.itemData.name ?? 'Unnamed Item',
          description: item.itemData.description ?? null,
          price,
          category,
          posCatalogId: item.id,
          posVariationId: variation?.id ?? null,
          squareCatalogId: item.id,
          squareVariationId: variation?.id ?? null,
          lastSyncedAt: new Date(),
        };

        let menuItemId: string;

        if (existing) {
          const changed = existing.name !== itemData.name || existing.description !== itemData.description || Number(existing.price) !== itemData.price;
          await this.prisma.menuItem.update({ where: { id: existing.id }, data: itemData });
          if (changed) result.updated++; else result.unchanged++;
          menuItemId = existing.id;
        } else {
          const created = await this.prisma.menuItem.create({ data: { tenantId, isAvailable: true, ...itemData } });
          result.newItems++;
          menuItemId = created.id;
        }
        result.total++;

        // Sync modifier groups for this item
        const modifierListInfo = (item.itemData as Record<string, unknown>).modifierListInfo as Array<{ modifierListId: string; enabled?: boolean }> | undefined;
        if (modifierListInfo && modifierListInfo.length > 0) {
          await this.syncModifierGroups(menuItemId, modifierListInfo, modifierListMap);
        }
      } catch (err) {
        result.errors++;
        logger.warn('Failed to sync item from Square', { tenantId, itemId: item.id, error: (err as Error).message });
      }
    }

    logger.info('Catalog synced from Square', { tenantId, result });
    return result;
  }

  private async syncModifierGroups(
    menuItemId: string,
    modifierListInfo: Array<{ modifierListId: string; enabled?: boolean }>,
    modifierListMap: Map<string, { name: string; selectionType: string; modifiers: Array<{ id: string; name: string; priceMoney?: { amount?: bigint; currency?: string } }> }>,
  ): Promise<void> {
    // Get existing groups for this item
    const existingGroups = await this.prisma.menuItemModifierGroup.findMany({
      where: { menuItemId },
      include: { modifiers: true },
    });
    const existingGroupByPosId = new Map(existingGroups.filter((g) => g.posGroupId).map((g) => [g.posGroupId!, g]));

    const activePosGroupIds = new Set<string>();

    for (let sortOrder = 0; sortOrder < modifierListInfo.length; sortOrder++) {
      const info = modifierListInfo[sortOrder];
      if (info.enabled === false) continue;

      const mlData = modifierListMap.get(info.modifierListId);
      if (!mlData) continue;

      activePosGroupIds.add(info.modifierListId);

      const existingGroup = existingGroupByPosId.get(info.modifierListId);

      if (existingGroup) {
        // Update existing group
        await this.prisma.menuItemModifierGroup.update({
          where: { id: existingGroup.id },
          data: {
            name: mlData.name,
            selectionType: mlData.selectionType,
            required: mlData.selectionType === 'SINGLE',
            maxSelections: mlData.selectionType === 'MULTIPLE' ? mlData.modifiers.length : 1,
            sortOrder,
          },
        });

        // Sync modifiers within the group
        await this.syncModifiers(existingGroup.id, mlData.modifiers);
      } else {
        // Create new group with modifiers
        await this.prisma.menuItemModifierGroup.create({
          data: {
            menuItemId,
            name: mlData.name,
            selectionType: mlData.selectionType,
            required: mlData.selectionType === 'SINGLE',
            minSelections: mlData.selectionType === 'SINGLE' ? 1 : 0,
            maxSelections: mlData.selectionType === 'MULTIPLE' ? mlData.modifiers.length : 1,
            posGroupId: info.modifierListId,
            sortOrder,
            modifiers: {
              create: mlData.modifiers.map((mod, idx) => ({
                name: mod.name,
                priceAdjust: mod.priceMoney ? Number(mod.priceMoney.amount ?? 0) / 100 : 0,
                isDefault: idx === 0,
                posModifierId: mod.id,
                sortOrder: idx,
              })),
            },
          },
        });
      }
    }

    // Remove orphaned groups (no longer in POS)
    const orphanedGroups = existingGroups.filter((g) => g.posGroupId && !activePosGroupIds.has(g.posGroupId));
    if (orphanedGroups.length > 0) {
      await this.prisma.menuItemModifierGroup.deleteMany({
        where: { id: { in: orphanedGroups.map((g) => g.id) } },
      });
    }
  }

  private async syncModifiers(
    groupId: string,
    posModifiers: Array<{ id: string; name: string; priceMoney?: { amount?: bigint; currency?: string } }>,
  ): Promise<void> {
    const existing = await this.prisma.menuItemModifier.findMany({ where: { groupId } });
    const existingByPosId = new Map(existing.filter((m) => m.posModifierId).map((m) => [m.posModifierId!, m]));
    const activePosModIds = new Set<string>();

    for (let idx = 0; idx < posModifiers.length; idx++) {
      const mod = posModifiers[idx];
      activePosModIds.add(mod.id);
      const priceAdjust = mod.priceMoney ? Number(mod.priceMoney.amount ?? 0) / 100 : 0;

      const existingMod = existingByPosId.get(mod.id);
      if (existingMod) {
        await this.prisma.menuItemModifier.update({
          where: { id: existingMod.id },
          data: { name: mod.name, priceAdjust, sortOrder: idx },
        });
      } else {
        await this.prisma.menuItemModifier.create({
          data: { groupId, name: mod.name, priceAdjust, isDefault: idx === 0, posModifierId: mod.id, sortOrder: idx },
        });
      }
    }

    // Remove orphaned modifiers
    const orphaned = existing.filter((m) => m.posModifierId && !activePosModIds.has(m.posModifierId));
    if (orphaned.length > 0) {
      await this.prisma.menuItemModifier.deleteMany({ where: { id: { in: orphaned.map((m) => m.id) } } });
    }
  }

  async pushCatalogToPOS(tenantId: string): Promise<number> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens) throw new Error('Tenant not connected to Square');

    const client = buildSquareClient(tokens.accessToken);

    const menuItems = await this.prisma.menuItem.findMany({
      where: { tenantId, posCatalogId: null },
    });

    let pushedCount = 0;

    for (const item of menuItems) {
      const idempotencyKey = `ringback-${item.id}`;

      const response = await client.catalogApi.upsertCatalogObject({
        idempotencyKey,
        object: {
          type: 'ITEM',
          id: `#${item.id}`,
          itemData: {
            name: item.name,
            description: item.description ?? undefined,
            variations: [
              {
                type: 'ITEM_VARIATION',
                id: `#${item.id}-variation`,
                itemVariationData: {
                  name: 'Regular',
                  pricingType: 'FIXED_PRICING',
                  priceMoney: {
                    amount: BigInt(Math.round(Number(item.price) * 100)),
                    currency: 'USD',
                  },
                },
              },
            ],
          },
        },
      });

      const createdObject = response.result.catalogObject;
      if (createdObject?.id) {
        const variationId =
          createdObject.itemData?.variations?.[0]?.id ?? null;
        await this.prisma.menuItem.update({
          where: { id: item.id },
          data: {
            posCatalogId: createdObject.id,
            posVariationId: variationId,
            // Backward compatibility
            squareCatalogId: createdObject.id,
            squareVariationId: variationId,
            lastSyncedAt: new Date(),
          },
        });
        pushedCount++;
      }
    }

    logger.info('Catalog pushed to Square', { tenantId, count: pushedCount });
    return pushedCount;
  }

  async createOrder(
    tenantId: string,
    items: PosOrderItem[],
    metadata: { locationId: string; idempotencyKey: string },
  ): Promise<PosOrderResult> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens) throw new Error('Tenant not connected to Square');

    const client = buildSquareClient(tokens.accessToken);

    const response = await client.ordersApi.createOrder({
      order: {
        locationId: metadata.locationId,
        lineItems: items.map((item) => ({
          quantity: String(item.quantity),
          catalogObjectId: item.externalVariationId,
        })),
      },
      idempotencyKey: metadata.idempotencyKey,
    });

    const squareOrderId = response.result.order?.id;
    if (!squareOrderId) throw new Error('Square order creation failed');

    logger.info('Square order created', { tenantId, squareOrderId });
    return {
      externalOrderId: squareOrderId,
      raw: response.result as unknown as Record<string, unknown>,
    };
  }

  verifyWebhook(
    body: string,
    signature: string,
    context: Record<string, string>,
  ): boolean {
    const crypto = require('crypto') as typeof import('crypto');
    const sigKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? '';
    const notificationUrl = context.notificationUrl ?? '';
    const hmac = crypto.createHmac('sha256', sigKey);
    hmac.update(notificationUrl + body);
    const expected = hmac.digest('base64');
    return expected === signature;
  }
}
