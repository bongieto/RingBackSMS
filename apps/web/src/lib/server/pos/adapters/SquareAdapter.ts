import { Client, Environment, CatalogObject } from 'square';
import axios from 'axios';
import { createHash } from 'crypto';
import { BasePosAdapter, PosTokenData, PosOrderItem, PosOrderResult, SyncResult, getAppBaseUrl } from './base';
import { encrypt } from '../../encryption';
import { logger } from '../../logger';

function getSquareEnvironment(): Environment {
  // Default to Production — our prod deploy pushes real orders to real
  // Square merchants. Devs who want sandbox must set
  // SQUARE_ENVIRONMENT=sandbox explicitly.
  //
  // Prior default was sandbox, which silently routed every live order
  // to Square's test environment — operators couldn't find their
  // orders in the real Square Dashboard and thought the integration
  // was broken. Flip to production-by-default fails closed the safer
  // direction.
  return process.env.SQUARE_ENVIRONMENT === 'sandbox'
    ? Environment.Sandbox
    : Environment.Production;
}

function buildSquareClient(accessToken: string): Client {
  return new Client({
    accessToken,
    environment: getSquareEnvironment(),
  });
}

function getSquareBaseUrl(): string {
  // Same default-to-production flip as getSquareEnvironment above —
  // sandbox only when explicitly opted in.
  return process.env.SQUARE_ENVIRONMENT === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';
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

    // Snapshot sync start-time so that after we've processed every
    // item Square returned, we can identify rows whose lastSyncedAt is
    // older than the snapshot — those items were previously linked to
    // Square but aren't in the current catalog (deleted or archived
    // server-side).
    const syncStartedAt = new Date();

    const client = buildSquareClient(tokens.accessToken);

    // Square's listCatalog is paginated — the SDK returns up to ~100-1000
    // objects per page and gives us a cursor for the next page. We
    // previously only fetched page 1, which silently dropped every item
    // past the first page. Loop until the cursor is empty.
    const listAll = async (type: 'ITEM' | 'CATEGORY' | 'MODIFIER_LIST'): Promise<CatalogObject[]> => {
      const out: CatalogObject[] = [];
      let cursor: string | undefined = undefined;
      // Safety cap: 50 pages × ~1000 objects = 50k per type. Way past any
      // realistic catalog. Prevents an infinite loop if Square glitches.
      for (let page = 0; page < 50; page++) {
        const resp = await client.catalogApi.listCatalog(cursor, type);
        if (resp.result.objects) out.push(...resp.result.objects);
        cursor = resp.result.cursor;
        if (!cursor) break;
      }
      return out;
    };

    const [items, categories, modifierLists] = await Promise.all([
      listAll('ITEM'),
      listAll('CATEGORY'),
      listAll('MODIFIER_LIST'),
    ]);
    logger.info('Square catalog fetched', {
      tenantId,
      items: items.length,
      categories: categories.length,
      modifierLists: modifierLists.length,
    });

    // Build a lookup map: category ID → category name
    const categoryNameById = new Map<string, string>();
    for (const cat of categories) {
      const name = (cat as { categoryData?: { name?: string } }).categoryData?.name;
      if (cat.id && name) categoryNameById.set(cat.id, name);
    }

    // Pre-populate our MenuCategory rows for each Square category so
    // every synced item can link via MenuItem.categoryId (FK). Without
    // this, dashboard category filters (which match by categoryId UUID)
    // miss Square-synced items even when their `category` string is
    // correct. Upsert is safe — unique on (tenantId, name).
    const menuCategoryIdByName = new Map<string, string>();
    for (const name of new Set(categoryNameById.values())) {
      const row = await this.prisma.menuCategory.upsert({
        where: { tenantId_name: { tenantId, name } },
        create: { tenantId, name, sortOrder: 0, isAvailable: true },
        update: {}, // leave isAvailable + sortOrder as operator set them
        select: { id: true },
      });
      menuCategoryIdByName.set(name, row.id);
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

    const result: SyncResult = {
      total: 0,
      newItems: 0,
      updated: 0,
      unchanged: 0,
      errors: 0,
      reconciled: 0,
      tombstoned: 0,
      restored: 0,
      duplicates: [],
    };

    // Preload all orphans (POS-unlinked MenuItems) for this tenant so
    // the per-item reconciliation loop below can match by normalized
    // name in-memory rather than running a Prisma findFirst per Square
    // item. Reduces ~N*2 DB queries to 1 for tenants with many items.
    const orphans = await this.prisma.menuItem.findMany({
      where: { tenantId, posCatalogId: null, squareCatalogId: null },
      select: { id: true, name: true, price: true },
    });
    // Normalize: lowercase, strip leading menu-number prefix, strip
    // trailing ingredient-description parens, collapse whitespace.
    // Handles "Kanto Fries", "#A6 Kanto Fries", and
    // "#A5 Kanto Balls Sampler (Kikiam, Squid Ball, Fish Ball)" all
    // mapping to the same canonical key.
    const normalizeName = (n: string): string =>
      n
        .toLowerCase()
        .replace(/^\s*#?[a-z]{0,3}\d+\.?\s+/i, '') // "#a6 ", "#lb13 ", "a1. ", "3. "
        .replace(/^\s*#\d+\s+/i, '') // "#8 "
        .replace(/\s*\([^)]*\)\s*$/g, '') // trailing " (...)"
        .replace(/\s+/g, ' ')
        .trim();
    const orphansByNormName = new Map<string, typeof orphans>();
    for (const o of orphans) {
      const key = normalizeName(o.name);
      if (!orphansByNormName.has(key)) orphansByNormName.set(key, []);
      orphansByNormName.get(key)!.push(o);
    }
    // Track which orphan IDs have already been claimed this sync so
    // two Square items with the same normalized name don't both try to
    // stamp onto one orphan row.
    const claimedOrphanIds = new Set<string>();

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
        // FK to our MenuCategory row (so dashboard category filters
        // match Square-synced items). Upsert happened earlier in
        // menuCategoryIdByName preload.
        const categoryFkId = category ? menuCategoryIdByName.get(category) ?? null : null;

        // Match strategy, most-to-least specific:
        //   1. posCatalogId match — the normal case. Square item was
        //      previously synced; find its existing row.
        //   2. Normalized-name + price match against the preloaded
        //      orphan map (POS-unlinked rows). Normalization strips
        //      common Square prefix/suffix patterns so e.g.
        //      "Kanto Fries" orphan links to "#A6 Kanto Fries" Square
        //      item. Price guardrail (within 25%) prevents false
        //      positives across similarly-named items.
        //   3. Neither matches → genuinely new item, create.
        let existing = await this.prisma.menuItem.findFirst({
          where: { tenantId, posCatalogId: item.id },
        });
        let reconciledFromOrphan = false;
        const resolvedName = item.itemData.name ?? 'Unnamed Item';
        if (!existing) {
          const normKey = normalizeName(resolvedName);
          const candidates = orphansByNormName.get(normKey) ?? [];
          const match = candidates.find((c) => {
            if (claimedOrphanIds.has(c.id)) return false;
            const ourPrice = Number(c.price);
            if (price <= 0 || ourPrice <= 0) return true; // no price signal → trust the name
            const ratio = Math.abs(ourPrice - price) / Math.max(ourPrice, price);
            return ratio <= 0.25;
          });
          if (match) {
            // Fetch the full row so we have all fields for the update
            // below (changed-detection compares description etc.).
            existing = await this.prisma.menuItem.findUnique({ where: { id: match.id } });
            if (existing) {
              reconciledFromOrphan = true;
              claimedOrphanIds.add(match.id);
            }
          }
        }

        // Fields that ALWAYS sync (safe to refresh from Square every time).
        // `isAvailable` is intentionally NOT in this list — operators
        // curate the public menu in RingbackSMS and don't want Square
        // pulls to re-enable items they've hidden.
        const itemData = {
          name: resolvedName,
          description: item.itemData.description ?? null,
          price,
          category,
          categoryId: categoryFkId, // FK — populated so dashboard category filters match
          posCatalogId: item.id,
          posVariationId: variation?.id ?? null,
          squareCatalogId: item.id,
          squareVariationId: variation?.id ?? null,
          lastSyncedAt: new Date(),
        };

        let menuItemId: string;

        if (existing) {
          const changed =
            existing.name !== itemData.name ||
            existing.description !== itemData.description ||
            Number(existing.price) !== itemData.price ||
            reconciledFromOrphan; // stamping Square IDs onto an orphan counts as a change
          await this.prisma.menuItem.update({
            where: { id: existing.id },
            data: itemData, // NOTE: does NOT include isAvailable
          });
          if (reconciledFromOrphan) {
            logger.info('Square sync reconciled orphan item by name', {
              tenantId,
              menuItemId: existing.id,
              name: resolvedName,
              squareCatalogId: item.id,
            });
            result.reconciled = (result.reconciled ?? 0) + 1;
          }
          if (changed) result.updated++; else result.unchanged++;
          menuItemId = existing.id;
        } else {
          // New items default to DISABLED. RingbackSMS is the canonical
          // curated menu; operators opt individual Square items in from
          // /dashboard/menu → Items tab. Prevents a Pull from POS from
          // silently flooding the customer-facing menu.
          const created = await this.prisma.menuItem.create({
            data: { tenantId, isAvailable: false, ...itemData },
          });
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

    // Tombstone sweep: find Square-linked items whose lastSyncedAt is
    // older than syncStartedAt → these weren't in the current catalog
    // → Square has deleted or archived them. Mark posDeletedAt +
    // isAvailable=false so they vanish from customer-facing surfaces
    // but stay in the DB for historical Order.items references.
    //
    // If an item ever reappears in Square, the normal sync path will
    // re-match by posCatalogId and update lastSyncedAt; we then clear
    // posDeletedAt below (un-tombstone).
    try {
      const tombstoned = await this.prisma.menuItem.updateMany({
        where: {
          tenantId,
          squareCatalogId: { not: null },
          lastSyncedAt: { lt: syncStartedAt },
          posDeletedAt: null,
        },
        data: { isAvailable: false, posDeletedAt: new Date() },
      });
      result.tombstoned = tombstoned.count;
      if (tombstoned.count > 0) {
        logger.info('Square sync tombstoned items no longer in catalog', {
          tenantId,
          count: tombstoned.count,
        });
      }
      // Un-tombstone items that came back in the current sync (fresh
      // lastSyncedAt ≥ syncStartedAt AND previously had posDeletedAt).
      const restored = await this.prisma.menuItem.updateMany({
        where: {
          tenantId,
          squareCatalogId: { not: null },
          lastSyncedAt: { gte: syncStartedAt },
          posDeletedAt: { not: null },
        },
        data: { posDeletedAt: null },
      });
      result.restored = restored.count;
      if (restored.count > 0) {
        logger.info('Square sync restored previously tombstoned items', {
          tenantId,
          count: restored.count,
        });
      }

      // Duplicate detection: same name appearing more than once across
      // the live menu (not counting tombstoned rows). Typically caused
      // by operator renaming in Square without deleting the original —
      // our sync pulls both and stamps different posCatalogIds on each.
      // Surface the duplicate list so the Import tab can show a merge
      // banner.
      const dupRows = await this.prisma.menuItem.groupBy({
        by: ['name'],
        where: { tenantId, posDeletedAt: null },
        _count: { name: true },
      });
      result.duplicates = dupRows
        .filter((r) => r._count.name > 1)
        .map((r) => ({ name: r.name, count: r._count.name }));
      if (result.duplicates.length > 0) {
        logger.info('Square sync found duplicate menu-item names', {
          tenantId,
          duplicates: result.duplicates,
        });
      }
    } catch (err) {
      logger.warn('Tombstone sweep failed (sync result itself still valid)', {
        tenantId,
        err: (err as Error).message,
      });
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

  // Push-to-POS removed: the POS is now the authoritative source of menu
  // data (Pull-only). If we ever need to push RingbackSMS-authored items
  // back out we can re-add, but that direction caused operator confusion
  // about which system owns the catalog.

  async createOrder(
    tenantId: string,
    items: PosOrderItem[],
    metadata: {
      locationId: string;
      idempotencyKey: string;
      totalCents?: number;
      externalSource?: string;
      externalSourceId?: string;
      customerName?: string | null;
      pickupTime?: string | null;
    },
  ): Promise<PosOrderResult> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens) throw new Error('Tenant not connected to Square');

    const squareEnv = process.env.SQUARE_ENVIRONMENT ?? 'production';
    const client = buildSquareClient(tokens.accessToken);
    logger.info('Square createOrder: environment check', { tenantId, squareEnv, locationId: metadata.locationId });

    // Build a PICKUP fulfillment so Square for Restaurants KDS routes
    // the ticket to the kitchen screen. Without a fulfillment the order
    // is accepted by the Orders API but never appears in any KDS or
    // Dashboard Orders view — it's invisible to kitchen staff.
    //
    // We always use ASAP as the scheduleType. SCHEDULED requires a
    // pickupAt ISO timestamp, but our pickupTime is a human string
    // like "7:35pm" with no date or timezone context — converting it
    // reliably requires the tenant's timezone and today's date, which
    // adds complexity for minimal gain. The pickup time is included in
    // the note so kitchen staff see it on the ticket.
    //
    // IMPORTANT: the Square SDK uses camelCase field names (pickupDetails,
    // scheduleType, displayName). Using snake_case here causes the SDK to
    // silently drop those fields, resulting in a bare PICKUP fulfillment
    // that Square rejects with a 400 error.
    const fulfillment = {
      type: 'PICKUP',
      state: 'PROPOSED',
      pickupDetails: {
        scheduleType: 'ASAP',
        ...(metadata.pickupTime && { note: `Pickup: ${metadata.pickupTime}` }),
        recipient: {
          displayName: metadata.customerName?.trim() || 'RingbackSMS Order',
        },
      },
    };

    // Fetch item names + prices from our DB so we can build ad-hoc line items.
    // Using catalogObjectId caused Square to silently drop line items when the
    // variation isn't enabled at the target location — the order was created
    // with 0 line items and was invisible in Dashboard + KDS. Ad-hoc items
    // (name + basePriceMoney, no catalogObjectId) always appear regardless of
    // how the Square catalog is scoped per location.
    const menuRows = await this.prisma.menuItem.findMany({
      where: {
        tenantId,
        posVariationId: { in: items.map((i) => i.externalVariationId) },
      },
      select: { posVariationId: true, name: true, price: true },
    });
    const byVariationId = new Map(menuRows.map((m) => [m.posVariationId!, m]));

    const lineItems = items.map((item) => {
      const ref = byVariationId.get(item.externalVariationId);
      const name = ref?.name ?? 'Item';
      const priceCents = ref ? Math.round(Number(ref.price) * 100) : 0;
      return {
        quantity: String(item.quantity),
        name,
        basePriceMoney: { amount: BigInt(priceCents), currency: 'USD' },
      };
    });

    const response = await client.ordersApi.createOrder({
      order: {
        locationId: metadata.locationId,
        lineItems,
        fulfillments: [fulfillment],
      },
      idempotencyKey: metadata.idempotencyKey,
    });

    const squareOrderId = response.result.order?.id;
    if (!squareOrderId) throw new Error('Square order creation failed');

    const o = response.result.order;
    logger.info('Square KDS ticket created', {
      tenantId,
      squareOrderId,
      locationId: o?.locationId,
      state: o?.state,
      lineItemCount: o?.lineItems?.length ?? 0,
      fulfillmentCount: (o as any)?.fulfillments?.length ?? 0,
      fulfillmentState: (o as any)?.fulfillments?.[0]?.state,
      source: (o as any)?.source?.name,
    });

    // Record an external-tender payment so Square routes the order to the
    // KDS. Without a payment, orders sit as OPEN/unpaid and Square for
    // Restaurants never sends them to the kitchen display — the ticket is
    // invisible to staff (confirmed by testing: Owner.com and other
    // third-party integrations that appear on the KDS all record a payment).
    //
    // We use Square's own calculated order total (not the Stripe total) so
    // the amounts match exactly and Square doesn't flag the order as
    // over/under-paid. Stripe remains the authoritative financial record;
    // Square sales reports for this channel will show item subtotals only
    // (no tax, tips, or service fees), which is an acceptable trade-off for
    // getting KDS routing to work.
    let externalPaymentId: string | null = null;
    const squareOrderTotal = (o as any)?.totalMoney?.amount as bigint | number | undefined;
    if (squareOrderTotal != null && Number(squareOrderTotal) > 0) {
      try {
        // Square's Payments API caps idempotency_key at 45 chars (vs 192
        // for Orders). Our order-level key `ringback-{convId}-{orderId}` is
        // ~60 chars, so appending `-pay` blew the limit and every payment
        // was rejected with VALUE_TOO_LONG — the order was created but no
        // payment was recorded, which meant KDS never saw the ticket.
        // Hash down to a deterministic 40-char hex string so retries stay
        // idempotent and we never collide with the order-level key.
        const payIdemKey = createHash('sha256')
          .update(`${metadata.idempotencyKey}-pay`)
          .digest('hex')
          .slice(0, 40);
        const paymentResp = await client.paymentsApi.createPayment({
          sourceId: 'EXTERNAL',
          idempotencyKey: payIdemKey,
          amountMoney: {
            amount: BigInt(Number(squareOrderTotal)),
            currency: 'USD',
          },
          orderId: squareOrderId,
          locationId: metadata.locationId,
          externalDetails: {
            type: 'OTHER',
            source: metadata.externalSource ?? 'Stripe',
            sourceId: metadata.externalSourceId ?? undefined,
          },
        });
        externalPaymentId = paymentResp.result.payment?.id ?? null;
        logger.info('Square external payment recorded', {
          tenantId,
          squareOrderId,
          externalPaymentId,
          amountCents: Number(squareOrderTotal),
        });
      } catch (payErr: any) {
        // Non-fatal: the order is already in Square. KDS routing may not
        // work without the payment but the order is not lost.
        logger.warn('Square external payment failed (order still created)', {
          tenantId,
          squareOrderId,
          err: payErr?.message,
          statusCode: payErr?.statusCode,
          squareErrors: payErr?.result?.errors ?? payErr?.errors ?? null,
          amountCents: Number(squareOrderTotal),
        });
      }
    }

    return {
      externalOrderId: squareOrderId,
      externalPaymentId,
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
    // Fail-closed if misconfigured so we never accept a webhook without a key.
    if (!sigKey) return false;
    const notificationUrl = context.notificationUrl ?? '';
    const hmac = crypto.createHmac('sha256', sigKey);
    hmac.update(notificationUrl + body);
    const expected = hmac.digest('base64');
    // Constant-time compare — naive `===` is variable-time and vulnerable
    // to byte-by-byte timing recovery of the expected HMAC.
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(signature);
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  async listLocations(
    tenantId: string,
  ): Promise<Array<{ id: string; name: string; address: string | null }>> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens) throw new Error('Tenant not connected to Square');

    const client = buildSquareClient(tokens.accessToken);
    const response = await client.locationsApi.listLocations();
    const raw = response.result.locations ?? [];

    return raw
      .filter((loc) => loc.id && loc.status !== 'INACTIVE')
      .map((loc) => {
        const addr = loc.address;
        const addressParts = [
          addr?.addressLine1,
          addr?.locality, // city
          addr?.administrativeDistrictLevel1, // state
        ].filter(Boolean);
        return {
          id: loc.id as string,
          name: loc.name ?? 'Unnamed location',
          address: addressParts.length > 0 ? addressParts.join(', ') : null,
        };
      });
  }
}
