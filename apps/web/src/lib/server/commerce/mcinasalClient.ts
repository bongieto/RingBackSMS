import { z } from 'zod';
import { OrderStatus } from '@prisma/client';
import { prisma } from '../db';
import { decrypt } from '../encryption';
import { toMcInasalFulfillmentStatus, toRingBackOrderStatus } from './fulfillmentMapping';
import { isAvailableAtLocation } from './menuAvailability';

const ConnectionConfigSchema = z.object({
  endpointUrl: z.string().url(),
  mcinasalLocationId: z.string().uuid(),
  ringbackLocationId: z.string().uuid(),
});

const CheckoutResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    version: z.number().int().positive(),
    order_number: z.string(),
    subtotal: z.number(),
    discount_amount: z.number(),
    tax_amount: z.number(),
    fee_amount: z.number(),
    tip_amount: z.number(),
    total: z.number(),
    checkout_url: z.string().url(),
    checkout_session_id: z.string().nullable().optional(),
    status: z.string(),
  }),
});

const FulfillmentResponseSchema = z.object({
  data: z.object({
    version: z.number().int().positive(),
    status: z.string(),
  }),
});

export class McInasalIntegrationError extends Error {
  constructor(
    message: string,
    public retryable = false,
    public status = 502
  ) {
    super(message);
  }
}

export async function hasActiveMcInasalConnection(tenantId: string): Promise<boolean> {
  return (
    (await prisma.integrationConnection.count({
      where: {
        tenantId,
        provider: 'mcinasal',
        status: 'active',
        accessTokenEncrypted: { not: null },
      },
    })) > 0
  );
}

