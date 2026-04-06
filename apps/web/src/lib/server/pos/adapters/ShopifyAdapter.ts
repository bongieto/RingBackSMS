import axios from 'axios';
import { BasePosAdapter, PosTokenData, PosOrderItem, PosOrderResult, SyncResult } from './base';
import { logger } from '../../logger';

const SHOPIFY_API_VERSION = '2024-01';

function getScopes(): string {
  return (
    process.env.SHOPIFY_SCOPES ??
    'read_products,write_products,read_orders,write_orders'
  );
}

export class ShopifyAdapter extends BasePosAdapter {
  readonly provider = 'shopify';
  readonly displayName = 'Shopify';
  readonly authType = 'oauth' as const;

  /**
   * The shop domain must be stored in posRaw.shopDomain before calling this.
   */
  getOAuthUrl(tenantId: string): string {
    // The shopDomain should be provided as part of the state or pre-configured.
    // For the URL generation we need the shop domain — it should be set in
    // advance via a configure step and stored in posRaw.
    // Since we can't do async here, the caller must pass the shopDomain
    // via the tenantId param encoded as "tenantId:shopDomain" or the shop
    // must be pre-configured. We'll parse it if encoded.
    let actualTenantId = tenantId;
    let shopDomain = '';

    if (tenantId.includes(':')) {
      const parts = tenantId.split(':');
      actualTenantId = parts[0];
      shopDomain = parts[1];
    }

    if (!shopDomain) {
      throw new Error(
        'Shopify shop domain is required. Pass as tenantId:shopDomain or pre-configure it.',
      );
    }

    const params = new URLSearchParams({
      client_id: process.env.SHOPIFY_CLIENT_ID ?? '',
      scope: getScopes(),
      state: actualTenantId,
      redirect_uri: `${process.env.BASE_URL}/integrations/shopify/callback`,
    });

    return `https://${shopDomain}.myshopify.com/admin/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(tenantId: string, code: string): Promise<void> {
    // Load existing posRaw to get shopDomain
    const tokens = await this.loadTokens(tenantId);
    const shopDomain = (tokens?.raw?.shopDomain as string) ?? null;

    if (!shopDomain) {
      throw new Error(
        'Shopify shop domain must be configured before OAuth exchange',
      );
    }

    const response = await axios.post(
      `https://${shopDomain}.myshopify.com/admin/oauth/access_token`,
      {
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code,
      },
      { headers: { 'Content-Type': 'application/json' } },
    );

    const data = response.data as {
      access_token: string;
      scope: string;
    };

    if (!data.access_token) {
      throw new Error('Shopify OAuth failed: no access_token received');
    }

    await this.saveTokens(tenantId, {
      accessToken: data.access_token,
      refreshToken: null, // Shopify offline tokens don't expire
      expiresAt: null,
      locationId: null,
      merchantId: shopDomain,
      raw: {
        shopDomain,
        scope: data.scope,
      },
    });

