import { posRegistry } from './registry';
import { logger } from '../logger';
import { prisma } from '../db';

interface WebhookEvent {
  type?: string;
  event_type?: string;
  [key: string]: unknown;
}

/**
 * Dispatches and handles incoming POS webhook events.
 *
 * Called by the webhook route after signature verification.
 * Handles common event types like catalog updates (trigger re-sync)
 * and order updates (logging).
 */
export async function handlePosWebhookEvent(
  provider: string,
  body: unknown,
): Promise<void> {
  const event = body as WebhookEvent;
  const eventType = event.type ?? event.event_type ?? 'unknown';

  logger.info('POS webhook event received', {
    provider,
    eventType,
  });

  try {
    const adapter = posRegistry.get(provider);

    // Determine tenant from event payload (provider-specific).
    // Square/Clover send their own merchant_id; we have to look up our
    // Tenant row that's linked to that external id. Other providers
    // might carry our tenant id directly — delegate to the resolver.
    const tenantId = await resolveTenantId(provider, event);

    if (!tenantId) {
      logger.warn('Could not determine tenant from webhook event', {
        provider,
        eventType,
      });
      return;
    }

    // Handle common event categories
    if (isCatalogUpdateEvent(provider, eventType)) {
      logger.info('Catalog update webhook received, triggering re-sync', {
        provider,
        tenantId,
        eventType,
      });
      try {
        const result = await adapter.syncCatalogFromPOS(tenantId);
        logger.info('Webhook-triggered catalog sync completed', {
          provider,
          tenantId,
          syncResult: result,
        });
      } catch (err) {
        logger.error('Webhook-triggered catalog sync failed', {
          provider,
          tenantId,
          error: (err as Error).message,
        });
      }
    } else if (isOrderUpdateEvent(provider, eventType)) {
      logger.info('Order update webhook received', {
        provider,
        tenantId,
        eventType,
        orderId: extractOrderId(provider, event),
      });
    } else {
      logger.debug('Unhandled POS webhook event type', {
        provider,
        tenantId,
        eventType,
      });
    }
  } catch (err) {
    logger.error('Error processing POS webhook event', {
      provider,
      eventType,
      error: (err as Error).message,
    });
  }
}

/**
 * Resolve our RingbackSMS `Tenant.id` from a webhook event. Providers
 * identify themselves by their own merchant id (Square / Clover),
 * restaurant GUID (Toast), or shop domain (Shopify) — we store those
 * on the Tenant row during OAuth, so a lookup here maps them back.
 *
 * Returns null when no matching tenant exists (event fires for an
 * account we don't know about — should not happen in practice but
 * we log and skip rather than crash).
 */
async function resolveTenantId(
  provider: string,
  event: WebhookEvent,
): Promise<string | null> {
  switch (provider) {
    case 'square': {
      const merchantId = event.merchant_id as string | undefined;
      if (!merchantId) return null;
      const tenant = await prisma.tenant.findFirst({
        where: { squareMerchantId: merchantId },
        select: { id: true },
      });
      return tenant?.id ?? null;
    }
    case 'clover': {
      const merchantId = event.merchant_id as string | undefined;
      if (!merchantId) return null;
      const tenant = await prisma.tenant.findFirst({
        where: { posMerchantId: merchantId, posProvider: 'clover' },
        select: { id: true },
      });
      return tenant?.id ?? null;
    }
    case 'toast': {
      const guid = event.restaurantGuid as string | undefined;
      if (!guid) return null;
      const tenant = await prisma.tenant.findFirst({
        where: { posMerchantId: guid, posProvider: 'toast' },
        select: { id: true },
      });
      return tenant?.id ?? null;
    }
    case 'shopify': {
      const domain =
        (event.domain as string | undefined) ??
        ((event as Record<string, unknown>)['x-shopify-shop-domain'] as string | undefined);
      if (!domain) return null;
      const tenant = await prisma.tenant.findFirst({
        where: { posMerchantId: domain, posProvider: 'shopify' },
        select: { id: true },
      });
      return tenant?.id ?? null;
    }
    default:
      return null;
  }
}

/**
 * Determines if the event type represents a catalog/inventory update.
 */
function isCatalogUpdateEvent(provider: string, eventType: string): boolean {
  const catalogEvents: Record<string, string[]> = {
    square: [
      'catalog.version.updated',
      'inventory.count.updated',
    ],
    clover: [
      'ITEM_CREATED',
      'ITEM_UPDATED',
      'ITEM_DELETED',
    ],
    toast: [
      'menus.published',
      'menus.updated',
    ],
    shopify: [
      'products/create',
      'products/update',
      'products/delete',
    ],
  };

  return (catalogEvents[provider] ?? []).includes(eventType);
}

/**
 * Determines if the event type represents an order update.
 */
function isOrderUpdateEvent(provider: string, eventType: string): boolean {
  const orderEvents: Record<string, string[]> = {
    square: [
      'order.created',
      'order.updated',
      'order.fulfillment.updated',
    ],
    clover: [
      'ORDER_CREATED',
      'ORDER_UPDATED',
    ],
    toast: [
      'order.created',
      'order.updated',
    ],
    shopify: [
      'orders/create',
      'orders/updated',
      'orders/fulfilled',
    ],
  };

  return (orderEvents[provider] ?? []).includes(eventType);
}

/**
 * Extracts the order ID from a webhook event, if present.
 */
function extractOrderId(
  provider: string,
  event: WebhookEvent,
): string | null {
  switch (provider) {
    case 'square': {
      const data = event.data as Record<string, unknown> | undefined;
      const obj = data?.object as Record<string, unknown> | undefined;
      return (obj?.order_id as string) ?? null;
    }
    case 'clover':
      return (event.objectId as string) ?? null;
    case 'toast':
      return (event.orderGuid as string) ?? null;
    case 'shopify':
      return event.id ? String(event.id) : null;
    default:
      return null;
  }
}
