import { CanonicalSaleProjectionSchema, MenuSnapshotSchema } from '@ringback/shared-types';
import { assertMonotonicProjection, isRecognizedRevenue } from './financialProjection';
import {
  decideSnapshot,
  deterministicIntegrationUuid,
  hasDuplicateMenuExternalIds,
  isDeterministicIntegrationMenu,
} from './syncVersion';
import { toMcInasalFulfillmentStatus, toRingBackOrderStatus } from './fulfillmentMapping';
import { OrderStatus } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { isAvailableAtAnyActiveLocation, isAvailableAtLocation } from './menuAvailability';

describe('commerce integration safety', () => {
  it('rejects stale or conflicting snapshots and accepts exact retries', () => {
    const cursor = { sequence: 8, checksum: 'a'.repeat(64) };
    expect(decideSnapshot(cursor, { sequence: 7, checksum: 'b'.repeat(64) })).toBe('stale');
    expect(decideSnapshot(cursor, { sequence: 8, checksum: 'b'.repeat(64) })).toBe('conflict');
    expect(decideSnapshot(cursor, { sequence: 8, checksum: 'a'.repeat(64) })).toBe('idempotent');
    expect(decideSnapshot(cursor, { sequence: 9, checksum: 'b'.repeat(64) })).toBe('apply');
  });

  it('requires a monotonic menu sequence and a sha256 checksum', () => {
    const result = MenuSnapshotSchema.safeParse({ revision: 'v1', categories: [], items: [] });
    expect(result.success).toBe(false);
  });

  it('allows shared source modifiers across items but rejects ambiguous IDs within a parent', () => {
    const sharedGroup = {
      externalId: 'group-1',
      options: [{ externalId: 'option-1' }],
    };
    const valid = {
      categories: [{ externalId: 'category-1' }],
      items: [
        { externalId: 'item-1', modifierGroups: [sharedGroup] },
        { externalId: 'item-2', modifierGroups: [sharedGroup] },
      ],
    };
    expect(hasDuplicateMenuExternalIds(valid)).toBe(false);
    expect(
      hasDuplicateMenuExternalIds({
        ...valid,
        items: [{ externalId: 'item-1', modifierGroups: [sharedGroup, sharedGroup] }],
      })
    ).toBe(true);
    expect(
      hasDuplicateMenuExternalIds({
        ...valid,
        items: [
          {
            externalId: 'item-1',
            modifierGroups: [
              {
                externalId: 'group-1',
                options: [{ externalId: 'option-1' }, { externalId: 'option-1' }],
              },
            ],
          },
        ],
      })
    ).toBe(true);
  });

  it('generates stable, distinct UUIDs for bulk integration resources', () => {
    const first = deterministicIntegrationUuid('connection:item:item-1');
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(deterministicIntegrationUuid('connection:item:item-1')).toBe(first);
    expect(deterministicIntegrationUuid('connection:item:item-2')).not.toBe(first);
  });

  it('uses the bulk update path only for an empty or wholly integration-managed menu', () => {
    const connectionId = 'connection-1';
    const mappings = [
      {
        resourceType: 'menu_category',
        externalId: 'category-1',
        internalId: deterministicIntegrationUuid(`${connectionId}:menu-category:category-1`),
      },
      {
        resourceType: 'menu_item',
        externalId: 'item-1',
        internalId: deterministicIntegrationUuid(`${connectionId}:menu-item:item-1`),
      },
    ];
    expect(isDeterministicIntegrationMenu(connectionId, [], 0, 0)).toBe(true);
    expect(isDeterministicIntegrationMenu(connectionId, mappings, 1, 1)).toBe(true);
    expect(isDeterministicIntegrationMenu(connectionId, mappings, 2, 1)).toBe(false);
    expect(
      isDeterministicIntegrationMenu(
        connectionId,
        [{ ...mappings[1], internalId: 'manually-created-item' }],
        0,
        1
      )
    ).toBe(false);
  });

  it('honors location 86 state while preserving tenants without overrides', () => {
    expect(isAvailableAtAnyActiveLocation({ isAvailable: true }, 1)).toBe(true);
    expect(
      isAvailableAtAnyActiveLocation(
        { isAvailable: true, locationAvailability: [{ isAvailable: false }] },
        1
      )
    ).toBe(false);
    expect(
      isAvailableAtAnyActiveLocation(
        { isAvailable: true, locationAvailability: [{ isAvailable: false }] },
        2
      )
    ).toBe(true);
    expect(
      isAvailableAtLocation({
        isAvailable: true,
        locationAvailability: [{ isAvailable: false }],
      })
    ).toBe(false);
    expect(isAvailableAtLocation({ isAvailable: false })).toBe(false);
  });

  it('rejects financial projections whose net does not reconcile', () => {
    const result = CanonicalSaleProjectionSchema.safeParse({
      externalId: 'order-1',
      locationId: '8113ef17-0a7d-4f4c-b4a2-4b15ace25b2f',
      version: 1,
      orderNumber: 'MC-100001',
      status: 'PAID',
      fulfillmentStatus: 'CONFIRMED',
      currency: 'usd',
      occurredAt: '2026-08-03T20:00:00.000Z',
      grossCents: 1000,
      refundCents: 100,
      netCents: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('counts paid and refunded canonical facts but never pending sales', () => {
    expect(isRecognizedRevenue('PAID')).toBe(true);
    expect(isRecognizedRevenue('PARTIALLY_REFUNDED')).toBe(true);
    expect(isRecognizedRevenue('REFUNDED')).toBe(true);
    expect(isRecognizedRevenue('PENDING')).toBe(false);
    expect(assertMonotonicProjection({ version: 3 }, 2)).toBe('stale');
  });

  it('keeps payment state separate from delegated fulfillment state', () => {
    expect(toRingBackOrderStatus('pending_payment')).toBe(OrderStatus.PENDING);
    expect(toRingBackOrderStatus('new')).toBe(OrderStatus.CONFIRMED);
    expect(toMcInasalFulfillmentStatus(OrderStatus.PREPARING)).toBe('preparing');
    expect(toMcInasalFulfillmentStatus(OrderStatus.PENDING)).toBeNull();
  });

  it('fails closed on RingBack payment and status paths owned by McInasal', () => {
    const checkoutRoute = readFileSync('src/app/api/public/orders/[id]/checkout/route.ts', 'utf8');
    const orderService = readFileSync('src/lib/server/services/orderService.ts', 'utf8');
    expect(checkoutRoute).toContain("order.financialOwner !== 'ringbacksms'");
    expect(orderService).toContain('delegateFulfillmentToMcInasal');
  });
});
