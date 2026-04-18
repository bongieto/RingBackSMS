import { prisma } from '../db';

/**
 * Count the orders currently "in flight" for a tenant — i.e. those that
 * are taking up kitchen capacity right now. We include CONFIRMED and
 * PREPARING, and exclude READY/COMPLETED/CANCELLED (no longer consuming
 * prep time).
 *
 * Used to surcharge the pickup ETA for a new order: each order ahead
 * adds `minutesPerQueuedOrder` to the estimate.
 */
export async function getActiveOrderCount(tenantId: string): Promise<number> {
  return prisma.order.count({
    where: {
      tenantId,
      status: { in: ['CONFIRMED', 'PREPARING'] },
    },
  });
}
