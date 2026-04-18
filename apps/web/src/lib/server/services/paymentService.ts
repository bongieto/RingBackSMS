import Stripe from 'stripe';
import { logger } from '../logger';

let stripeInstance: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2023-10-16',
    });
  }
  return stripeInstance;
}

export async function createOrderPaymentSession(params: {
  tenantId: string;
  orderId?: string;
  orderNumber?: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  /** Optional breakdown. When provided, tax and fee are added as extra
   *  line items so Stripe's receipt shows them to the customer. */
  subtotal?: number;
  taxAmount?: number;
  feeAmount?: number;
  /** Customer-selected tip (dollars). Added as its own line item and
   *  stamped into metadata so the webhook can persist it to Order.tipAmount. */
  tipAmount?: number;
  callerPhone: string;
  pickupTime?: string | null;
  notes?: string | null;
}): Promise<{ sessionId: string; url: string }> {
  const stripe = getStripe();
  const frontendUrl = process.env.FRONTEND_URL ?? 'https://ringbacksms.com';

  const metadata: Record<string, string> = {
    tenantId: params.tenantId,
    callerPhone: params.callerPhone,
  };
  if (params.orderId) metadata.orderId = params.orderId;
  if (params.orderNumber) metadata.orderNumber = params.orderNumber;
  if (params.pickupTime) metadata.pickupTime = params.pickupTime;
  if (params.notes) metadata.notes = params.notes;
  if (params.subtotal != null) metadata.subtotal = params.subtotal.toFixed(2);
  if (params.taxAmount != null) metadata.taxAmount = params.taxAmount.toFixed(2);
  if (params.feeAmount != null) metadata.feeAmount = params.feeAmount.toFixed(2);
  metadata.total = params.total.toFixed(2);

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = params.items.map((item) => ({
    price_data: {
      currency: 'usd',
      product_data: { name: item.name },
      unit_amount: Math.round(item.price * 100),
    },
    quantity: item.quantity,
  }));

  if (params.taxAmount && params.taxAmount > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Sales tax' },
        unit_amount: Math.round(params.taxAmount * 100),
      },
      quantity: 1,
    });
  }
  if (params.feeAmount && params.feeAmount > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Processing fee' },
        unit_amount: Math.round(params.feeAmount * 100),
      },
      quantity: 1,
    });
  }
  if (params.tipAmount && params.tipAmount > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'Tip' },
        unit_amount: Math.round(params.tipAmount * 100),
      },
      quantity: 1,
    });
    metadata.tipAmount = params.tipAmount.toFixed(2);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    metadata,
    success_url: `${frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendUrl}/payment/cancel`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minutes
  });

  logger.info('Stripe checkout session created', {
    tenantId: params.tenantId,
    orderId: params.orderId,
    sessionId: session.id,
  });

  return { sessionId: session.id, url: session.url! };
}

/**
 * Issue a full refund on a Stripe payment associated with an order. Works
 * against either a payment_intent id or a checkout session id — we detect
 * which was stored on Order.stripePaymentId. Returns the refund id so the
 * caller can persist it. Throws if Stripe rejects (amount already refunded,
 * payment not found, etc.); caller decides how to surface to the operator.
 */
export async function refundOrderPayment(stripePaymentId: string): Promise<string> {
  const stripe = getStripe();

  // stripePaymentId may be either `pi_*` (payment intent) or `cs_*`
  // (checkout session). Resolve to a payment_intent for the refund.
  let paymentIntentId = stripePaymentId;
  if (stripePaymentId.startsWith('cs_')) {
    const session = await stripe.checkout.sessions.retrieve(stripePaymentId);
    const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!pi) throw new Error('Checkout session has no payment_intent to refund');
    paymentIntentId = pi;
  }

  const refund = await stripe.refunds.create({ payment_intent: paymentIntentId });
  logger.info('Stripe refund issued', { paymentIntentId, refundId: refund.id, amount: refund.amount });
  return refund.id;
}