    logger.info('Shopify OAuth completed', { tenantId, shopDomain });
  }

  async refreshToken(_tenantId: string): Promise<void> {
    // Shopify offline access tokens don't expire
    logger.info('Shopify offline tokens do not expire; refresh is a no-op');
  }

  async syncCatalogFromPOS(tenantId: string): Promise<SyncResult> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens) throw new Error('Tenant not connected to Shopify');

    const shopDomain = (tokens.raw?.shopDomain as string) ?? tokens.merchantId;
    if (!shopDomain) throw new Error('No Shopify shop domain configured');

    const response = await axios.get(
      `https://${shopDomain}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/products.json`,
      { headers: { 'X-Shopify-Access-Token': tokens.accessToken, Accept: 'application/json' } },
    );

    const products = (response.data as { products: Array<Record<string, unknown>> }).products ?? [];
    const result: SyncResult = { total: 0, newItems: 0, updated: 0, unchanged: 0, errors: 0 };

    for (const product of products) {
      try {
        const productId = String(product.id);
        const title = (product.title as string) ?? 'Unnamed Item';
        const bodyHtml = product.body_html as string | null;
        const variants = (product.variants as Array<Record<string, unknown>>) ?? [];
        const firstVariant = variants[0];
        const price = firstVariant ? parseFloat(String(firstVariant.price ?? '0')) : 0;
        const variantId = firstVariant ? String(firstVariant.id) : null;

        const existing = await this.prisma.menuItem.findFirst({ where: { tenantId, posCatalogId: productId } });
        const description = bodyHtml ? bodyHtml.replace(/<[^>]*>/g, '').substring(0, 500) : null;
        const itemData = { name: title, description, price, posCatalogId: productId, posVariationId: variantId, lastSyncedAt: new Date() };

        if (existing) {
          const changed = existing.name !== title || existing.description !== description || Number(existing.price) !== price;
          await this.prisma.menuItem.update({ where: { id: existing.id }, data: itemData });
          if (changed) result.updated++; else result.unchanged++;
        } else {
          await this.prisma.menuItem.create({ data: { tenantId, isAvailable: true, ...itemData } });
          result.newItems++;
        }
        result.total++;
      } catch (err) {
        result.errors++;
        logger.warn('Failed to sync product from Shopify', { tenantId, error: (err as Error).message });
      }
    }

    logger.info('Catalog synced from Shopify', { tenantId, result });
    return result;
  }

  async pushCatalogToPOS(tenantId: string): Promise<number> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens) throw new Error('Tenant not connected to Shopify');

    const shopDomain = (tokens.raw?.shopDomain as string) ?? tokens.merchantId;
    if (!shopDomain) throw new Error('No Shopify shop domain configured');

    const menuItems = await this.prisma.menuItem.findMany({
      where: { tenantId, posCatalogId: null },
    });

    let pushedCount = 0;

    for (const item of menuItems) {
      try {
        const response = await axios.post(
          `https://${shopDomain}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/products.json`,
          {
            product: {
              title: item.name,
              body_html: item.description ?? '',
              variants: [
                {
                  price: String(Number(item.price)),
                  inventory_management: null,
                },
              ],
            },
          },
          {
            headers: {
              'X-Shopify-Access-Token': tokens.accessToken,
              'Content-Type': 'application/json',
            },
          },
        );

        const created = (
          response.data as { product: { id?: number; variants?: Array<{ id?: number }> } }
        ).product;

        if (created?.id) {
          const variantId = created.variants?.[0]?.id
            ? String(created.variants[0].id)
            : null;
          await this.prisma.menuItem.update({
            where: { id: item.id },
            data: {
              posCatalogId: String(created.id),
              posVariationId: variantId,
              lastSyncedAt: new Date(),
            },
          });
          pushedCount++;
        }
      } catch (err) {
        logger.warn('Failed to push item to Shopify', {
          tenantId,
          itemId: item.id,
          error: (err as Error).message,
        });
      }
    }

    logger.info('Catalog pushed to Shopify', { tenantId, count: pushedCount });
    return pushedCount;
  }

  async createOrder(
    tenantId: string,
    items: PosOrderItem[],
    metadata: { locationId: string; idempotencyKey: string },
  ): Promise<PosOrderResult> {
    const tokens = await this.loadTokens(tenantId);
    if (!tokens) throw new Error('Tenant not connected to Shopify');

    const shopDomain = (tokens.raw?.shopDomain as string) ?? tokens.merchantId;
    if (!shopDomain) throw new Error('No Shopify shop domain configured');

    const lineItems = items.map((item) => ({
      variant_id: parseInt(item.externalVariationId, 10),
      quantity: item.quantity,
    }));

    const response = await axios.post(
      `https://${shopDomain}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/orders.json`,
      {
        order: {
          line_items: lineItems,
          financial_status: 'pending',
        },
      },
      {
        headers: {
          'X-Shopify-Access-Token': tokens.accessToken,
          'Content-Type': 'application/json',
          'Idempotency-Key': metadata.idempotencyKey,
        },
      },
    );

    const order = (response.data as { order: { id?: number } }).order;
    if (!order?.id) throw new Error('Shopify order creation failed');

    logger.info('Shopify order created', {
      tenantId,
      orderId: String(order.id),
    });
    return {
      externalOrderId: String(order.id),
      raw: response.data as Record<string, unknown>,
    };
  }

  verifyWebhook(
    body: string,
    signature: string,
    _context: Record<string, string>,
  ): boolean {
    const crypto = require('crypto') as typeof import('crypto');
    const secret =
      process.env.SHOPIFY_WEBHOOK_SECRET ??
      process.env.SHOPIFY_CLIENT_SECRET ??
      '';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(body, 'utf8');
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
