import { Client, Environment } from 'square';
import { encrypt, decrypt, encryptNullable } from '../encryption';
import { logger } from '../logger';
import axios from 'axios';
import { prisma } from '../db';

/** Resolve the public app origin from the first env var we find. */
function getAppOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.FRONTEND_URL ??
    process.env.BASE_URL ??
    '';
  return raw.replace(/\/+$/, '');
}

function getSquareRedirectUri(): string {
  return `${getAppOrigin()}/integrations/square/callback`;
}

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

// ── OAuth ─────────────────────────────────────────────────────────────────────

export function getOAuthUrl(tenantId: string): string {
  const baseUrl =
    process.env.SQUARE_ENVIRONMENT === 'production'
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com';

  const params = new URLSearchParams({
    client_id: (process.env.SQUARE_APPLICATION_ID || process.env.SQUARE_APP_ID) ?? '',
    scope: 'MERCHANT_PROFILE_READ ITEMS_READ ITEMS_WRITE ORDERS_WRITE PAYMENTS_WRITE',
    state: tenantId,
    redirect_uri: getSquareRedirectUri(),
  });

  return `${baseUrl}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeOAuthCode(
  tenantId: string,
  code: string
): Promise<void> {
  const baseUrl =
    process.env.SQUARE_ENVIRONMENT === 'production'
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com';

  const response = await axios.post(
    `${baseUrl}/oauth2/token`,
    {
      client_id: (process.env.SQUARE_APPLICATION_ID || process.env.SQUARE_APP_ID),
      client_secret: (process.env.SQUARE_APPLICATION_SECRET || process.env.SQUARE_APP_SECRET),
      code,
      grant_type: 'authorization_code',
      redirect_uri: getSquareRedirectUri(),
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const data = response.data as {
    access_token: string;
    refresh_token: string;
    expires_at: string;
    merchant_id: string;
  };

  const client = buildSquareClient(data.access_token);
  const locationsResponse = await client.locationsApi.listLocations();
  const locationId = locationsResponse.result.locations?.[0]?.id;

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      squareAccessToken: encrypt(data.access_token),
      squareRefreshToken: encrypt(data.refresh_token),
      squareTokenExpiresAt: new Date(data.expires_at),
      squareMerchantId: data.merchant_id,
      squareLocationId: locationId,
    },
  });

  logger.info('Square OAuth completed', { tenantId, merchantId: data.merchant_id });
}

export async function refreshSquareToken(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { squareRefreshToken: true },
  });

  if (!tenant?.squareRefreshToken) throw new Error('No Square refresh token');

  const refreshToken = decrypt(tenant.squareRefreshToken);
  const baseUrl =
    process.env.SQUARE_ENVIRONMENT === 'production'
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com';

  const response = await axios.post(
    `${baseUrl}/oauth2/token`,
    {
      client_id: (process.env.SQUARE_APPLICATION_ID || process.env.SQUARE_APP_ID),
      client_secret: (process.env.SQUARE_APPLICATION_SECRET || process.env.SQUARE_APP_SECRET),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    },
    { headers: { 'Content-Type': 'application/json' } }
  );

  const data = response.data as {
    access_token: string;
    refresh_token: string;
    expires_at: string;
  };

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      squareAccessToken: encrypt(data.access_token),
      squareRefreshToken: encrypt(data.refresh_token),
      squareTokenExpiresAt: new Date(data.expires_at),
    },
  });
}

export async function disconnectSquare(tenantId: string): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      squareAccessToken: null,
      squareRefreshToken: null,
      squareLocationId: null,
      squareMerchantId: null,
      squareTokenExpiresAt: null,
    },
  });

  await prisma.tenantConfig.update({
    where: { tenantId },
    data: { squareSyncEnabled: false, squareAutoSync: false },
  });
}

// ── Catalog Sync ──────────────────────────────────────────────────────────────

/**
 * Pulls catalog items from Square and upserts them as MenuItems.
 */
export async function syncCatalogFromSquare(tenantId: string): Promise<number> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { squareAccessToken: true },
  });

  if (!tenant?.squareAccessToken) throw new Error('Tenant not connected to Square');

  const accessToken = decrypt(tenant.squareAccessToken);
  const client = buildSquareClient(accessToken);

  const response = await client.catalogApi.listCatalog(undefined, 'ITEM');
  const items = response.result.objects ?? [];

  let syncedCount = 0;

  for (const item of items) {
    if (!item.itemData) continue;

    const variation = item.itemData.variations?.[0];
    const priceMoney = variation?.itemVariationData?.priceMoney;
    const price = priceMoney ? Number(priceMoney.amount ?? 0) / 100 : 0;

    await prisma.menuItem.upsert({
      where: {
        id: item.id ?? undefined,
      } as { id: string },
      update: {
        name: item.itemData.name ?? 'Unnamed Item',
        description: item.itemData.description ?? null,
        price,
        squareCatalogId: item.id,
        squareVariationId: variation?.id ?? null,
        lastSyncedAt: new Date(),
      },
      create: {
        tenantId,
        name: item.itemData.name ?? 'Unnamed Item',
        description: item.itemData.description ?? null,
        price,
        isAvailable: true,
        squareCatalogId: item.id,
        squareVariationId: variation?.id ?? null,
        lastSyncedAt: new Date(),
      },
    });

    syncedCount++;
  }

  logger.info('Catalog synced from Square', { tenantId, count: syncedCount });
  return syncedCount;
}

/**
 * Pushes local MenuItems to Square catalog.
 */
export async function pushCatalogToSquare(tenantId: string): Promise<number> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { squareAccessToken: true },
  });

  if (!tenant?.squareAccessToken) throw new Error('Tenant not connected to Square');

  const accessToken = decrypt(tenant.squareAccessToken);
  const client = buildSquareClient(accessToken);

  const menuItems = await prisma.menuItem.findMany({
    where: { tenantId, squareCatalogId: null },
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
      const variationId = createdObject.itemData?.variations?.[0]?.id ?? null;
      await prisma.menuItem.update({
        where: { id: item.id },
        data: {
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

// ── Orders ────────────────────────────────────────────────────────────────────

export async function createSquareOrder(
  tenantId: string,
  items: Array<{ squareVariationId: string; quantity: number }>,
  locationId: string
): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { squareAccessToken: true },
  });

  if (!tenant?.squareAccessToken) throw new Error('Tenant not connected to Square');

  const accessToken = decrypt(tenant.squareAccessToken);
  const client = buildSquareClient(accessToken);

  const response = await client.ordersApi.createOrder({
    order: {
      locationId,
      lineItems: items.map((item) => ({
        quantity: String(item.quantity),
        catalogObjectId: item.squareVariationId,
      })),
    },
    idempotencyKey: `ringback-order-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });

  const squareOrderId = response.result.order?.id;
  if (!squareOrderId) throw new Error('Square order creation failed');

  logger.info('Square order created', { tenantId, squareOrderId });
  return squareOrderId;
}

// ── Webhook Verification ──────────────────────────────────────────────────────

export function verifySquareWebhook(
  body: string,
  signature: string,
  notificationUrl: string
): boolean {
  const crypto = require('crypto') as typeof import('crypto');
  const sigKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? '';
  const hmac = crypto.createHmac('sha256', sigKey);
  hmac.update(notificationUrl + body);
  const expected = hmac.digest('base64');
  return expected === signature;
}
