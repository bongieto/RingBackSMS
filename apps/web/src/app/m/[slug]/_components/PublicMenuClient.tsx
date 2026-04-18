'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Phone, Plus, Minus } from 'lucide-react';

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  imageUrl: string | null;
  duration: number | null;
}

interface Props {
  tenantName: string;
  phoneNumber: string | null;
  items: MenuItem[];
}

/**
 * Interactive public menu. Customers tap +/- to build a cart client-side,
 * then tap "Text order" — which opens their SMS app with a prefilled body
 * like "Order: 2 Kanto Fries, 1 Lumpia Regular". The tenant's AI agent
 * receives that text and parses it with its normal order flow.
 *
 * No server state is tracked here — this is a pure hand-off from the web
 * to SMS. If the customer closes the tab before sending, nothing sticks.
 */
export function PublicMenuClient({ tenantName, phoneNumber, items }: Props) {
  const [qty, setQty] = useState<Record<string, number>>({});

  const inc = (id: string) =>
    setQty((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  const dec = (id: string) =>
    setQty((prev) => {
      const current = prev[id] ?? 0;
      if (current <= 1) {
        const { [id]: _removed, ...rest } = prev;
        void _removed;
        return rest;
      }
      return { ...prev, [id]: current - 1 };
    });

  const cartItems = useMemo(
    () =>
      items
        .map((i) => ({ item: i, quantity: qty[i.id] ?? 0 }))
        .filter((r) => r.quantity > 0),
    [items, qty],
  );
  const totalQty = cartItems.reduce((s, r) => s + r.quantity, 0);
  const totalPrice = cartItems.reduce(
    (s, r) => s + r.item.price * r.quantity,
    0,
  );

  // Compose the SMS body. Keep it friendly + natural — the AI agent parses
  // "Order: 2 Kanto Fries, 1 Lumpia Regular" just fine with existing tooling.
  // Falls back to "ORDER" when the cart is empty so the button still works.
  const smsBody = useMemo(() => {
    if (cartItems.length === 0) return 'ORDER';
    const parts = cartItems.map((r) => `${r.quantity} ${r.item.name}`);
    let body = `Order: ${parts.join(', ')}`;
    // iOS tolerates long sms: bodies but trims silently past a few hundred
    // chars. Cap at 400 to stay comfortable.
    if (body.length > 400) body = body.slice(0, 397) + '…';
    return body;
  }, [cartItems]);

  const smsHref = phoneNumber
    ? `sms:${phoneNumber}?&body=${encodeURIComponent(smsBody)}`
    : null;

  const categories = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const item of items) {
      const cat = item.category || 'Menu';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return Array.from(map.entries()).map(([category, items]) => ({
      category,
      items,
    }));
  }, [items]);

  const hasMenu = items.length > 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-30 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 truncate">{tenantName}</h1>
            <p className="text-xs text-muted-foreground">Text to order</p>
          </div>
          {phoneNumber && (
            <a
              href={`tel:${phoneNumber}`}
              className="shrink-0 inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              <Phone className="h-4 w-4" />
              Call
            </a>
          )}
        </div>
      </header>

      {/* Menu */}
      <main className="max-w-2xl mx-auto px-4 py-6 pb-36">
        {!hasMenu ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">Our menu is being updated.</p>
            <p className="text-sm mt-2">Text us to place an order.</p>
          </div>
        ) : (
          categories.map((group) => (
            <section key={group.category} className="mb-8">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3 px-1">
                {group.category}
              </h2>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {group.items.map((item) => {
                  const count = qty[item.id] ?? 0;
                  return (
                    <div key={item.id} className="p-4 flex gap-3">
                      {item.imageUrl && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="h-16 w-16 rounded-lg object-cover shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-slate-900">{item.name}</h3>
                          <span className="font-mono font-semibold text-slate-900 shrink-0">
                            ${item.price.toFixed(2)}
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {item.description}
                          </p>
                        )}
                        {item.duration != null && (
                          <p className="text-xs text-slate-500 mt-1">{item.duration} min</p>
                        )}
                      </div>
                      {/* Quantity control */}
                      <div className="shrink-0 self-center">
                        {count === 0 ? (
                          <button
                            type="button"
                            onClick={() => inc(item.id)}
                            className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 active:scale-95 transition-transform"
                            aria-label={`Add ${item.name}`}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-full p-0.5">
                            <button
                              type="button"
                              onClick={() => dec(item.id)}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-blue-100 active:scale-95 transition-transform text-blue-700"
                              aria-label={`Remove one ${item.name}`}
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="min-w-[1.5rem] text-center text-sm font-semibold text-blue-700">
                              {count}
                            </span>
                            <button
                              type="button"
                              onClick={() => inc(item.id)}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-blue-100 active:scale-95 transition-transform text-blue-700"
                              aria-label={`Add another ${item.name}`}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </main>

      {/* Sticky CTA */}
      {smsHref && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-white border-t shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
          {totalQty > 0 && (
            <div className="max-w-2xl mx-auto px-4 pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">
                  {totalQty} item{totalQty === 1 ? '' : 's'} selected
                </span>
                <span className="font-mono font-semibold">${totalPrice.toFixed(2)}</span>
              </div>
            </div>
          )}
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <a
              href={smsHref}
              className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 active:scale-95 transition-transform shadow-lg shadow-blue-600/25"
            >
              <MessageSquare className="h-5 w-5" />
              {totalQty > 0 ? `Text order (${totalQty})` : 'Text to order'}
            </a>
          </div>
          <p className="text-center text-[10px] text-slate-400 pb-2 px-4">
            Powered by <Link href="/" className="hover:underline">RingBackSMS</Link>
          </p>
        </div>
      )}
    </div>
  );
}
