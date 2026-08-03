# RingBack Commerce API

The Commerce API connects a tenant to McInasal or another restaurant/POS
system without exposing dashboard-session endpoints. The API is versioned at
`/api/v1` and uses tenant-scoped bearer credentials.

## Ownership

- RingBack owns the customer conversation and its payment ledger.
- The connected restaurant system owns fulfillment after it receives
  `order.ready_for_fulfillment`.
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
  "connectionName": "McInasal KDS",
  "scopes": [
    "menu:read",
    "menu:write",
    "availability:write",
    "orders:read",
    "orders:write",
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
PATCH  /api/v1/orders/{orderId}/fulfillment-status
GET    /api/v1/webhook-endpoints
POST   /api/v1/webhook-endpoints
DELETE /api/v1/webhook-endpoints/{endpointId}
```

Availability updates and fulfillment updates use optimistic concurrency.
Send the `expectedRevision` or `expectedVersion` returned by the preceding
read. A stale writer receives HTTP `409` and must fetch before retrying.

## Webhooks

Webhook URLs must be credential-free HTTPS URLs on port 443 and must not
resolve to a private/reserved network. Each delivery contains:

```json
{
  "id": "event UUID",
  "type": "order.ready_for_fulfillment",
  "api_version": "2026-08-01",
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

1. Register a production API credential and webhook endpoint.
2. Read locations and the canonical menu.
3. Update location-specific item availability when the 86 Board changes.
4. Receive `order.ready_for_fulfillment` and deduplicate its event ID.
5. Fetch the order from its `resource_url` and place it on the KDS.
6. Update fulfillment with the current `expectedVersion`.
7. RingBack sends customer status messages for confirmed, preparing, ready,
   and cancelled states.

Production activation requires a sandbox replay, a controlled paid order, KDS
receipt, status round-trip, customer SMS observation, and reconciliation of
the RingBack payment with the restaurant order. Repository tests alone do not
prove those live surfaces.
