import { posRegistry } from './registry';
import { logger } from '../logger';

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

    // Determine tenant from event payload (provider-specific)
    const tenantId = extractTenantId(provider, event);

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
        const count = await adapter.syncCatalogFromPOS(tenantId);
        logger.info('Webhook-triggered catalog sync completed', {
          provider,
          tenantId,
          syncedCount: count,
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
 * Extracts the tenant ID from a webhook event payload.
 * Each provider encodes merchant/tenant info differently.
 */
function extractTenantId(
  provider: string,
  event: WebhookEvent,
): string | null {
  switch (provider) {
    case 'square':
      return (event.merchant_id as string) ?? null;
    case 'clover':
      return (event.merchant_id as string) ?? null;
    case 'toast':
      return (event.restaurantGuid as string) ?? null;
    case 'shopify': {
      const domain =
        (event.domain as string) ??
        ((event as Record<string, unknown>)['x-shopify-shop-domain'] as string);
      return domain ?? null;
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
