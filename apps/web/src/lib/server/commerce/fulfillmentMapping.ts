import { OrderStatus } from '@prisma/client';

const RINGBACK_TO_MCINASAL_STATUS: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'accepted',
  PREPARING: 'preparing',
  READY: 'ready',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export function toMcInasalFulfillmentStatus(status: OrderStatus): string | null {
  return RINGBACK_TO_MCINASAL_STATUS[status] ?? null;
}

export function toRingBackOrderStatus(status: string): OrderStatus {
  return (
    (
      {
        pending_payment: OrderStatus.PENDING,
        new: OrderStatus.CONFIRMED,
        accepted: OrderStatus.CONFIRMED,
        preparing: OrderStatus.PREPARING,
        ready: OrderStatus.READY,
        completed: OrderStatus.COMPLETED,
        cancelled: OrderStatus.CANCELLED,
      } as Record<string, OrderStatus>
    )[status] ?? OrderStatus.PENDING
  );
}
