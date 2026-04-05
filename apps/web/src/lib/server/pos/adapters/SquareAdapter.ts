import { Client, Environment } from 'square';
import axios from 'axios';
import { BasePosAdapter, PosTokenData, PosOrderItem, PosOrderResult } from './base';
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
      client_id: process.env.SQUARE_APPLICATION_ID ?? '',
      scope:
        'MERCHANT_PROFILE_READ ITEMS_READ ITEMS_WRITE ORDERS_WRITE PAYMENTS_WRITE',
      state: tenantId,
      redirect_uri: `${process.env.BASE_URL}/integrations/square/callback`,
    });

    return `${baseUrl}/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCode(tenantId: string, code: string): Promise<void> {
    const baseUrl = getSquareBaseUrl();

    const response = await axios.post(
      `${baseUrl}/oauth2/token`,
      {
        client_id: process.env.SQUARE_APPLICATION_ID,
        client_secret: process.env.SQUARE_APPLICATION_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.BASE_URL}/integrations/square/callback`,
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
        client_id: process.env.SQUARE_APPLICATION_ID,
        client_secret: process.env.SQUARE_APPLICATION_SECRET,
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

  async syncCatalogFromPOS(tenantId: string): Promise<number> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens) throw new Error('Tenant not connected to Square');

    const client = buildSquareClient(tokens.accessToken);
    const response = await client.catalogApi.listCatalog(undefined, 'ITEM');
    const items = response.result.objects ?? [];

    let syncedCount = 0;

    for (const item of items) {
      if (!item.itemData) continue;

      const variation = item.itemData.variations?.[0];
      const priceMoney = variation?.itemVariationData?.priceMoney;
      const price = priceMoney ? Number(priceMoney.amount ?? 0) / 100 : 0;

      const existing = await this.prisma.menuItem.findFirst({
        where: { tenantId, posCatalogId: item.id },
      });

      const itemData = {
        name: item.itemData.name ?? 'Unnamed Item',
        description: item.itemData.description ?? null,
        price,
        posCatalogId: item.id,
        posVariationId: variation?.id ?? null,
        // Backward compatibility
        squareCatalogId: item.id,
        squareVariationId: variation?.id ?? null,
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

    logger.info('Catalog synced from Square', { tenantId, count: syncedCount });
    return syncedCount;
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