export async function delegateCheckoutToMcInasal(input: {
  tenantId: string;
  orderId: string;
  callerPhone: string;
  customerName?: string | null;
  items: Array<{
    menuItemId: string;
    quantity: number;
    notes?: string | null;
    selectedModifiers?: Array<{
      groupId?: string;
      modifierId?: string;
      groupName: string;
      modifierName: string;
    }>;
  }>;
  pickupTime?: string | null;
  notes?: string | null;
}) {
  const connection = await prisma.integrationConnection.findFirst({
    where: {
      tenantId: input.tenantId,
      provider: 'mcinasal',
      status: 'active',
      accessTokenEncrypted: { not: null },
    },
    select: { id: true, config: true, accessTokenEncrypted: true },
  });
  if (!connection) return null;
  if (!connection.accessTokenEncrypted) {
    throw new McInasalIntegrationError('McInasal access token is not configured');
  }
  const config = ConnectionConfigSchema.parse(connection.config);
  const uniqueItemIds = [...new Set(input.items.map((item) => item.menuItemId))];
  const [mappings, menuItems] = await Promise.all([
    prisma.externalResourceMapping.findMany({
      where: {
        connectionId: connection.id,
        resourceType: 'menu_item',
        internalId: { in: uniqueItemIds },
      },
      select: { internalId: true, externalId: true },
    }),
    prisma.menuItem.findMany({
      where: { tenantId: input.tenantId, id: { in: uniqueItemIds } },
      include: {
        categoryRef: { select: { isAvailable: true } },
        locationAvailability: {
          where: { locationId: config.ringbackLocationId },
          select: { isAvailable: true },
        },
        modifierGroups: { include: { modifiers: true } },
      },
    }),
  ]);
  const externalByInternal = new Map(
    mappings.map((mapping) => [mapping.internalId, mapping.externalId])
  );
  const missing = uniqueItemIds.filter((id) => !externalByInternal.has(id));
  if (missing.length > 0) {
    throw new McInasalIntegrationError('One or more items are no longer mapped to McInasal');
  }
  if (
    menuItems.some(
      (item) => item.categoryRef?.isAvailable === false || !isAvailableAtLocation(item)
    )
  ) {
    throw new McInasalIntegrationError('One or more items are currently unavailable', false, 409);
  }
  const nameParts = (input.customerName || '').trim().split(/\s+/).filter(Boolean);
  const menuById = new Map(menuItems.map((item) => [item.id, item]));
  const normalized = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
  const body = {
    action: 'create_checkout',
    external_order_id: input.orderId,
    location_id: config.mcinasalLocationId,
    fulfillment: 'pickup',
    items: input.items.map((item) => {
      const sourceItem = menuById.get(item.menuItemId);
      const selected = item.selectedModifiers || [];
      const selectedModifiers = selected.map((selection) => {
        const group = sourceItem?.modifierGroups.find((candidate) =>
          selection.groupId
            ? candidate.id === selection.groupId
            : normalized(candidate.name) === normalized(selection.groupName)
        );
        const modifier = group?.modifiers.find((candidate) =>
          selection.modifierId
            ? candidate.id === selection.modifierId
            : normalized(candidate.name) === normalized(selection.modifierName)
        );
        if (!group?.posGroupId || !modifier?.posModifierId) {
          throw new McInasalIntegrationError(
            'One or more selected modifiers are no longer mapped to McInasal'
          );
        }
        return { group_id: group.posGroupId, modifier_id: modifier.posModifierId };
      });
      return {
        item_id: externalByInternal.get(item.menuItemId),
        quantity: item.quantity,
        note: item.notes || null,
        selected_modifiers: selectedModifiers,
      };
    }),
    customer: {
      first_name: nameParts[0] || 'Guest',
      last_name: nameParts.slice(1).join(' '),
      phone: input.callerPhone,
    },
    scheduled_for:
      input.pickupTime && Number.isFinite(Date.parse(input.pickupTime))
        ? new Date(input.pickupTime).toISOString()
        : null,
    notes: input.notes || null,
    tip: 0,
  };
  const response = await fetch(config.endpointUrl, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(25_000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${decrypt(connection.accessTokenEncrypted)}`,
      'X-Idempotency-Key': `ringback-checkout:${input.orderId}:v1`,
      'User-Agent': 'RingBackSMS-McInasal/1.0',
    },
    body: JSON.stringify(body),
  });
  const raw = (await response.text()).slice(0, 8_000);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new McInasalIntegrationError('McInasal returned an invalid response', true);
  }
  if (response.status < 200 || response.status >= 300) {
    const upstreamMessage =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : 'Checkout was rejected';
    throw new McInasalIntegrationError(
      upstreamMessage,
      response.status >= 500 || response.status === 409 || response.status === 429,
      response.status
    );
  }
  const checkout = CheckoutResponseSchema.parse(parsed).data;
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: input.orderId },
      data: {
        subtotal: checkout.subtotal,
        taxAmount: checkout.tax_amount,
        feeAmount: checkout.fee_amount,
        tipAmount: checkout.tip_amount,
        total: checkout.total,
        stripePaymentId: checkout.checkout_session_id || undefined,
        stripePaymentUrl: checkout.checkout_url,
        paymentStatus: 'PENDING',
        status: toRingBackOrderStatus(checkout.status),
        posOrderId: checkout.id,
        financialOwner: `integration:${connection.id}`,
        fulfillmentOwner: `integration:${connection.id}`,
        integrationVersion: { increment: 1 },
      },
    });
    await tx.externalResourceMapping.upsert({
      where: {
        connectionId_resourceType_internalId: {
          connectionId: connection.id,
          resourceType: 'order',
          internalId: input.orderId,
        },
      },
      create: {
        tenantId: input.tenantId,
        connectionId: connection.id,
        resourceType: 'order',
        internalId: input.orderId,
        externalId: checkout.id,
        externalVersion: String(checkout.version),
        lastSyncedAt: new Date(),
      },
      update: {
        externalId: checkout.id,
        externalVersion: String(checkout.version),
        lastSyncedAt: new Date(),
      },
    });
  });
  return checkout;
}

export async function delegateFulfillmentToMcInasal(input: {
  tenantId: string;
  orderId: string;
  status: OrderStatus;
}) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, tenantId: input.tenantId },
    select: {
      id: true,
      status: true,
      fulfillmentOwner: true,
      posOrderId: true,
    },
  });
  if (!order?.fulfillmentOwner.startsWith('integration:')) return null;
  const connectionId = order.fulfillmentOwner.slice('integration:'.length);
  const [connection, mapping] = await Promise.all([
    prisma.integrationConnection.findFirst({
      where: {
        id: connectionId,
        tenantId: input.tenantId,
        provider: 'mcinasal',
        status: 'active',
        accessTokenEncrypted: { not: null },
      },
      select: { config: true, accessTokenEncrypted: true },
    }),
    prisma.externalResourceMapping.findUnique({
      where: {
        connectionId_resourceType_internalId: {
          connectionId,
          resourceType: 'order',
          internalId: order.id,
        },
      },
      select: { id: true, externalId: true, externalVersion: true },
    }),
  ]);
  if (!connection?.accessTokenEncrypted) {
    throw new McInasalIntegrationError('The McInasal connection is not active', true, 503);
  }
  const config = ConnectionConfigSchema.parse(connection.config);
  const expectedVersion = Number(mapping?.externalVersion);
  if (
    !mapping ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 1 ||
    !order.posOrderId ||
    mapping.externalId !== order.posOrderId
  ) {
    throw new McInasalIntegrationError(
      'McInasal order ownership is not fully synchronized',
      true,
      409
    );
  }
  const desiredMcInasalStatus = toMcInasalFulfillmentStatus(input.status);
  if (!desiredMcInasalStatus) {
    throw new McInasalIntegrationError('This status cannot be delegated to McInasal', false, 400);
  }
  const response = await fetch(config.endpointUrl, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${decrypt(connection.accessTokenEncrypted)}`,
      'X-Idempotency-Key': `ringback-fulfillment:${order.id}:${expectedVersion}:${input.status}`,
      'User-Agent': 'RingBackSMS-McInasal/1.0',
    },
    body: JSON.stringify({
      action: 'update_fulfillment',
      order_id: mapping.externalId,
      expected_version: expectedVersion,
      status: input.status,
    }),
  });
  const raw = (await response.text()).slice(0, 8_000);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new McInasalIntegrationError('McInasal returned an invalid response', true);
  }
  const upstream = FulfillmentResponseSchema.safeParse(parsed);
  if (response.status < 200 || response.status >= 300) {
    if (
      response.status !== 409 ||
      !upstream.success ||
      upstream.data.data.status !== desiredMcInasalStatus
    ) {
      const upstreamMessage =
        parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as { error: unknown }).error)
          : 'McInasal rejected the fulfillment update';
      throw new McInasalIntegrationError(
        upstreamMessage,
        response.status >= 500 || response.status === 409 || response.status === 429,
        response.status
      );
    }
  }
  if (!upstream.success) {
    throw new McInasalIntegrationError('McInasal returned an invalid fulfillment response', true);
  }
  return prisma.$transaction(async (tx) => {
    await tx.order.updateMany({
      where: {
        id: order.id,
        tenantId: input.tenantId,
        status: order.status,
        fulfillmentOwner: order.fulfillmentOwner,
      },
      data: { status: input.status, integrationVersion: { increment: 1 } },
    });
    const updated = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
    if (updated.status !== input.status || updated.fulfillmentOwner !== order.fulfillmentOwner) {
      throw new McInasalIntegrationError('Order changed while McInasal was updating it', true, 409);
    }
    await tx.externalResourceMapping.update({
      where: { id: mapping.id },
      data: {
        externalVersion: String(upstream.data.data.version),
        lastSyncedAt: new Date(),
      },
    });
    return updated;
  });
}
