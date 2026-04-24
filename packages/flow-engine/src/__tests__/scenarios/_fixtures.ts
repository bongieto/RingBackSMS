import { FlowType, type BusinessType, type Plan } from '@ringback/shared-types';
import type { TenantContext } from '../../types';

/**
 * Reusable tenant fixture for scenario tests. Every field that
 * `runFlowEngine` actually reads is populated with a sensible default;
 * callers override only what matters for their scenario.
 *
 * Keep this minimal — if a scenario needs an exotic config, it can
 * spread the return value and override fields inline.
 */

const TENANT_ID = '10000000-0000-0000-0000-000000000001';
const A7_ID = '20000000-0000-0000-0000-0000000000a7';
const LB2_ID = '20000000-0000-0000-0000-00000000lb02';
const D1_ID = '20000000-0000-0000-0000-0000000000d1';

export const IDS = {
  tenantId: TENANT_ID,
  a7: A7_ID,
  lb2: LB2_ID,
  d1: D1_ID,
};

export interface TenantFixtureOverrides {
  openNow?: boolean;
  /** Enabled flows. Defaults to ORDER + FALLBACK (no MEETING). */
  flowTypes?: FlowType[];
  /** When false, forces business hours gate into "closed" state. */
  withinBusinessHours?: boolean;
  config?: Partial<Record<string, unknown>>;
}

export function buildLumpiaContext(
  overrides: TenantFixtureOverrides = {},
): TenantContext {
  const openNow = overrides.openNow ?? true;
  const flowTypes = overrides.flowTypes ?? [FlowType.ORDER, FlowType.FALLBACK];

  return {
    tenantId: TENANT_ID,
    tenantName: 'The Lumpia House & Truck',
    tenantSlug: 'the-lumpia-house-and-truck',
    tenantPhoneNumber: '+12175550100',
    config: {
      id: 'cfg',
      tenantId: TENANT_ID,
      timezone: 'America/Chicago',
      businessHoursStart: '11:00',
      businessHoursEnd: '20:00',
      businessDays: [0, 2, 3, 4, 5, 6],
      closedDates: [],
      ordersAcceptingEnabled: true,
      aiOrderAgentEnabled: true,
      requirePayment: true,
      salesTaxRate: 0.0975,
      passStripeFeesToCustomer: true,
      aiPersonality: 'warm, friendly, and proud of Filipino cuisine',
      acceptClosedHourOrders: true,
      defaultPrepTimeMinutes: 15,
      minutesPerQueuedOrder: 4,
      ...overrides.config,
    } as any,
    flows: flowTypes.map((t, i) => ({
      id: `f${i}`,
      tenantId: TENANT_ID,
      type: t,
      isEnabled: true,
      config: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    })),
    menuItems: [
      {
        id: A7_ID,
        tenantId: TENANT_ID,
        name: '#A7 Siomai (4 Pcs)',
        description: 'Steamed pork dumplings',
        price: 5.99,
        category: 'Appetizers',
        isAvailable: true,
        duration: null,
        requiresBooking: false,
        squareCatalogId: null,
        squareVariationId: null,
        posCatalogId: null,
        posVariationId: null,
        lastSyncedAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      {
        id: LB2_ID,
        tenantId: TENANT_ID,
        name: '#LB2 Pork BBQ Bowl',
        description: 'Grilled pork over rice',
        price: 12.99,
        category: 'Mains',
        isAvailable: true,
        duration: null,
        requiresBooking: false,
        squareCatalogId: null,
        squareVariationId: null,
        posCatalogId: null,
        posVariationId: null,
        lastSyncedAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      {
        id: D1_ID,
        tenantId: TENANT_ID,
        name: '#D1 Calamansi Sizzler',
        description: 'Iced calamansi drink',
        price: 3.99,
        category: 'Drinks',
        isAvailable: true,
        duration: null,
        requiresBooking: false,
        squareCatalogId: null,
        squareVariationId: null,
        posCatalogId: null,
        posVariationId: null,
        lastSyncedAt: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    ] as any,
    hoursInfo: {
      openNow,
      nextOpenDisplay: openNow ? null : 'tomorrow 11:00 AM',
      todayHoursDisplay: 'Today: 11:00 AM - 8:00 PM',
      weeklyHoursDisplay: 'Sun, Tue-Sat 11:00 AM - 8:00 PM',
      minutesUntilClose: openNow ? 180 : null,
      closesAtDisplay: openNow ? 'closes 8:00 PM' : null,
      closingSoon: false,
    },
  };
}
