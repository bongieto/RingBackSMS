import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/server/db';
import { PrintButton } from './_components/PrintButton';

export const dynamic = 'force-dynamic';

interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  selectedModifiers?: Array<{ groupName: string; modifierName: string; priceAdjust?: number }>;
}

/**
 * Public digital-receipt page. Same access pattern as /o/[id] — the
 * Order.id UUID is the access token. We show itemized order, totals,
 * pickup time, and business name — no caller phone, no stripe ids.
 *
 * Designed to look good both on-screen (mobile-first) and when the
 * customer hits "Save as PDF" from the browser print dialog.
 */
async function loadOrder(orderId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return null;
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      customerName: true,
      items: true,
      subtotal: true,
      taxAmount: true,
      feeAmount: true,
      tipAmount: true,
      total: true,
      pickupTime: true,
      paymentStatus: true,
      createdAt: true,
      tenant: {
        select: {
          name: true,
          twilioPhoneNumber: true,
          config: { select: { timezone: true, brandLogoUrl: true } },
        },
      },
    },
  });
}

/**
 * Make iMessage's link-preview card show the tenant's name (e.g. "The
 * Lumpia House & Truck") instead of the generic RingBackSMS root
 * metadata that would otherwise leak through. Omit og:image when the
 * tenant hasn't set a brandLogoUrl — better to show a text-only card
 * with their name than the RingBackSMS default logo.
 */
export async function generateMetadata(
  { params }: { params: { id: string } },
): Promise<Metadata> {
  const order = await loadOrder(params.id);
  if (!order) {
    return { title: 'Receipt', robots: { index: false, follow: false } };
  }
  const tenantName = order.tenant.name;
  const title = `Receipt #${order.orderNumber} · ${tenantName}`;
  const description = `Your receipt from ${tenantName}.`;
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

function formatDateTime(d: Date, timezone?: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone ?? undefined,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export default async function ReceiptPage({ params }: { params: { id: string } }) {
  const order = await loadOrder(params.id);
  if (!order) notFound();

  const items = Array.isArray(order.items) ? (order.items as unknown as ReceiptItem[]) : [];
  const subtotal = order.subtotal != null ? Number(order.subtotal) : null;
  const tax = order.taxAmount != null ? Number(order.taxAmount) : null;
  const fee = order.feeAmount != null ? Number(order.feeAmount) : null;
  const tip = order.tipAmount != null ? Number(order.tipAmount) : null;
  const total = Number(order.total);
  const when = formatDateTime(order.createdAt, order.tenant.config?.timezone ?? null);
  const paid = order.paymentStatus === 'PAID';

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <div className="mx-auto max-w-md px-4 py-8 print:py-2">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm print:shadow-none print:border-0 p-6">
          {/* Business header */}
          <div className="text-center border-b pb-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Receipt</div>
            <h1 className="mt-1 text-xl font-bold text-slate-900">{order.tenant.name}</h1>
            {order.tenant.twilioPhoneNumber && (
              <p className="text-xs text-muted-foreground mt-0.5">{order.tenant.twilioPhoneNumber}</p>
            )}
          </div>

          {/* Meta */}
          <div className="pt-4 pb-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order</span>
              <span className="font-mono">#{order.orderNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>{when}</span>
            </div>
            {order.customerName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span>{order.customerName}</span>
              </div>
            )}
            {order.pickupTime && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pickup</span>
                <span>{order.pickupTime}</span>
              </div>
            )}
          </div>

          {/* Items */}
          <div className="border-t pt-3 space-y-2">
            {items.map((item, i) => (
              <div key={i} className="text-sm">
                <div className="flex justify-between">
                  <span>
                    {item.quantity}× {item.name}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    ${(item.quantity * item.price).toFixed(2)}
                  </span>
                </div>
                {item.selectedModifiers?.length ? (
                  <div className="pl-4 text-xs text-muted-foreground">
                    {item.selectedModifiers.map((m, j) => (
                      <span key={j}>
                        {j > 0 ? ', ' : ''}
                        {m.groupName}: {m.modifierName}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t mt-4 pt-3 space-y-1 text-sm">
            {subtotal != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">${subtotal.toFixed(2)}</span>
              </div>
            )}
            {tax != null && tax > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-mono">${tax.toFixed(2)}</span>
              </div>
            )}
            {fee != null && fee > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Processing</span>
                <span className="font-mono">${fee.toFixed(2)}</span>
              </div>
            )}
            {tip != null && tip > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tip</span>
                <span className="font-mono">${tip.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
              <span>Total</span>
              <span className="font-mono">${total.toFixed(2)}</span>
            </div>
            {paid && (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-semibold">
                PAID
              </div>
            )}
          </div>

          <div className="border-t mt-4 pt-4 text-center text-xs text-muted-foreground">
            Thanks for your order!
          </div>
        </div>

        <div className="mt-4 text-center print:hidden">
          <PrintButton />
        </div>
      </div>
    </div>
  );
}
