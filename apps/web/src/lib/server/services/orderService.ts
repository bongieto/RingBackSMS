import { OrderStatus } from '@prisma/client';
import { logger } from '../logger';
import { prisma } from '../db';
import { autoCompleteTasksForEntity } from './taskService';

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
  now: Date = new Date(),
): { totalMinutes: number; breakdown: { base: number; overrideExtra: number; largeOrderExtra: number } } | null {
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
  return {
    totalMinutes: base + overrideExtra + largeOrderExtra,
    breakdown: { base, overrideExtra, largeOrderExtra },
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
  pickupTime: string | null;
  notes: string | null;
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
    },
  });
  const itemCount = input.items.reduce((s, i) => s + (i.quantity ?? 1), 0);
  const prep = cfg
    ? calculatePrepTime(
        {
          defaultPrepTimeMinutes: cfg.defaultPrepTimeMinutes,
          largeOrderThresholdItems: cfg.largeOrderThresholdItems,
          largeOrderExtraMinutes: cfg.largeOrderExtraMinutes,
          prepTimeOverrides: cfg.prepTimeOverrides,
          timezone: cfg.timezone,
        },
        itemCount,
      )
    : null;
  const estimatedReadyTime = prep
    ? new Date(Date.now() + prep.totalMinutes * 60_000)
    : null;

  const order = await prisma.order.create({
    data: {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      callerPhone: input.callerPhone,
      orderNumber: generateOrderNumber(),
      status: OrderStatus.CONFIRMED,
      items: input.items,
      total: input.total,
      pickupTime: input.pickupTime,
      estimatedReadyTime,
      notes: input.notes,
      ...(input.stripePaymentId && { stripePaymentId: input.stripePaymentId }),
      ...(input.stripePaymentUrl && { stripePaymentUrl: input.stripePaymentUrl }),
      ...(input.paymentStatus && { paymentStatus: input.paymentStatus }),
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
  try {
    const totalCents = Math.round(Number(order.total) * 100);
    await prisma.contact.updateMany({
      where: { tenantId: input.tenantId, phone: input.callerPhone },
      data: {
        lastOrderId: order.id,
        lastOrderAt: order.createdAt,
        totalOrders: { increment: 1 },
        totalSpent: { increment: totalCents },
        lastContactAt: new Date(),
      },
    });
  } catch (err) {
    logger.warn('Failed to denormalize order onto Contact', { err, orderId: order.id });
  }

  return order;
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
