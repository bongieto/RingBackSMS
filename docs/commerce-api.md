# RingBack Commerce API

The Commerce API connects a tenant to McInasal or another restaurant/POS
system without exposing dashboard-session endpoints. The API is versioned at
`/api/v1` and uses tenant-scoped bearer credentials.

## Ownership

- RingBack owns the customer conversation and the pre-payment order draft.
- For the McInasal connection, McInasal owns canonical pricing, payment,
  refunds, fulfillment, loyalty, tax, and financial totals. RingBack stores a
  read-only operational/payment projection and a separate sales projection.
- Payment state and fulfillment state are separate. A `CANCELLED` fulfillment
  update does not issue a refund.
- For payment-required tenants, an order event is not emitted until the order
  is `PAID`.

## Authentication

Create credentials through the authenticated tenant endpoint:

```http
POST /api/tenants/{tenantId}/commerce/credentials
Content-Type: application/json

{
  "name": "McInasal production",
  "provider": "mcinasal",
  "connectionName": "McInasal",
  "scopes": [
    "menu:read",
    "menu:write",
    "availability:write",
    "orders:read",
    "orders:write",
    "financials:write",
    "fulfillment:write",
    "webhooks:manage"
  ]
}
```

The `rb_live_...` token is returned once. Store it in the partner's secret
manager. RingBack stores only its SHA-256 hash. Send it as:

```http
Authorization: Bearer rb_live_...
```

Credentials can be revoked immediately with:

```http
DELETE /api/tenants/{tenantId}/commerce/credentials/{credentialId}
```

## Resources

```text
GET    /api/v1/locations
GET    /api/v1/locations/{locationId}/menu
PUT    /api/v1/locations/{locationId}/menu
PATCH  /api/v1/locations/{locationId}/availability/{itemId}
PATCH  /api/v1/locations/{locationId}/availability
GET    /api/v1/orders/{orderId}
POST   /api/v1/orders
POST   /api/v1/sales
PATCH  /api/v1/orders/{orderId}/fulfillment-status
GET    /api/v1/webhook-endpoints
POST   /api/v1/webhook-endpoints
DELETE /api/v1/webhook-endpoints/{endpointId}
```

Availability updates and fulfillment updates use optimistic concurrency.
Send the `expectedRevision` or `expectedVersion` returned by the preceding
read. A stale writer receives HTTP `409` and must fetch before retrying.

Full menu snapshots require a strictly increasing positive `sequence` and a
lowercase SHA-256 `checksum` of the canonical categories/items content. An
exact sequence/checksum retry is idempotent; a lower sequence or a reused
sequence with different content receives HTTP `409`. Modifier group and option
IDs remain stable across snapshots, and conditional modifier rules are carried
in each group's `conditions` array.

`POST /api/v1/sales` requires `financials:write`. The external financial owner
sends a monotonic version, paid/refund status, integer-cent gross/discount/tax/
fee/tip/refund/net totals, tender types, item facts, and a separate
`fulfillmentStatus`. RingBack rejects any
projection where `netCents != grossCents - refundCents`; pending and cancelled
unpaid projections never count as revenue.

## Webhooks

Webhook URLs must be credential-free HTTPS URLs on port 443 and must not
resolve to a private/reserved network. Each delivery contains:

```json
{
  "id": "event UUID",
  "type": "order.ready_for_fulfillment",
  "api_version": "2026-08-03",
  "created_at": "2026-08-03T19:00:00.000Z",
  "tenant_id": "tenant UUID",
  "location_id": "location UUID",
  "data": {
    "order_id": "order UUID",
    "resource_url": "/api/v1/orders/order UUID",
    "version": 1
  }
}
```

Verify `X-RingBack-Signature` by calculating the lowercase hexadecimal
HMAC-SHA256 of `{timestamp}.{raw request body}` with the endpoint secret. The
header is formatted as `v1={digest}`. Reject timestamps older than five
minutes and deduplicate on `X-RingBack-Event-Id`.

Return a `2xx` within eight seconds. RingBack retries failures with exponential
backoff and moves a delivery to dead-letter state after eight attempts.

## McInasal production flow

1. Create one `McInasal` connection and issue an inbound RingBack credential
   with menu, availability, financial, fulfillment, and webhook scopes.
2. Configure the same connection's outbound McInasal endpoint and encrypted
   `mc_rb_live_...` token through
   `PUT /api/tenants/{tenantId}/commerce/mcinasal`; keep it disabled.
3. McInasal pushes a full menu snapshot, then availability changes. RingBack
   maps source IDs without replacing modifier rows.
4. During a conversation, RingBack sends source item/modifier IDs to
   McInasal's scoped checkout endpoint. McInasal revalidates the live cart and
   returns its own Stripe hosted checkout URL and canonical totals.
5. McInasal sends monotonic paid/refund sales projections with the canonical
   fulfillment state. RingBack reports net sales without inventing
   conversations or counting unpaid orders.
6. RingBack dashboard fulfillment changes are delegated to McInasal with the
   last McInasal version. RingBack-owned payment and refund paths fail closed
   for these orders; paid cancellations remain blocked until the refund is
   performed in McInasal.
7. Signed RingBack fulfillment events are deduplicated by McInasal, and failed
   webhook claims can be safely retried after a terminated worker.

Production activation requires a sandbox replay, a controlled paid order, KDS
receipt, status round-trip, customer SMS observation, and reconciliation of
the RingBack payment with the restaurant order. Repository tests alone do not
prove those live surfaces.
