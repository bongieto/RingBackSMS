import { prisma } from '../db';

// Orders placed by the bot-tester sentinel caller must NOT inflate the
// queue-ahead count — that count surcharges every real customer's ETA.
// QA caught a test order adding "1 order ahead" to a real customer's
// reply. Keep this in sync with BOT_TESTER_SENTINEL_PHONE in the admin
// routes (hardcoded default here is fine; missing env = still excluded).
const SENTINEL_PHONE = process.env.BOT_TESTER_SENTINEL_PHONE ?? '+19990000001';

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
      callerPhone: { not: SENTINEL_PHONE },
    },
  });
}
