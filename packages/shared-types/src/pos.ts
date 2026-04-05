// POS Provider types and adapter interface

export enum PosProvider {
  SQUARE = 'square',
  CLOVER = 'clover',
  TOAST = 'toast',
  SHOPIFY = 'shopify',
}

export interface PosTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  locationId: string | null;
  merchantId: string | null;
  raw: Record<string, unknown>;
}

export interface PosCatalogItem {
  externalId: string;
  externalVariationId: string | null;
  name: string;
  description: string | null;
  priceUsd: number;
}

export interface PosOrderItem {
  externalVariationId: string;
  quantity: number;
}

export interface PosOrderResult {
  externalOrderId: string;
  raw: Record<string, unknown>;
}

export type PosAuthType = 'oauth' | 'apikey';

export interface PosProviderInfo {
  provider: PosProvider;
  displayName: string;
  description: string;
  authType: PosAuthType;
  requiredFields?: string[]; // For API key providers
}

export const POS_PROVIDER_INFO: Record<PosProvider, PosProviderInfo> = {
  [PosProvider.SQUARE]: {
    provider: PosProvider.SQUARE,
    displayName: 'Square POS',
    description: 'Sync your menu catalog and create orders in Square',
    authType: 'oauth',
  },
  [PosProvider.CLOVER]: {
    provider: PosProvider.CLOVER,
    displayName: 'Clover POS',
    description: 'Connect your Clover merchant account for menu and orders',
    authType: 'oauth',
  },
  [PosProvider.TOAST]: {
    provider: PosProvider.TOAST,
    displayName: 'Toast POS',
    description: 'Integrate with Toast for restaurant menu and order management',
    authType: 'apikey',
    requiredFields: ['clientId', 'clientSecret', 'restaurantGuid'],
  },
  [PosProvider.SHOPIFY]: {
    provider: PosProvider.SHOPIFY,
    displayName: 'Shopify',
    description: 'Sync your Shopify product catalog and manage orders',
    authType: 'oauth',
    requiredFields: ['shopDomain'],
  },
};
