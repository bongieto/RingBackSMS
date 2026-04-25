import { OrderStatus } from '@prisma/client';
import { waitUntil } from '@vercel/functions';
import { logger } from '../logger';
import { prisma } from '../db';
import { autoCompleteTasksForEntity } from './taskService';
import { currentTurnId } from '../turn/TurnContext';

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

// ── Prep time calculation ─────────────────────────────────────────────────

export interface PrepTimeOverride {
  dayOfWeek: number;
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
  extraMinutes: number;
  label?: string;
}

export interface PrepTimeConfig {
  defaultPrepTimeMinutes: number | null;
  largeOrderThresholdItems: number | null;
  largeOrderExtraMinutes: number | null;
  prepTimeOverrides: unknown; // Json from Prisma
  timezone: string | null;
  minutesPerQueuedOrder?: number | null;
}

function activeOverrideExtra(
  overrides: PrepTimeOverride[],
  timezone: string,
  now: Date,
): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const currentDay = dayMap[wd] ?? 0;
    const currentMin = parseInt(hh, 10) * 60 + parseInt(mm, 10);
    let total = 0;
    for (const o of overrides) {
      if (o.dayOfWeek !== currentDay) continue;
      const [sH, sM] = o.start.split(':').map(Number);
      const [eH, eM] = o.end.split(':').map(Number);
      const sMin = sH * 60 + sM;
      const eMin = eH * 60 + eM;
      if (currentMin >= sMin && currentMin < eMin) total += o.extraMinutes;
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Computes the total prep time in minutes for a new order based on the
 * tenant's config and the order's item count. Applies the default,
 * any currently-active override windows, and the large-order extra.
 * Returns `null` if the tenant hasn't configured prep time at all
 * (i.e. `defaultPrepTimeMinutes` is null) — callers should skip writing
 * `estimatedReadyTime` in that case so we don't fabricate a ready time.
 */
export function calculatePrepTime(
  config: PrepTimeConfig,
  itemCount: number,
  queueCount: number = 0,
  now: Date = new Date(),
): {
  totalMinutes: number;
  breakdown: { base: number; overrideExtra: number; largeOrderExtra: number; queueExtra: number; queueCount: number };
} | null {
  if (config.defaultPrepTimeMinutes == null) return null;
  const base = config.defaultPrepTimeMinutes;
  const overrides = Array.isArray(config.prepTimeOverrides)
    ? (config.prepTimeOverrides as PrepTimeOverride[])
    : [];
  const overrideExtra = activeOverrideExtra(overrides, config.timezone ?? 'America/Chicago', now);
  const largeOrderExtra =
    config.largeOrderThresholdItems != null &&
    itemCount >= config.largeOrderThresholdItems
      ? config.largeOrderExtraMinutes ?? 0
      : 0;
  const perQueue = config.minutesPerQueuedOrder ?? 0;
  const queueExtra = Math.max(0, queueCount) * perQueue;
  return {
    totalMinutes: base + overrideExtra + largeOrderExtra + queueExtra,
    breakdown: { base, overrideExtra, largeOrderExtra, queueExtra, queueCount },
  };
}

export interface CreateOrderInput {
  tenantId: string;
  conversationId: string;
  callerPhone: string;
  items: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    price: number;
    notes?: string;
  }>;
  total: number;
  /** Optional breakdown; when absent we assume subtotal == total, tax/fee = 0. */
  subtotal?: number;
  taxAmount?: number;
  feeAmount?: number;
  pickupTime: string | null;
  notes: string | null;
  /** Customer-provided name captured during the order. Shown on kitchen
   *  ticket and the READY SMS. Also backfilled onto the Contact row when
   *  the existing Contact has no name yet. */
  customerName?: string | null;
  stripePaymentId?: string;
  stripePaymentUrl?: string;
  paymentStatus?: string;
}

