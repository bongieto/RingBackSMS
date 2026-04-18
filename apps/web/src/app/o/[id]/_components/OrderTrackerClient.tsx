'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Loader2, Package, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string | null;
  items: OrderItem[];
  pickupTime: string | null;
  estimatedReadyTime: string | null;
  total: number;
  businessName: string;
  businessSlug: string | null;
}

const STEPS = [
  { key: 'CONFIRMED', label: 'Confirmed', icon: CheckCircle2 },
  { key: 'PREPARING', label: 'Preparing', icon: Loader2 },
  { key: 'READY', label: 'Ready for pickup', icon: Package },
  { key: 'COMPLETED', label: 'Picked up', icon: CheckCircle2 },
] as const;

// Rank each status so we know how many pills to light up. PENDING renders
// as "awaiting confirmation" — no step is active yet.
const STATUS_RANK: Record<string, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  PREPARING: 2,
  READY: 3,
  COMPLETED: 4,
  CANCELLED: -1,
};

function formatEta(iso: string | null): string | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  const mins = Math.round(diff / 60000);
  if (mins <= 0) return 'any minute now';
  if (mins === 1) return 'about 1 min';
  return `about ${mins} min`;
}

export function OrderTrackerClient({ order: initial }: { order: Order }) {
  const [order, setOrder] = useState(initial);
  const [etaText, setEtaText] = useState(() => formatEta(initial.estimatedReadyTime));

  // Poll /api/public/orders/[id] every 10s. Terminal statuses stop the
  // polling so we don't hammer the API forever — customer can refresh
  // the page if they come back later.
  useEffect(() => {
    const terminal = order.status === 'COMPLETED' || order.status === 'CANCELLED';
    if (terminal) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/public/orders/${order.id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setOrder((o) => ({
          ...o,
          status: data.status,
          estimatedReadyTime: data.estimatedReadyTime,
          pickupTime: data.pickupTime,
        }));
      } catch {
        // Silent retry; offline customers will see stale state, which is fine.
      }
    };
    const poll = setInterval(tick, 10000);
    const clockTick = setInterval(() => {
      setEtaText(formatEta(order.estimatedReadyTime));
    }, 30000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(clockTick);
    };
  }, [order.id, order.status, order.estimatedReadyTime]);

  useEffect(() => {
    setEtaText(formatEta(order.estimatedReadyTime));
  }, [order.estimatedReadyTime]);

  const rank = STATUS_RANK[order.status] ?? 0;
  const cancelled = order.status === 'CANCELLED';

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-md px-4 py-8">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {order.businessName}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Order #{order.orderNumber}
          </h1>
          {order.customerName && (
            <p className="mt-1 text-sm text-slate-600">For {order.customerName}</p>
          )}
        </div>

        {/* Status card */}
        <div className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
          {cancelled ? (
            <div className="flex flex-col items-center text-center py-4">
              <Ban className="h-12 w-12 text-red-500" />
              <p className="mt-3 font-semibold text-slate-900">This order was cancelled.</p>
              <p className="text-sm text-muted-foreground">Please call or text us if you have questions.</p>
            </div>
          ) : (
            <>
              {/* Big status text */}
              <div className="text-center mb-6">
                {order.status === 'READY' ? (
                  <>
                    <div className="text-3xl font-bold text-green-600">Ready for pickup!</div>
                    <p className="text-sm text-muted-foreground mt-1">Come on by.</p>
                  </>
                ) : order.status === 'PREPARING' ? (
                  <>
                    <div className="text-2xl font-bold text-orange-600">We&apos;re on it.</div>
                    {etaText && (
                      <p className="text-sm text-muted-foreground mt-1">Ready in {etaText}.</p>
                    )}
                  </>
                ) : order.status === 'CONFIRMED' ? (
                  <>
                    <div className="text-2xl font-bold text-blue-600">Order confirmed</div>
                    <p className="text-sm text-muted-foreground mt-1">We&apos;ll start preparing it shortly.</p>
                  </>
                ) : order.status === 'COMPLETED' ? (
                  <>
                    <div className="text-2xl font-bold text-slate-700">Order complete</div>
                    <p className="text-sm text-muted-foreground mt-1">Thanks for stopping by!</p>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-slate-700">Received</div>
                    <p className="text-sm text-muted-foreground mt-1">Awaiting confirmation…</p>
                  </>
                )}
              </div>

              {/* Progress pills */}
              <div className="flex items-center justify-between gap-1">
                {STEPS.map((step, i) => {
                  const done = rank > i;
                  const active = rank === i + 1;
                  const Icon = step.icon;
                  return (
                    <div key={step.key} className="flex flex-col items-center flex-1 min-w-0">
                      <div
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-full transition-colors',
                          done && 'bg-green-500 text-white',
                          active && 'bg-orange-500 text-white',
                          !done && !active && 'bg-slate-100 text-slate-400',
                        )}
                      >
                        <Icon className={cn('h-5 w-5', active && step.key === 'PREPARING' && 'animate-spin')} />
                      </div>
                      <div className={cn('mt-2 text-xs text-center leading-tight', (done || active) ? 'text-slate-900 font-medium' : 'text-slate-400')}>
                        {step.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Order summary */}
        <div className="mt-4 rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            Your order
          </div>
          <div className="space-y-2">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-slate-700">{item.quantity}× {item.name}</span>
                <span className="text-slate-500 font-mono text-xs">${(item.quantity * item.price).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between border-t pt-3 text-sm font-semibold">
            <span>Total</span>
            <span>${order.total.toFixed(2)}</span>
          </div>
          {order.pickupTime && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <Clock className="h-4 w-4" />
              Pickup: {order.pickupTime}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Page auto-updates every 10 seconds.
        </p>
      </div>
    </div>
  );
}
