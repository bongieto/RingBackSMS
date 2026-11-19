import type { PosCustomOrderItem, PosOrderItem } from './adapters/base';

/** One line of Order.items as stored on the order row. */
export interface OrderLineInput {
  menuItemId?: string | null;
  name?: string | null;
  price?: unknown;
  quantity: number;
}

/** The MenuItem columns needed to decide how a line reaches the POS. */
export interface MenuLinkRow {
  id: string;
  name: string;
  price: unknown;
  posVariationId: string | null;
  squareVariationId: string | null;
}

export interface DroppedOrderLine {
  menuItemId: string | null;
  name: string;
  reason: string;
}

export interface PosOrderLines {
  /** Lines backed by a POS catalog variation. */
  linked: PosOrderItem[];
  /** Lines with no catalog link, sent as custom (ad-hoc) lines. */
  custom: PosCustomOrderItem[];
  /** Lines that cannot reach the POS at all. */
  dropped: DroppedOrderLine[];
}

function toCents(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Decide how each order line reaches the POS.
 *
 * A line whose MenuItem is linked to the POS catalog goes by variation id.
 * A line with no link (a MenuItem created by hand and never matched to the
 * POS, or one deleted since) used to be dropped, and an order made only of
 * such lines never reached the POS at all. When the adapter can take custom
 * lines we send name + price instead, so the kitchen still gets a ticket.
 */
export function splitOrderItemsForPos(
  items: OrderLineInput[],
  menuRows: MenuLinkRow[],
  opts: { supportsCustomLineItems: boolean },
): PosOrderLines {
  const byId = new Map(menuRows.map((m) => [m.id, m]));
  const lines: PosOrderLines = { linked: [], custom: [], dropped: [] };

  for (const item of items) {
    const menuItemId =
      typeof item.menuItemId === 'string' && item.menuItemId.length > 0 ? item.menuItemId : null;
    const ref = menuItemId ? byId.get(menuItemId) : undefined;
    const variationId = ref?.posVariationId ?? ref?.squareVariationId ?? null;

    if (variationId) {
      lines.linked.push({ externalVariationId: variationId, quantity: item.quantity });
      continue;
    }

    const name = item.name?.trim() || ref?.name?.trim() || '';
    const unlinkedReason = !menuItemId
      ? 'order line has no menuItemId'
      : !ref
        ? 'menuItem row no longer exists (deleted?)'
        : 'no posVariationId or squareVariationId (orphan item, not linked to POS)';

    if (!opts.supportsCustomLineItems) {
      lines.dropped.push({ menuItemId, name: name || '(unknown)', reason: unlinkedReason });
      continue;
    }

    // Prefer the price the customer was actually charged for this line.
    const priceCents = toCents(item.price) ?? toCents(ref?.price);
    if (!name || priceCents === null) {
      lines.dropped.push({
        menuItemId,
        name: name || '(unknown)',
        reason: `${unlinkedReason}; no name or price to build a custom line`,
      });
      continue;
    }

    lines.custom.push({ name, priceCents, quantity: item.quantity });
  }

  return lines;
}

/**
 * Owner-facing alert for an order that did not fully reach the POS.
 * Deliberately carries no customer details: it goes out by SMS and email.
 */
export function buildPosPushAlert(input: {
  orderNumber: string;
  posName: string;
  /** 'not_sent' = nothing reached the POS; 'partial' = sent with lines missing. */
  kind: 'not_sent' | 'partial';
  dropped: DroppedOrderLine[];
  errorMessage?: string | null;
}): { subject: string; message: string } {
  const names = Array.from(new Set(input.dropped.map((d) => d.name)));
  const itemList = names.length > 0 ? names.join(', ') : null;

  if (input.kind === 'partial') {
    return {
      subject: `Order ${input.orderNumber} reached ${input.posName} with items missing`,
      message:
        `Missing from the ${input.posName} ticket: ${itemList ?? 'one or more items'}. ` +
        `Check the order in RingbackSMS and make the missing items. ` +
        `These menu items are not linked to ${input.posName}.`,
    };
  }

  const why = itemList
    ? `Not linked to ${input.posName}: ${itemList}.`
    : input.errorMessage
      ? `${input.posName} error: ${input.errorMessage.slice(0, 140)}`
      : `The order could not be sent.`;
  return {
    subject: `Order ${input.orderNumber} was NOT sent to ${input.posName}`,
    message:
      `No ticket printed. Open the order in RingbackSMS and make it by hand. ${why}`,
  };
}
