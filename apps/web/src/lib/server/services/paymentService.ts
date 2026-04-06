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

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: params.items.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: { name: item.name },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    })),
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
