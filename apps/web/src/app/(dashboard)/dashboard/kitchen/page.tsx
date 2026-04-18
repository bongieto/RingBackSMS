'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChefHat } from 'lucide-react';
import { useTenantId } from '@/components/providers/TenantProvider';
import { Header } from '@/components/layout/Header';
import { webApi } from '@/lib/api';
import { OrderCard } from './_components/OrderCard';
import { KitchenHeader } from './_components/KitchenHeader';
import { EightySixDrawer } from './_components/EightySixDrawer';

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  notes?: string;
}

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  callerPhone: string;
  customerName?: string | null;
  items: OrderItem[];
  total: number | string;
  pickupTime: string | null;
  estimatedReadyTime: string | null;
  notes: string | null;
  createdAt: string;
}

const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'];

export default function KitchenPage() {
  const { tenantId } = useTenantId();
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('kds-sound') !== 'off';
  });
  const [eightySixOpen, setEightySixOpen] = useState(false);
  const prevOrderIdsRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio('/sounds/new-order.wav');
    audioRef.current.volume = 0.7;
  }, []);

  // Persist sound preference
  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem('kds-sound', next ? 'on' : 'off');
      return next;
    });
  }, []);

  // Fetch all active orders (10s polling)
  const { data, isLoading } = useQuery({
    queryKey: ['kitchen-orders', tenantId],
    queryFn: async () => {
      const results = await Promise.all(
        ACTIVE_STATUSES.map(status =>
          webApi.get('/orders', { params: { tenantId, status, pageSize: 50 } })
            .then(r => (r.data.data ?? []) as Order[])
            .catch(() => [] as Order[])
        )
      );
      return results.flat();
    },
    enabled: !!tenantId,
    refetchInterval: 10000,
  });

  const orders = data ?? [];

  // Request Notification permission once on mount. Some browsers only
  // honor requests from a user gesture — this attempt is harmless if it
  // returns 'default' silently.
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      window.Notification.permission === 'default'
    ) {
      // Fire-and-forget; ignored if the browser rejects.
      window.Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Detect new orders and play chime + push a browser notification when
  // the tab is backgrounded. Vibration on mobile. Audio + vibration
  // require the sound toggle; notifications bypass it (they're the
  // silent fallback for operators who muted the tab).
  useEffect(() => {
    if (!orders.length) return;
    const currentIds = new Set(orders.map(o => o.id));
    const prevIds = prevOrderIdsRef.current;

    if (prevIds.size > 0) {
      const newOrders = orders.filter(o => !prevIds.has(o.id) && (o.status === 'PENDING' || o.status === 'CONFIRMED'));
      if (newOrders.length > 0) {
        if (soundEnabled) {
          audioRef.current?.play().catch(() => {});
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
        // Browser notification — most useful when the KDS is in a
        // background tab and staff needs to see that something changed.
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          window.Notification.permission === 'granted' &&
          document.visibilityState === 'hidden'
        ) {
          const first = newOrders[0];
          const title = newOrders.length === 1
            ? `New order #${first.orderNumber ?? ''}`
            : `${newOrders.length} new orders`;
          const body = newOrders.length === 1
            ? `${first.callerPhone ?? ''} — tap to open`
            : 'Open the KDS to see them';
          try {
            const notif = new window.Notification(title, { body, tag: 'kds-new-order' });
            notif.onclick = () => {
              window.focus();
              notif.close();
            };
          } catch {
            // Silently ignore — some browsers throw if the tab isn't
            // allowed to create notifications.
          }
        }
      }
    }
    prevOrderIdsRef.current = currentIds;
  }, [orders, soundEnabled]);

  // Group orders into columns
  const newOrders = orders.filter(o => o.status === 'PENDING' || o.status === 'CONFIRMED');
  const cookingOrders = orders.filter(o => o.status === 'PREPARING');
  const readyOrders = orders.filter(o => o.status === 'READY');
  const doneOrders = orders.filter(o => o.status === 'COMPLETED');

  // Stats
  const overdueCount = orders.filter(o =>
    o.estimatedReadyTime && new Date(o.estimatedReadyTime).getTime() < Date.now() && o.status === 'PREPARING'
  ).length;

  const stats = {
    totalToday: orders.length,
    cooking: cookingOrders.length,
    overdue: overdueCount,
    avgPrepMins: null as number | null,
  };

  if (!tenantId) return null;

  return (
    <>
      <Header
        title="Kitchen"
        description="Manage incoming orders in real-time"
      />

      <KitchenHeader
        stats={stats}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        on86Click={() => setEightySixOpen(true)}
      />

      {tenantId && (
        <EightySixDrawer
          tenantId={tenantId}
          open={eightySixOpen}
          onClose={() => setEightySixOpen(false)}
        />
      )}

      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20">
          <ChefHat className="h-16 w-16 mx-auto text-muted-foreground opacity-20 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">No active orders</p>
          <p className="text-sm text-muted-foreground mt-1">
            New orders from SMS will appear here automatically
          </p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-4 lg:overflow-visible">
          {/* New Orders */}
          <div className="min-w-[85vw] sm:min-w-[60vw] lg:min-w-0 snap-center">
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="h-3 w-3 rounded-full bg-blue-500" />
              <h2 className="font-bold text-sm uppercase tracking-wide text-slate-700">
                New <span className="text-blue-600">({newOrders.length})</span>
              </h2>
            </div>
            <div className="space-y-3">
              {newOrders.map(order => (
                <OrderCard key={order.id} order={order} tenantId={tenantId} />
              ))}
              {newOrders.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-xl">
                  No new orders
                </div>
              )}
            </div>
          </div>

          {/* Cooking */}
          <div className="min-w-[85vw] sm:min-w-[60vw] lg:min-w-0 snap-center">
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="h-3 w-3 rounded-full bg-orange-500" />
              <h2 className="font-bold text-sm uppercase tracking-wide text-slate-700">
                Cooking <span className="text-orange-600">({cookingOrders.length})</span>
              </h2>
            </div>
            <div className="space-y-3">
              {cookingOrders.map(order => (
                <OrderCard key={order.id} order={order} tenantId={tenantId} />
              ))}
              {cookingOrders.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-xl">
                  Nothing cooking
                </div>
              )}
            </div>
          </div>

          {/* Ready */}
          <div className="min-w-[85vw] sm:min-w-[60vw] lg:min-w-0 snap-center">
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <h2 className="font-bold text-sm uppercase tracking-wide text-slate-700">
                Ready <span className="text-green-600">({readyOrders.length})</span>
              </h2>
            </div>
            <div className="space-y-3">
              {readyOrders.map(order => (
                <OrderCard key={order.id} order={order} tenantId={tenantId} />
              ))}
              {readyOrders.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-xl">
                  No orders ready
                </div>
              )}
            </div>
          </div>

          {/* Done */}
          <div className="min-w-[85vw] sm:min-w-[60vw] lg:min-w-0 snap-center">
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="h-3 w-3 rounded-full bg-slate-400" />
              <h2 className="font-bold text-sm uppercase tracking-wide text-slate-700">
                Done <span className="text-slate-500">({doneOrders.length})</span>
              </h2>
            </div>
            <div className="space-y-3">
              {doneOrders.map(order => (
                <OrderCard key={order.id} order={order} tenantId={tenantId} />
              ))}
              {doneOrders.length === 0 && (
                <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-xl">
                  No completed orders
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
