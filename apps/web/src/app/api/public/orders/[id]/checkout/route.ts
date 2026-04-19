import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { createOrderPaymentSession } from '@/lib/server/services/paymentService';
import { logger } from '@/lib/server/logger';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/server/rateLimit';

const Body = z.object({
  tipAmount: z.number().min(0).max(10000).optional(),
});

/**
 * Public endpoint the /pay/[id] interstitial calls to generate a Stripe
 * Checkout Session with the customer-selected tip baked in. Auth model
 * is the same as /o and /r — the Order.id UUID is the access token.
 *
 * Rate-limited per IP to stop someone who finds the URL pattern from
 * churning Stripe sessions against our account.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return Response.json({ error: 'Invalid order id' }, { status: 400 });
  }
  const ip = getClientIp(req.headers);
  const rl = await checkRateLimit(`pay-checkout:${ip}`, 20, 60);
  if (!rl.allowed) return rateLimitResponse(rl);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json().catch(() => ({})));
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Verify the order belongs to an active tenant. A leaked order UUID
  // for a disabled tenant shouldn't be able to spawn new Stripe
  // checkout sessions against the tenant's billing account.
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      orderNumber: true,
      tenantId: true,
      callerPhone: true,
      paymentStatus: true,
      items: true,
      subtotal: true,
      taxAmount: true,
      feeAmount: true,
      total: true,
      pickupTime: true,
      notes: true,
      tenant: { select: { isActive: true } },
    },
  });
  if (!order || !order.tenant?.isActive) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  if (order.paymentStatus === 'PAID') {
    return Response.json({ error: 'Order already paid' }, { status: 400 });
  }

  const items = Array.isArray(order.items) ? (order.items as unknown as Array<{ name: string; quantity: number; price: number }>) : [];
  const subtotal = order.subtotal != null ? Number(order.subtotal) : items.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = order.taxAmount != null ? Number(order.taxAmount) : 0;
  const fee = order.feeAmount != null ? Number(order.feeAmount) : 0;
  const tip = body.tipAmount ?? 0;
  const total = Math.round((subtotal + tax + fee + tip) * 100) / 100;

  try {
    const { sessionId, url } = await createOrderPaymentSession({
      tenantId: order.tenantId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      items,
      total,
      subtotal,
      taxAmount: tax,
      feeAmount: fee,
      tipAmount: tip,
      callerPhone: order.callerPhone,
      pickupTime: order.pickupTime,
      notes: order.notes,
    });

    // Overwrite stripePaymentId — the customer may tap "back" and pick a
    // different tip; we want the latest session id so the webhook matches.
    await prisma.order.update({
      where: { id: order.id },
      data: {
        stripePaymentId: sessionId,
        stripePaymentUrl: url,
        paymentStatus: 'PENDING',
        tipAmount: tip > 0 ? tip : null,
        total,
      },
    });

    logger.info('Pay-page checkout session created', { orderId: order.id, tip, total });
    return Response.json({ url });
  } catch (err: any) {
    logger.error('Pay-page checkout failed', { orderId: order.id, err: err?.message });
    return Response.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