export async function createOrder(input: CreateOrderInput) {
  // Compute estimated ready time from the tenant's prep-time config if set.
  // Reads only the fields we need so this is a cheap single-row select.
  const cfg = await prisma.tenantConfig.findUnique({
    where: { tenantId: input.tenantId },
    select: {
      defaultPrepTimeMinutes: true,
      largeOrderThresholdItems: true,
      largeOrderExtraMinutes: true,
      prepTimeOverrides: true,
      timezone: true,
      minutesPerQueuedOrder: true,
    },
  });
  const itemCount = input.items.reduce((s, i) => s + (i.quantity ?? 1), 0);
  // Count orders ahead of this one at write-time so estimatedReadyTime
  // reflects real kitchen load. We query BEFORE insert so the new order
  // doesn't count itself.
  const queueCount = await prisma.order.count({
    where: { tenantId: input.tenantId, status: { in: ['CONFIRMED', 'PREPARING'] } },
  });
  const prep = cfg
    ? calculatePrepTime(
        {
          defaultPrepTimeMinutes: cfg.defaultPrepTimeMinutes,
          largeOrderThresholdItems: cfg.largeOrderThresholdItems,
          largeOrderExtraMinutes: cfg.largeOrderExtraMinutes,
          prepTimeOverrides: cfg.prepTimeOverrides,
          timezone: cfg.timezone,
          minutesPerQueuedOrder: cfg.minutesPerQueuedOrder,
        },
        itemCount,
        queueCount,
      )
    : null;
  const estimatedReadyTime = prep
    ? new Date(Date.now() + prep.totalMinutes * 60_000)
    : null;

  // Fallback: if the caller didn't restate their name this session, use
  // whatever's already on their Contact row (decrypting). Keeps returning
  // customers' Order.customerName populated without forcing the agent to
  // re-ask every time.
  let effectiveName: string | null = input.customerName ?? null;
  if (!effectiveName) {
    const existingContact = await prisma.contact.findFirst({
      where: { tenantId: input.tenantId, phone: input.callerPhone },
      select: { name: true },
    });
    if (existingContact?.name) {
      try {
        // Use decryptMaybePlaintext: some legacy rows store Contact.name
        // as plaintext (pre-encryption rollout); new rows are encrypted.
        // This helper Just Works for both.
        const { decryptMaybePlaintext } = await import('../encryption');
        effectiveName = decryptMaybePlaintext(existingContact.name);
      } catch {
        // If decryption fails (e.g. key rotated, malformed data), leave
        // null. Order still saves; we just lose the greeting.
      }
    }
  }

  const order = await prisma.order.create({
    data: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      callerPhone: input.callerPhone,
      orderNumber: generateOrderNumber(),
      status: OrderStatus.CONFIRMED,
      items: input.items,
      total: input.total,
      subtotal: input.subtotal ?? input.total,
      taxAmount: input.taxAmount ?? 0,
      feeAmount: input.feeAmount ?? 0,
      customerName: effectiveName,
      pickupTime: input.pickupTime,
      estimatedReadyTime,
      notes: input.notes,
      ...(input.stripePaymentId && { stripePaymentId: input.stripePaymentId }),
      ...(input.stripePaymentUrl && { stripePaymentUrl: input.stripePaymentUrl }),
      ...(input.paymentStatus && { paymentStatus: input.paymentStatus }),
      causingTurnId: currentTurnId() ?? null,
    },
  });

  logger.info('Order created', {
    tenantId: input.tenantId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    total: order.total,
  });

  // Denormalize onto Contact so getCallerContext can read lastOrder cheaply
  // and the dashboard can show lifetime totals without aggregating Orders.
  // Also backfill Contact.name + search hash from the captured customer
  // name — only if the Contact doesn't already have one (don't clobber
  // manually-edited data).
  try {
    const totalCents = Math.round(Number(order.total) * 100);
    // Loyalty: 1 point per $ of items subtotal (pre-tax, pre-fee). Keeps
    // the math intuitive for customers ("spend $10 → get 10 points") and
    // avoids rewarding processing fees / taxes that aren't margin.
    const loyaltyBase = input.subtotal != null ? Number(input.subtotal) : Number(order.total);
    const pointsEarned = Math.max(0, Math.floor(loyaltyBase));
    await prisma.contact.updateMany({
      where: { tenantId: input.tenantId, phone: input.callerPhone },
      data: {
        lastOrderId: order.id,
        lastOrderAt: order.createdAt,
        totalOrders: { increment: 1 },
        totalSpent: { increment: totalCents },
        loyaltyPoints: { increment: pointsEarned },
        lastContactAt: new Date(),
      },
    });
    if (input.customerName && input.customerName.trim().length > 0) {
      const existing = await prisma.contact.findFirst({
        where: { tenantId: input.tenantId, phone: input.callerPhone },
        select: { id: true, name: true },
      });
      if (existing && !existing.name) {
        const { encryptNullable, hashForSearch } = await import('../encryption');
        await prisma.contact.update({
          where: { id: existing.id },
          data: {
            name: encryptNullable(input.customerName),
            nameSearchHash: hashForSearch(input.customerName, input.tenantId),
          },
        });
      }
    }
  } catch (err) {
    logger.warn('Failed to denormalize order onto Contact', { err, orderId: order.id });
  }

  // Fire-and-forget: push the order to the tenant's POS (Square / Clover /
  // Shopify / Toast). The /dashboard/integrations UI promises "Orders will
  // be automatically sent to Square" — this is where that promise lives.
  // Every order-creation path (agent, regex, Stripe webhook, dashboard)
  // flows through createOrder, so hooking here covers them all. We wrap in
  // waitUntil so the POS API call survives Vercel's request teardown
  // without blocking the caller's response latency.
  //
  // If the order was already paid externally (e.g. Stripe), we also pass
  // totalCents + externalSource so the adapter records an external-tender
  // Payment — otherwise the order would sit OPEN in Square forever.
  //
  // SKIP POS push for PENDING orders — customer hasn't paid yet and may
  // never pay. Pushing now would create phantom orders in Square. The
  // Stripe webhook calls pushOrderToPos after payment confirms.
  if (input.paymentStatus !== 'PENDING') {
    const totalCents = Math.round(Number(input.total) * 100);
    const taxCents = Math.round(Number(input.taxAmount ?? 0) * 100);
    const feeCents = Math.round(Number(input.feeAmount ?? 0) * 100);
    const paidViaStripe = input.paymentStatus === 'PAID' && !!input.stripePaymentId;
    waitUntil(
      pushOrderToPos(order.id, input.tenantId, input.conversationId, input.items, {
        totalCents: paidViaStripe ? totalCents : undefined,
        taxCents: paidViaStripe && taxCents > 0 ? taxCents : undefined,
        feeCents: paidViaStripe && feeCents > 0 ? feeCents : undefined,
        externalSource: paidViaStripe ? 'Stripe' : undefined,
        externalSourceId: paidViaStripe ? input.stripePaymentId : undefined,
        customerName: input.customerName ?? null,
        pickupTime: input.pickupTime ?? null,
        tenantTimezone: cfg?.timezone ?? null,
      }).catch((err) =>
        logger.error('POS push failed (non-fatal)', { err, orderId: order.id }),
      ),
    );
  }

  return order;
}

