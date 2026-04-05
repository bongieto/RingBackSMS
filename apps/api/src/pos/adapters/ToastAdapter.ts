import axios from 'axios';
import { BasePosAdapter, PosTokenData, PosOrderItem, PosOrderResult } from './base';
import { logger } from '../../utils/logger';

const TOAST_API_BASE = 'https://ws-api.toasttab.com';

export class ToastAdapter extends BasePosAdapter {
  readonly provider = 'toast';
  readonly displayName = 'Toast';
  readonly authType = 'apikey' as const;

  getOAuthUrl(_tenantId: string): string {
    throw new Error(
      'Toast uses API key authentication. Configure via the settings form.',
    );
  }

  /**
   * For Toast, `code` is a JSON-encoded string containing:
   * { clientId, clientSecret, restaurantGuid }
   */
  async exchangeCode(tenantId: string, code: string): Promise<void> {
    const credentials = JSON.parse(code) as {
      clientId: string;
      clientSecret: string;
      restaurantGuid: string;
    };

    const response = await axios.post(
      `${TOAST_API_BASE}/authentication/v1/authentication/login`,
      {
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        userAccessType: 'TOAST_MACHINE_CLIENT',
      },
      { headers: { 'Content-Type': 'application/json' } },
    );

    const data = response.data as {
      token: {
        accessToken: string;
        expiresIn: number;
      };
    };

    if (!data.token?.accessToken) {
      throw new Error('Toast authentication failed: no access token received');
    }

    const expiresAt = new Date(Date.now() + data.token.expiresIn * 1000);

    await this.saveTokens(tenantId, {
      accessToken: data.token.accessToken,
      refreshToken: null, // Toast uses re-authentication, not refresh tokens
      expiresAt,
      locationId: null,
      merchantId: credentials.restaurantGuid,
      raw: {
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        restaurantGuid: credentials.restaurantGuid,
      },
    });

    logger.info('Toast authentication completed', {
      tenantId,
      restaurantGuid: credentials.restaurantGuid,
    });
  }

