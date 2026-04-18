import { Prisma, PosProviderType } from '@prisma/client';
import { encrypt, decrypt, encryptNullable, decryptNullable } from '../../encryption';
import { logger } from '../../logger';
import { prisma } from '../../db';

/** Returns the public-facing base URL for OAuth callbacks */
export function getAppBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL
    || process.env.FRONTEND_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || process.env.BASE_URL
    || 'http://localhost:3000';
  return url.trim().replace(/\/+$/, '');
}

export interface PosTokenData {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  locationId: string | null;
  merchantId: string | null;
  raw?: Record<string, unknown>;
}

export interface SyncResult {
  total: number;
  newItems: number;
  updated: number;
  unchanged: number;
  errors: number;
}

export interface PosOrderItem {
  externalVariationId: string;
  quantity: number;
}

export interface PosOrderResult {
  externalOrderId: string;
  raw: Record<string, unknown>;
}

export abstract class BasePosAdapter {
  abstract readonly provider: string;
  abstract readonly displayName: string;
  abstract readonly authType: 'oauth' | 'apikey';

  abstract getOAuthUrl(tenantId: string): string;
  abstract exchangeCode(tenantId: string, code: string): Promise<void>;
  abstract refreshToken(tenantId: string): Promise<void>;
  abstract syncCatalogFromPOS(tenantId: string): Promise<SyncResult>;
  abstract createOrder(
    tenantId: string,
    items: PosOrderItem[],
    metadata: {
      locationId: string;
      idempotencyKey: string;
      /** Optional: if provided, adapters that support external-tender
       *  payments (e.g. Square) will create a matching Payment to mark
       *  the order as paid. Amount is the final total the customer paid. */
      totalCents?: number;
      /** Label for the external payment source, e.g. "Stripe". */
      externalSource?: string;
      /** Opaque id from the external processor (e.g. Stripe payment_intent). */
      externalSourceId?: string;
    },
  ): Promise<PosOrderResult>;
  abstract verifyWebhook(
    body: string,
    signature: string,
    context: Record<string, string>,
  ): boolean;

  /**
   * List locations available on the connected merchant account.
   * Default implementation throws; adapters that support multi-location
   * accounts override this. Return shape is intentionally minimal — id,
   * name, and a one-line address for display.
   */
  async listLocations(
    _tenantId: string,
  ): Promise<Array<{ id: string; name: string; address: string | null }>> {
    throw new Error(`${this.provider} does not support listLocations`);
  }

  protected async loadTokens(tenantId: string): Promise<PosTokenData | null> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        posAccessToken: true,
        posRefreshToken: true,
        posTokenExpiresAt: true,
        posLocationId: true,
        posMerchantId: true,
        posRaw: true,
      },
    });

    if (!tenant?.posAccessToken) return null;

    return {
      accessToken: decrypt(tenant.posAccessToken),
      refreshToken: tenant.posRefreshToken ? decrypt(tenant.posRefreshToken) : null,
      expiresAt: tenant.posTokenExpiresAt,
      locationId: tenant.posLocationId,
      merchantId: tenant.posMerchantId,
      raw: (tenant.posRaw as Record<string, unknown>) ?? {},
    };
  }

  protected async saveTokens(tenantId: string, data: PosTokenData): Promise<void> {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        posProvider: this.provider as PosProviderType,
        posAccessToken: encrypt(data.accessToken),
        posRefreshToken: data.refreshToken ? encrypt(data.refreshToken) : null,
        posTokenExpiresAt: data.expiresAt,
        posLocationId: data.locationId,
        posMerchantId: data.merchantId,
        posRaw: (data.raw ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  protected async clearTokens(tenantId: string): Promise<void> {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        posProvider: null,
        posAccessToken: null,
        posRefreshToken: null,
        posTokenExpiresAt: null,
        posLocationId: null,
        posMerchantId: null,
        posRaw: Prisma.DbNull,
      },
    });
  }

  async disconnect(tenantId: string): Promise<void> {
    await this.clearTokens(tenantId);
    try {
      await prisma.tenantConfig.update({
        where: { tenantId },
        data: { posSyncEnabled: false, posAutoSync: false },
      });
    } catch {
      // Config may not exist yet
    }
    logger.info('POS disconnected', { tenantId, provider: this.provider });
  }

  protected get prisma() {
    return prisma;
  }
}