/**
 * Push a freshly-created order to the tenant's POS via its adapter and
 * record the external order id on the Order row. Non-fatal: we log on
 * failure so the customer still gets their SMS confirmation even if
 * Square is temporarily unreachable.
 */
export async function pushOrderToPos(
  orderId: string,
  tenantId: string,
  conversationId: string,
  items: CreateOrderInput['items'],
  payment?: {
    totalCents?: number;
    taxCents?: number;
    feeCents?: number;
    tipCents?: number;
    externalSource?: string;
    externalSourceId?: string;
    customerName?: string | null;
    pickupTime?: string | null;
    tenantTimezone?: string | null;
  },
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { posProvider: true, posLocationId: true },
  });
  if (!tenant?.posProvider || !tenant.posLocationId) {
    logger.info('POS push skipped — tenant has no POS connected', {
      orderId,
      tenantId,
      hasProvider: !!tenant?.posProvider,
      hasLocationId: !!tenant?.posLocationId,
    });
    return;
  }

  // Items need a variation id for the POS. Fetch the matching MenuItem
  // rows to look up squareVariationId / posVariationId; our order items
  // carry menuItemId but not the external ids.
  const menuItemIds = items
    .map((i) => (i as { menuItemId?: string }).menuItemId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (menuItemIds.length === 0) {
    logger.warn('POS push skipped — no menuItemIds on order items', { orderId, tenantId });
    return;
  }

  const menuRows = await prisma.menuItem.findMany({
    where: { tenantId, id: { in: menuItemIds } },
    select: { id: true, name: true, posVariationId: true, squareVariationId: true },
  });
  const byId = new Map(menuRows.map((m) => [m.id, m]));

  // Track which items got dropped for diagnostics. Common failure
  // mode: manually-created MenuItem that was never linked to Square.
  const droppedItems: Array<{ menuItemId: string; name: string; reason: string }> = [];
  const posItems = items
    .map((i) => {
      const itemTyped = i as { menuItemId: string; name?: string };
      const ref = byId.get(itemTyped.menuItemId);
      if (!ref) {
        droppedItems.push({
          menuItemId: itemTyped.menuItemId,
          name: itemTyped.name ?? '(unknown)',
          reason: 'menuItem row no longer exists (deleted?)',
        });
        return null;
      }
      const variationId = ref.posVariationId ?? ref.squareVariationId;
      if (!variationId) {
        droppedItems.push({
          menuItemId: itemTyped.menuItemId,
          name: ref.name,
          reason: 'no posVariationId or squareVariationId (orphan item, not linked to POS)',
        });
        return null;
      }
      return { externalVariationId: variationId, quantity: i.quantity };
    })
    .filter((x): x is { externalVariationId: string; quantity: number } => x !== null);

  if (droppedItems.length > 0) {
    logger.warn('POS push: some items dropped (not linked to POS catalog)', {
      orderId,
      tenantId,
      dropped: droppedItems,
      kept: posItems.length,
    });
  }

  if (posItems.length === 0) {
    logger.warn('POS push skipped — no items survived linkage check', {
      orderId,
      tenantId,
      totalItemsOnOrder: items.length,
      droppedCount: droppedItems.length,
    });
    return;
  }

  const { posRegistry } = await import('../pos/registry');
  const adapter = posRegistry.get(tenant.posProvider);

  const result = await adapter.createOrder(tenantId, posItems, {
    locationId: tenant.posLocationId,
    idempotencyKey: `ringback-${conversationId}-${orderId}`,
    totalCents: payment?.totalCents,
    taxCents: payment?.taxCents,
    feeCents: payment?.feeCents,
    tipCents: payment?.tipCents,
    externalSource: payment?.externalSource,
    externalSourceId: payment?.externalSourceId,
    customerName: payment?.customerName ?? null,
    pickupTime: payment?.pickupTime ?? null,
    tenantTimezone: payment?.tenantTimezone ?? null,
  });

  await prisma.order.update({
    where: { id: orderId },
    data: {
      squareOrderId: tenant.posProvider === 'square' ? result.externalOrderId : undefined,
      posOrderId: result.externalOrderId,
      // Also stamp the external-tender payment id when the adapter
      // recorded one. Lets ops verify the Square order closed out paid
      // without having to open the Square Dashboard.
      ...(result.externalPaymentId
        ? {
            squarePaymentId: tenant.posProvider === 'square' ? result.externalPaymentId : undefined,
            posPaymentId: result.externalPaymentId,
          }
        : {}),
    },
  });

  logger.info('Order pushed to POS', {
    orderId,
    tenantId,
    provider: tenant.posProvider,
    externalOrderId: result.externalOrderId,
  });
}

export async function updateOrderStatus(
  orderId: string,
  tenantId: string,
  status: OrderStatus,
  squareOrderId?: string,
  squarePaymentId?: string
) {
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status,
      ...(squareOrderId && { squareOrderId }),
      ...(squarePaymentId && { squarePaymentId }),
    },
  });
  // If the order moved out of PENDING via the dashboard/Square, auto-resolve
  // any related task so the action-items inbox stays in sync.
  if (status !== OrderStatus.PENDING) {
    await autoCompleteTasksForEntity('ORDER', 'orderId', orderId).catch((err) =>
      logger.warn('Failed to auto-complete order task', { err, orderId })
    );
  }
  return updated;
}

export async function getTenantOrders(
  tenantId: string,
  status?: OrderStatus,
  page = 1,
  pageSize = 20
) {
  const where = { tenantId, ...(status && { status }) };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total };
}

export async function getOrderById(orderId: string, tenantId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, tenantId },
  });
}
