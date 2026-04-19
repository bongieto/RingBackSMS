import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/server/db';
import { PayClient } from './_components/PayClient';

export const dynamic = 'force-dynamic';

/**
 * Tip-jar interstitial. Sits between the "Pay securely here:" SMS and
 * Stripe Checkout. Customer picks a tip preset, we regenerate a Stripe
 * Checkout Session with the tip baked in as a line item, then redirect.
 *
 * Skips itself (and goes straight to Stripe) if the order has already
 * been paid — so refreshing the link after pay doesn't re-offer tipping.
 */
async function loadOrder(orderId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      paymentStatus: true,
      items: true,
      subtotal: true,
      taxAmount: true,
      feeAmount: true,
      total: true,
      pickupTime: true,
      tenant: {
        select: {
          name: true,
          config: { select: { brandLogoUrl: true } },
        },
      },
    },
  });
}

/**
 * Overriding root OG metadata so the "Pay securely here:" iMessage card
 * shows the tenant's name, not the RingBackSMS default. Logo only
 * emitted when the tenant has set brandLogoUrl — otherwise text-only is
 * better than leaking the RingBackSMS logo into their customer's chat.
 */
export async function generateMetadata(
  { params }: { params: { id: string } },
): Promise<Metadata> {
  const order = await loadOrder(params.id);
  if (!order) {
    return { title: 'Complete payment', robots: { index: false, follow: false } };
  }
  const tenantName = order.tenant.name;
  const title = `Complete payment · ${tenantName}`;
  const description = `Secure payment for your order from ${tenantName}.`;
  const logoUrl = order.tenant.config?.brandLogoUrl ?? null;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: tenantName,
      type: 'website',
      ...(logoUrl ? { images: [{ url: logoUrl }] } : {}),
    },
    twitter: { card: 'summary', title, description },
    robots: { index: false, follow: false },
  };
}

export default async function PayPage({ params }: { params: { id: string } }) {
  const order = await loadOrder(params.id);
  if (!order) notFound();

  // Already paid → show receipt. No point offering tipping again.
  if (order.paymentStatus === 'PAID') {
    redirect(`/r/${order.id}`);
  }

  const items = Array.isArray(order.items) ? (order.items as unknown as Array<{ name: string; quantity: number; price: number }>) : [];
  const subtotal = order.subtotal != null ? Number(order.subtotal) : items.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = order.taxAmount != null ? Number(order.taxAmount) : 0;
  const fee = order.feeAmount != null ? Number(order.feeAmount) : 0;

  return (
    <PayClient
      order={{
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        businessName: order.tenant.name,
        items,
        subtotal,
        tax,
        fee,
        pickupTime: order.pickupTime,
      }}
    />
  );
}