  async refreshToken(tenantId: string): Promise<void> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens?.raw) throw new Error('No Toast credentials stored');

    const credentials = tokens.raw as {
      clientId: string;
      clientSecret: string;
      restaurantGuid: string;
    };

    if (!credentials.clientId || !credentials.clientSecret) {
      throw new Error('Missing Toast client credentials for re-authentication');
    }

    const response = await axios.post(
      `${TOAST_API_BASE}/authentication/v1/authentication/login`,
      {
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        userAccessType: 'TOAST_MACHINE_CLIENT',
      },
      { headers: { 'Content-Type': 'application/json' } },
    );

    const data = response.data as {
      token: {
        accessToken: string;
        expiresIn: number;
      };
    };

    if (!data.token?.accessToken) {
      throw new Error('Toast re-authentication failed');
    }

    const expiresAt = new Date(Date.now() + data.token.expiresIn * 1000);

    await this.saveTokens(tenantId, {
      accessToken: data.token.accessToken,
      refreshToken: null,
      expiresAt,
      locationId: tokens.locationId,
      merchantId: tokens.merchantId,
      raw: tokens.raw,
    });

    logger.info('Toast token refreshed', { tenantId });
  }

  async syncCatalogFromPOS(tenantId: string): Promise<number> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens) throw new Error('Tenant not connected to Toast');

    const restaurantGuid = tokens.merchantId;
    if (!restaurantGuid) throw new Error('No Toast restaurant GUID configured');

    const response = await axios.get(`${TOAST_API_BASE}/menus/v2/menus`, {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Toast-Restaurant-External-ID': restaurantGuid,
        Accept: 'application/json',
      },
    });

    const menus = response.data as Array<{
      menus?: Array<{
        groups?: Array<{
          items?: Array<Record<string, unknown>>;
        }>;
      }>;
    }>;

    let syncedCount = 0;

    // Toast menus are nested: menus -> groups -> items
    for (const menuWrapper of menus) {
      const menuList = menuWrapper.menus ?? [menuWrapper];
      for (const menu of menuList) {
        const groups = (menu as Record<string, unknown>).groups as
          | Array<{ items?: Array<Record<string, unknown>> }>
          | undefined;
        if (!groups) continue;

        for (const group of groups) {
          const items = group.items ?? [];
          for (const item of items) {
            const toastItemGuid = item.guid as string;
            if (!toastItemGuid) continue;

            const name = (item.name as string) ?? 'Unnamed Item';
            const price =
              typeof item.price === 'number' ? item.price : 0;
            const description =
              typeof item.description === 'string'
                ? item.description
                : null;

            const existing = await this.prisma.menuItem.findFirst({
              where: { tenantId, posCatalogId: toastItemGuid },
            });

            const itemData = {
              name,
              description,
              price,
              posCatalogId: toastItemGuid,
              posVariationId: null,
              lastSyncedAt: new Date(),
            };

            if (existing) {
              await this.prisma.menuItem.update({
                where: { id: existing.id },
                data: itemData,
              });
            } else {
              await this.prisma.menuItem.create({
                data: {
                  tenantId,
                  isAvailable: true,
                  ...itemData,
                },
              });
            }

            syncedCount++;
          }
        }
      }
    }

    logger.info('Catalog synced from Toast', { tenantId, count: syncedCount });
    return syncedCount;
  }

  async pushCatalogToPOS(tenantId: string): Promise<number> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens) throw new Error('Tenant not connected to Toast');

    const restaurantGuid = tokens.merchantId;
    if (!restaurantGuid) throw new Error('No Toast restaurant GUID configured');

    const menuItems = await this.prisma.menuItem.findMany({
      where: { tenantId, posCatalogId: null },
    });

    let pushedCount = 0;

    for (const item of menuItems) {
      try {
        const response = await axios.post(
          `${TOAST_API_BASE}/menus/v2/menus/items`,
          {
            name: item.name,
            description: item.description ?? undefined,
            price: Number(item.price),
          },
          {
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
              'Toast-Restaurant-External-ID': restaurantGuid,
              'Content-Type': 'application/json',
            },
          },
        );

        const created = response.data as { guid?: string };
        if (created.guid) {
          await this.prisma.menuItem.update({
            where: { id: item.id },
            data: {
              posCatalogId: created.guid,
              lastSyncedAt: new Date(),
            },
          });
          pushedCount++;
        }
      } catch (err) {
        logger.warn('Failed to push item to Toast', {
          tenantId,
          itemId: item.id,
          error: (err as Error).message,
        });
      }
    }

    logger.info('Catalog pushed to Toast', { tenantId, count: pushedCount });
    return pushedCount;
  }

  async createOrder(
    tenantId: string,
    items: PosOrderItem[],
    metadata: { locationId: string; idempotencyKey: string },
  ): Promise<PosOrderResult> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens) throw new Error('Tenant not connected to Toast');

    const restaurantGuid = tokens.merchantId;
    if (!restaurantGuid) throw new Error('No Toast restaurant GUID configured');

    const response = await axios.post(
      `${TOAST_API_BASE}/orders/v2/orders`,
      {
        entityType: 'Order',
        restaurantGuid,
        selections: items.map((item) => ({
          itemGuid: item.externalVariationId,
          quantity: item.quantity,
        })),
      },
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'Toast-Restaurant-External-ID': restaurantGuid,
          'Content-Type': 'application/json',
          'Idempotency-Key': metadata.idempotencyKey,
        },
      },
    );

    const order = response.data as { guid?: string };
    if (!order.guid) throw new Error('Toast order creation failed');

    logger.info('Toast order created', { tenantId, orderId: order.guid });
    return {
      externalOrderId: order.guid,
      raw: response.data as Record<string, unknown>,
    };
  }

  verifyWebhook(
    body: string,
    signature: string,
    _context: Record<string, string>,
  ): boolean {
    const crypto = require('crypto') as typeof import('crypto');
    const secret = process.env.TOAST_WEBHOOK_SECRET ?? '';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(body);
    const expected = hmac.digest('base64');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature),
      );
    } catch {
      return false;
    }
  }
}
