/** How an order's payment state is shown to the owner on the Orders page. */
export interface OrderPaymentBadge {
  label: string;
  /** One-line explanation, shown in the expanded card and as a tooltip. */
  detail: string;
  tone: 'paid' | 'unpaid' | 'expired' | 'refunded';
}

/**
 * Map Order.paymentStatus to an owner-facing badge.
 *
 * Order.status says where the order is in the kitchen pipeline, and the bot
 * sets it to CONFIRMED as soon as the order is taken, before any payment.
 * Without this badge an unpaid order looks the same as a paid one.
 *
 * Returns null when there is nothing to say: no status recorded, or a value
 * this build does not know.
 */
export function getOrderPaymentBadge(
  paymentStatus: string | null | undefined,
): OrderPaymentBadge | null {
  switch (paymentStatus) {
    case 'PAID':
      return { label: 'Paid', detail: 'Paid online.', tone: 'paid' };
    case 'PENDING':
      return {
        label: 'Unpaid',
        detail: 'Payment link sent. The customer has not paid yet.',
        tone: 'unpaid',
      };
    case 'UNPAID':
      return { label: 'Unpaid', detail: 'No online payment was taken.', tone: 'unpaid' };
    case 'EXPIRED':
      return {
        label: 'Unpaid · link expired',
        detail: 'The payment link expired before the customer paid.',
        tone: 'expired',
      };
    case 'REFUNDED':
      return { label: 'Refunded', detail: 'The payment was refunded.', tone: 'refunded' };
    default:
      return null;
  }
}
