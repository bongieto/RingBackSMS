import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/server/db';
import { OrderTrackerClient } from './_components/OrderTrackerClient';

export const dynamic = 'force-dynamic';

/**
 * Public order-status tracker. Reachable by knowing the Order.id UUID —
 * we include the link in the payment-received / confirmation SMS. No
 * auth because the customer doesn't have an account; the unguessable
 * UUID is the access token.
 *
 * We intentionally return a narrow slice of the Order (status, items,
 * pickup time, business name) — never the caller phone, stripe ids, or
 * full caller history.
 */
async function loadOrder(orderId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      customerName: true,
      items: true,
      pickupTime: true,
      estimatedReadyTime: true,
      total: true,
      createdAt: true,
      tenant: {
        select: {
          name: true,
          slug: true,
          config: { select: { brandLogoUrl: true } },
        },
      },
    },
  });
  if (!order) return null;
  return order;
}

/**
 * iMessage/SMS link-preview cards pull og:site_name + og:title to render
 * the label on the preview. We explicitly override with the tenant's
 * name so the customer sees "The Lumpia House & Truck" instead of the
 * RingBackSMS root metadata leaking through. Intentionally omit
 * og:image when the tenant has no brandLogoUrl — the RingBackSMS
 * /logo.png default would defeat the purpose.
 */
export async function generateMetadata(
  { params }: { params: { id: string } },
): Promise<Metadata> {
  const order = await loadOrder(params.id);
  if (!order) {
    return { title: 'Order status', robots: { index: false, follow: false } };
  }
  const tenantName = order.tenant.name;
  const title = `Order #${order.orderNumber} · ${tenantName}`;
  const description = `Track your order from ${tenantName}.`;
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

export default async function OrderTrackerPage({ params }: { params: { id: string } }) {
  const order = await loadOrder(params.id);
  if (!order) notFound();

  // Serialize Prisma Decimal / Date before handing to the client component.
  return (
    <OrderTrackerClient
      order={{
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        customerName: order.customerName,
        items: Array.isArray(order.items) ? order.items as Array<{ name: string; quantity: number; price: number }> : [],
        pickupTime: order.pickupTime,
        estimatedReadyTime: order.estimatedReadyTime ? order.estimatedReadyTime.toISOString() : null,
        total: Number(order.total),
        businessName: order.tenant.name,
        businessSlug: order.tenant.slug,
      }}
    />
  );
}
