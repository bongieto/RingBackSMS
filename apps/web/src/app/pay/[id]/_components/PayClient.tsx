'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

interface OrderLine {
  name: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  orderNumber: string;
  customerName: string | null;
  businessName: string;
  items: OrderLine[];
  subtotal: number;
  tax: number;
  fee: number;
  pickupTime: string | null;
}

// Tipping UX convention: percentage presets on the pre-tax subtotal.
// Applying tip to (subtotal + tax) feels wrong to US customers because
// they're used to restaurant receipts that tip on subtotal only.
const TIP_PRESETS = [
  { label: '15%', pct: 0.15 },
  { label: '18%', pct: 0.18 },
  { label: '20%', pct: 0.2 },
  { label: '25%', pct: 0.25 },
] as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function PayClient({ order }: { order: Order }) {
  const [selected, setSelected] = useState<'none' | number | 'custom'>(1); // default to 18%
  const [customDollars, setCustomDollars] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function computeTip(): number {
    if (selected === 'none') return 0;
    if (selected === 'custom') {
      const v = parseFloat(customDollars);
      return Number.isFinite(v) && v > 0 ? round2(v) : 0;
    }
    return round2(order.subtotal * TIP_PRESETS[selected].pct);
  }

  const tip = computeTip();
  const finalTotal = round2(order.subtotal + order.tax + order.fee + tip);

  async function onContinue() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/orders/${order.id}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipAmount: tip }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to start checkout');
      }
      const data = await res.json();
      if (!data.url) throw new Error('Checkout URL missing');
      window.location.href = data.url;
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="text-center mb-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {order.businessName}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Review & tip</h1>
          <p className="mt-1 text-sm text-muted-foreground">Order #{order.orderNumber}</p>
        </div>

        {/* Order summary */}
        <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
          <div className="space-y-2">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{item.quantity}× {item.name}</span>
                <span className="font-mono text-muted-foreground">${(item.quantity * item.price).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t mt-3 pt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">${order.subtotal.toFixed(2)}</span></div>
            {order.tax > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="font-mono">${order.tax.toFixed(2)}</span></div>}
            {order.fee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Processing</span><span className="font-mono">${order.fee.toFixed(2)}</span></div>}
          </div>
        </div>

        {/* Tip selector */}
        <div className="mt-4 rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900 mb-3">Add a tip?</div>
          <div className="grid grid-cols-4 gap-2">
            {TIP_PRESETS.map((p, idx) => {
              const active = selected === idx;
              const amount = round2(order.subtotal * p.pct);
              return (
                <button
                  key={p.label}
                  onClick={() => setSelected(idx)}
                  className={`rounded-xl border py-3 text-center transition ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
                >
                  <div className="font-bold">{p.label}</div>
                  <div className={`text-[11px] ${active ? 'text-slate-300' : 'text-slate-500'}`}>${amount.toFixed(2)}</div>
                </button>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => setSelected('none')}
              className={`rounded-xl border py-3 text-center text-sm font-medium transition ${selected === 'none' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
            >
              No tip
            </button>
            <button
              onClick={() => setSelected('custom')}
              className={`rounded-xl border py-3 text-center text-sm font-medium transition ${selected === 'custom' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
            >
              Custom
            </button>
          </div>
          {selected === 'custom' && (
            <div className="mt-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <input
                  type="number"
                  step="0.50"
                  min="0"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={customDollars}
                  onChange={(e) => setCustomDollars(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 pl-7 pr-3 py-3 text-base"
                />
              </div>
            </div>
          )}
        </div>

        {/* Final total + continue */}
        <div className="mt-4 rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Total to pay</span>
            <span className="text-2xl font-bold text-slate-900 font-mono">${finalTotal.toFixed(2)}</span>
          </div>
          {tip > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5 text-right">
              includes ${tip.toFixed(2)} tip
            </div>
          )}
          {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
          <button
            onClick={onContinue}
            disabled={submitting}
            className="mt-4 w-full rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 py-3 text-white font-semibold flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue to payment
          </button>
          <p className="mt-2 text-[11px] text-center text-muted-foreground">
            You&apos;ll be redirected to our secure Stripe checkout.
          </p>
        </div>
      </div>
    </div>
  );
}
