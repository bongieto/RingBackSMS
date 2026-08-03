import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '../apps/web/node_modules/@prisma/client/default.js';

const prisma = new PrismaClient();
const baseUrl = (process.env.COMMERCE_TEST_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const tenantId = randomUUID();
const token = `rb_live_${randomBytes(32).toString('base64url')}`;
const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const cronSecret = process.env.CRON_SECRET ?? 'commerce-verification-cron';

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok)
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status}: ${text}`);
  return { response, body };
}

async function main() {
  const connectionId = randomUUID();
  const locationId = randomUUID();
  const itemId = randomUUID();
  const conversationId = randomUUID();
  const orderId = randomUUID();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: 'Commerce Verification Tenant',
      slug: `commerce-verification-${tenantId}`,
      businessType: 'RESTAURANT',
      squareMerchantId: `SQ-MERCHANT-${tenantId}`,
      config: { create: { greeting: 'Verification greeting', requirePayment: true } },
      locations: { create: { id: locationId, name: 'Test Kitchen', timezone: 'America/Chicago' } },
      menuItems: { create: { id: itemId, name: 'Test Lumpia', price: 12.5, isAvailable: true } },
      integrationConnections: {
        create: { id: connectionId, provider: 'mcinasal', name: 'Verification KDS' },
      },
      conversations: {
        create: { id: conversationId, callerPhone: '+12175550199', flowType: 'ORDER' },
      },
    },
  });
  await prisma.apiCredential.create({
    data: {
      tenantId,
      connectionId,
      name: 'Verification key',
      keyPrefix: token.slice(0, 16),
      keyHash: createHash('sha256').update(token).digest('hex'),
      scopes: [
        'menu:read',
        'menu:write',
        'availability:write',
        'orders:read',
        'orders:write',
        'fulfillment:write',
        'webhooks:manage',
      ],
    },
  });
  await prisma.order.create({
    data: {
      id: orderId,
      tenantId,
      conversationId,
      callerPhone: '+12175550199',
      orderNumber: `VERIFY-${Date.now()}`,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      items: [{ menuItemId: itemId, name: 'Test Lumpia', quantity: 1, price: 12.5 }],
      subtotal: 12.5,
      total: 12.5,
      locationId,
    },
  });

  const unauthorized = await fetch(`${baseUrl}/api/v1/locations`);
  if (unauthorized.status !== 401)
    throw new Error(`Expected unauthenticated 401, got ${unauthorized.status}`);

  const locations = await request('/api/v1/locations', { headers: authHeaders });
  if (locations.body.data[0]?.id !== locationId) throw new Error('Location response mismatch');

  const menu = await request(`/api/v1/locations/${locationId}/menu`, { headers: authHeaders });
  if (menu.body.data.items[0]?.id !== itemId || menu.body.data.items[0]?.price !== 12.5) {
    throw new Error('Menu response mismatch');
  }
  const menuImport = await request(`/api/v1/locations/${locationId}/menu`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      revision: 'mcinasal-menu-v1',
      categories: [{ externalId: 'cat-rice', name: 'Rice Meals', sortOrder: 1 }],
      items: [
        {
          externalId: 'item-chicken-inasal',
          name: 'Chicken Inasal',
          description: 'Verification menu item',
          price: 14.25,
          categoryExternalId: 'cat-rice',
          isAvailable: true,
          modifierGroups: [
            {
              externalId: 'group-rice',
              name: 'Rice',
              required: true,
              minSelections: 1,
              maxSelections: 1,
              options: [{ externalId: 'opt-garlic', name: 'Garlic Rice', priceAdjustment: 1.5 }],
            },
          ],
        },
      ],
    }),
  });
  if (menuImport.body.data.created !== 1 || menuImport.body.data.revision !== 'mcinasal-menu-v1') {
    throw new Error('Menu snapshot import mismatch');
  }

  const availability = await request(`/api/v1/locations/${locationId}/availability/${itemId}`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ isAvailable: false, reason: 'Sold out', expectedRevision: 1 }),
  });
  if (availability.body.data.is_available !== false || availability.body.data.revision !== 1) {
    throw new Error('Availability update mismatch');
  }

  const staleAvailability = await fetch(
    `${baseUrl}/api/v1/locations/${locationId}/availability/${itemId}`,
    {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ isAvailable: true, expectedRevision: 2 }),
    }
  );
  if (staleAvailability.status !== 409)
    throw new Error(`Expected availability 409, got ${staleAvailability.status}`);

  const order = await request(`/api/v1/orders/${orderId}`, { headers: authHeaders });
  if (order.body.data.paymentStatus !== 'PAID' || order.body.data.integrationVersion !== 1) {
    throw new Error('Order response mismatch');
  }

  const externalOrderBody = {
    externalId: 'POS-VERIFY-1',
    locationId,
    items: [{ menuItemId: itemId, name: 'Test Lumpia', quantity: 1, unitPrice: 12.5 }],
    subtotal: 12.5,
    taxAmount: 0,
    feeAmount: 0,
    tipAmount: 0,
    total: 12.5,
    paymentStatus: 'PAID',
    fulfillmentStatus: 'CONFIRMED',
  };
  const imported = await request('/api/v1/orders', {
    method: 'POST',
    headers: { ...authHeaders, 'Idempotency-Key': 'verification-order-1' },
    body: JSON.stringify(externalOrderBody),
  });
  const replay = await request('/api/v1/orders', {
    method: 'POST',
    headers: { ...authHeaders, 'Idempotency-Key': 'verification-order-1' },
    body: JSON.stringify(externalOrderBody),
  });
  if (imported.body.data.id !== replay.body.data.id)
    throw new Error('Order idempotency replay mismatch');
  const mismatchedReplay = await fetch(`${baseUrl}/api/v1/orders`, {
    method: 'POST',
    headers: { ...authHeaders, 'Idempotency-Key': 'verification-order-1' },
    body: JSON.stringify({ ...externalOrderBody, externalId: 'POS-VERIFY-DIFFERENT' }),
  });
  if (mismatchedReplay.status !== 409)
    throw new Error(`Expected idempotency 409, got ${mismatchedReplay.status}`);

  const fulfillment = await request(`/api/v1/orders/${orderId}/fulfillment-status`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ status: 'COMPLETED', expectedVersion: 1, externalId: 'MC-VERIFY-1' }),
  });
  if (fulfillment.body.data.version !== 2 || fulfillment.body.data.refund_issued !== false) {
    throw new Error('Fulfillment update mismatch');
  }

  const staleFulfillment = await fetch(`${baseUrl}/api/v1/orders/${orderId}/fulfillment-status`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ status: 'CANCELLED', expectedVersion: 1 }),
  });
  if (staleFulfillment.status !== 409)
    throw new Error(`Expected fulfillment 409, got ${staleFulfillment.status}`);

  const webhook = await request('/api/v1/webhook-endpoints', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      url: 'https://httpbingo.org/status/204',
      description: 'Disposable verification endpoint',
      events: ['order.ready_for_fulfillment'],
    }),
  });
  if (!webhook.body.data.secret.startsWith('whsec_'))
    throw new Error('Webhook secret was not returned');
  const deliveryEvent = await prisma.integrationEvent.create({
    data: {
      tenantId,
      type: 'order.ready_for_fulfillment',
      apiVersion: '2026-08-01',
      resourceType: 'order',
      resourceId: orderId,
      payload: { order_id: orderId, verification: true },
    },
  });
  const squareOrder = await prisma.order.create({
    data: {
      tenantId,
      conversationId,
      callerPhone: 'external:square-verification',
      orderNumber: `SQ-VERIFY-${Date.now()}`,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      items: [{ menuItemId: itemId, name: 'Test Lumpia', quantity: 1, price: 12.5 }],
      total: 12.5,
      locationId,
      squareOrderId: 'SQ-ORDER-VERIFY-1',
      posOrderId: 'SQ-ORDER-VERIFY-1',
    },
  });
  const inbound = await prisma.inboundPosEvent.create({
    data: {
      provider: 'square',
      eventId: `square-verification-${tenantId}`,
      eventType: 'order.fulfillment.updated',
      payload: {
        merchant_id: `SQ-MERCHANT-${tenantId}`,
        type: 'order.fulfillment.updated',
        data: {
          object: {
            order_fulfillment_updated: {
              order_id: 'SQ-ORDER-VERIFY-1',
              fulfillment_update: [{ old_state: 'RESERVED', new_state: 'PREPARED' }],
            },
          },
        },
      },
    },
  });
  await request('/api/cron/commerce-webhooks', {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const delivery = await prisma.webhookDelivery.findFirst({
    where: { eventId: deliveryEvent.id, endpointId: webhook.body.data.id },
  });
  if (delivery?.status !== 'delivered' || delivery.responseStatus !== 204) {
    throw new Error(`Webhook delivery mismatch: ${JSON.stringify(delivery)}`);
  }
  const [processedInbound, reconciledSquareOrder] = await Promise.all([
    prisma.inboundPosEvent.findUnique({ where: { id: inbound.id } }),
    prisma.order.findUnique({ where: { id: squareOrder.id } }),
  ]);
  if (processedInbound?.status !== 'processed' || reconciledSquareOrder?.status !== 'READY') {
    throw new Error('Durable inbound Square fulfillment reconciliation mismatch');
  }
  await request(`/api/v1/webhook-endpoints/${webhook.body.data.id}`, {
    method: 'DELETE',
    headers: authHeaders,
  });

  const [availabilityEvents, orderEvents, mapping] = await Promise.all([
    prisma.integrationEvent.count({ where: { tenantId, type: 'menu.availability.updated' } }),
    prisma.integrationEvent.count({ where: { tenantId, type: 'order.updated' } }),
    prisma.externalResourceMapping.findFirst({ where: { tenantId, internalId: orderId } }),
  ]);
  if (availabilityEvents < 1 || orderEvents < 1 || mapping?.externalId !== 'MC-VERIFY-1') {
    throw new Error('Transactional event or external mapping mismatch');
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        verified: [
          'bearer authentication',
          'locations and menu',
          'external menu snapshot with category and modifiers',
          'location availability and conflict handling',
          'paid order read',
          'external order import and idempotent replay',
          'fulfillment transition and conflict handling',
          'external order mapping',
          'webhook registration and revocation',
          'signed webhook delivery and success recording',
          'durable inbound Square fulfillment reconciliation',
          'transactional integration events',
        ],
      },
      null,
      2
    )
  );
}

try {
  await main();
} finally {
  await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  await prisma.$disconnect();
}
