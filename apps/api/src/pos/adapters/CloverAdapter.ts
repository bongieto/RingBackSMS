import axios from 'axios';
import { BasePosAdapter, PosTokenData, PosOrderItem, PosOrderResult } from './base';
import { logger } from '../../utils/logger';

function getCloverBaseUrl(): string {
  return process.env.CLOVER_ENVIRONMENT === 'production'
    ? 'https://www.clover.com'
    : 'https://sandbox.dev.clover.com';
}

function getCloverApiBaseUrl(): string {
  return process.env.CLOVER_ENVIRONMENT === 'production'
    ? 'https://api.clover.com'
    : 'https://apisandbox.dev.clover.com';
}

function getCloverTokenUrl(): string {
  return process.env.CLOVER_ENVIRONMENT === 'production'
    ? 'https://api.clover.com/oauth/token'
    : 'https://sandbox.dev.clover.com/oauth/token';
}

export class CloverAdapter extends BasePosAdapter {
  readonly provider = 'clover';
  readonly displayName = 'Clover';
  readonly authType = 'oauth' as const;

  getOAuthUrl(tenantId: string): string {
    const baseUrl = getCloverBaseUrl();

    const params = new URLSearchParams({
      client_id: process.env.CLOVER_APP_ID ?? '',
      state: tenantId,
      redirect_uri: `${process.env.BASE_URL}/integrations/clover/callback`,
    });

    return `${baseUrl}/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(tenantId: string, code: string): Promise<void> {
    const tokenUrl = getCloverTokenUrl();

    const params = new URLSearchParams({
      client_id: process.env.CLOVER_APP_ID ?? '',
      client_secret: process.env.CLOVER_APP_SECRET ?? '',
      code,
    });

    const response = await axios.get(`${tokenUrl}?${params.toString()}`);

    const data = response.data as {
      access_token: string;
      merchant_id?: string;
    };

    if (!data.access_token) {
      throw new Error('Clover OAuth failed: no access_token received');
    }

    // Fetch merchant info to get merchant ID if not in token response
    const merchantId = data.merchant_id ?? null;

    await this.saveTokens(tenantId, {
      accessToken: data.access_token,
      refreshToken: null, // Clover tokens don't expire, no refresh token
      expiresAt: null,
      locationId: null,
      merchantId,
    });

    logger.info('Clover OAuth completed', { tenantId, merchantId });
  }

  async refreshToken(_tenantId: string): Promise<void> {
    // Clover access tokens don't expire, no refresh needed
    logger.info('Clover tokens do not expire; refresh is a no-op');
  }

  async syncCatalogFromPOS(tenantId: string): Promise<number> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens) throw new Error('Tenant not connected to Clover');
    if (!tokens.merchantId) throw new Error('No Clover merchant ID configured');

    const apiBase = getCloverApiBaseUrl();

    const response = await axios.get(
      `${apiBase}/v3/merchants/${tokens.merchantId}/items`,
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          Accept: 'application/json',
        },
      },
    );

    const items = (response.data as { elements?: Array<Record<string, unknown>> })
      .elements ?? [];

    let syncedCount = 0;

    for (const item of items) {
      const cloverItemId = item.id as string;
      const name = (item.name as string) ?? 'Unnamed Item';
      const price = typeof item.price === 'number' ? item.price / 100 : 0;
      const description =
        typeof item.alternateName === 'string' ? item.alternateName : null;

      const existing = await this.prisma.menuItem.findFirst({
        where: { tenantId, posCatalogId: cloverItemId },
      });

      const itemData = {
        name,
        description,
        price,
        posCatalogId: cloverItemId,
        posVariationId: null, // Clover doesn't have variations in the same way
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

    logger.info('Catalog synced from Clover', { tenantId, count: syncedCount });
    return syncedCount;
  }

  async pushCatalogToPOS(tenantId: string): Promise<number> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens) throw new Error('Tenant not connected to Clover');
    if (!tokens.merchantId) throw new Error('No Clover merchant ID configured');

    const apiBase = getCloverApiBaseUrl();

    const menuItems = await this.prisma.menuItem.findMany({
      where: { tenantId, posCatalogId: null },
    });

    let pushedCount = 0;

    for (const item of menuItems) {
      const response = await axios.post(
        `${apiBase}/v3/merchants/${tokens.merchantId}/items`,
        {
          name: item.name,
          alternateName: item.description ?? undefined,
          price: Math.round(Number(item.price) * 100),
        },
        {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const created = response.data as { id?: string };
      if (created.id) {
        await this.prisma.menuItem.update({
          where: { id: item.id },
          data: {
            posCatalogId: created.id,
            lastSyncedAt: new Date(),
          },
        });
        pushedCount++;
      }
    }

    logger.info('Catalog pushed to Clover', { tenantId, count: pushedCount });
    return pushedCount;
  }

  async createOrder(
    tenantId: string,
    items: PosOrderItem[],
    metadata: { locationId: string; idempotencyKey: string },
  ): Promise<PosOrderResult> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens) throw new Error('Tenant not connected to Clover');

    const merchantId = tokens.merchantId;
    if (!merchantId) throw new Error('No Clover merchant ID configured');

    const apiBase = getCloverApiBaseUrl();

    // Step 1: Create the order
    const orderResponse = await axios.post(
      `${apiBase}/v3/merchants/${merchantId}/orders`,
      { state: 'open' },
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const order = orderResponse.data as { id: string };
    if (!order.id) throw new Error('Clover order creation failed');

    // Step 2: Add line items
    for (const item of items) {
      await axios.post(
        `${apiBase}/v3/merchants/${merchantId}/orders/${order.id}/line_items`,
        {
          item: { id: item.externalVariationId },
          unitQty: item.quantity * 1000, // Clover uses 1000-based quantities
        },
        {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
    }

    logger.info('Clover order created', { tenantId, orderId: order.id });
    return {
      externalOrderId: order.id,
      raw: orderResponse.data as Record<string, unknown>,
    };
  }

  verifyWebhook(
    body: string,
    signature: string,
    _context: Record<string, string>,
  ): boolean {
    const crypto = require('crypto') as typeof import('crypto');
    const secret = process.env.CLOVER_WEBHOOK_SECRET ?? '';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(body);
    const expected = hmac.digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  }
}
