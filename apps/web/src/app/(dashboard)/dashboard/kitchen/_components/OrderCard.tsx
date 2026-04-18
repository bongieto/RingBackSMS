'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, Phone, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { webApi } from '@/lib/api';

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

const STATUS_ACTIONS: Record<string, { label: string; next: string; color: string }> = {
  PENDING: { label: 'Accept', next: 'CONFIRMED', color: 'bg-blue-600 hover:bg-blue-700 text-white' },
  CONFIRMED: { label: 'Start Cooking', next: 'PREPARING', color: 'bg-orange-500 hover:bg-orange-600 text-white' },
  PREPARING: { label: 'Ready \u2713', next: 'READY', color: 'bg-green-600 hover:bg-green-700 text-white' },
  READY: { label: 'Picked Up', next: 'COMPLETED', color: 'bg-slate-700 hover:bg-slate-800 text-white' },
};

function maskPhone(phone: string): string {
  if (phone.length >= 10) {
    return `***-${phone.slice(-4)}`;
  }
  return phone;
}

function formatElapsed(createdAt: string): string {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (diff < 60) return 'just now';
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function getTimeRemaining(estimatedReadyTime: string | null): { text: string; overdue: boolean } | null {
  if (!estimatedReadyTime) return null;
  const diff = new Date(estimatedReadyTime).getTime() - Date.now();
  const mins = Math.round(diff / 60000);
  if (mins > 0) return { text: `~${mins} min left`, overdue: false };
  return { text: `${Math.abs(mins)} min over`, overdue: true };
}

export function OrderCard({ order, tenantId }: { order: Order; tenantId: string }) {
  const queryClient = useQueryClient();
  const [elapsed, setElapsed] = useState(formatElapsed(order.createdAt));
  const [timeRemaining, setTimeRemaining] = useState(getTimeRemaining(order.estimatedReadyTime));

  // Update timers every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(formatElapsed(order.createdAt));
      setTimeRemaining(getTimeRemaining(order.estimatedReadyTime));
    }, 15000);
    return () => clearInterval(interval);
  }, [order.createdAt, order.estimatedReadyTime]);

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) =>
      webApi.patch(`/orders/${order.id}/status`, { status: newStatus, tenantId }).then(r => r.data),
    // Optimistic update: move the card instantly, reconcile after server responds
    onMutate: async (newStatus) => {
      await queryClient.cancelQueries({ queryKey: ['kitchen-orders'] });
      const previous = queryClient.getQueryData<Order[]>(['kitchen-orders', tenantId]);
      queryClient.setQueryData<Order[]>(['kitchen-orders', tenantId], (old) =>
        (old ?? []).map(o =>
          o.id === order.id ? { ...o, status: newStatus } : o
        ).filter(o => o.status !== 'CANCELLED')
      );
      return { previous };
    },
    onError: (_err, _newStatus, context) => {
      // Revert on failure
      if (context?.previous) {
        queryClient.setQueryData(['kitchen-orders', tenantId], context.previous);
      }
      toast.error('Failed to update order');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['kitchen-orders'] });
    },
  });

  const action = STATUS_ACTIONS[order.status];
  const items = Array.isArray(order.items) ? order.items as OrderItem[] : [];
  const total = typeof order.total === 'string' ? parseFloat(order.total) : order.total;
  const isOverdue = timeRemaining?.overdue ?? false;

  return (
    <div className={cn(
      'rounded-xl border-2 bg-white p-4 shadow-sm transition-all',
      isOverdue ? 'border-red-400 shadow-red-100' : 'border-slate-200',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-bold text-sm text-slate-900">#{order.orderNumber}</span>
          {order.customerName && (
            <span className="text-sm font-semibold text-slate-700 truncate">{order.customerName}</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
          <Clock className="h-3 w-3" />
          {elapsed}
        </span>
      </div>

      {/* Items */}
      <div className="space-y-1 mb-3">
        {items.map((item, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span>{item.quantity}x {item.name}</span>
            <span className="text-muted-foreground font-mono">${(item.quantity * item.price).toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mb-3">
          {order.notes}
        </div>
      )}

      {/* Footer info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
        <span className="flex items-center gap-1">
          <Phone className="h-3 w-3" />
          {maskPhone(order.callerPhone)}
        </span>
        <span className="font-semibold text-slate-900 text-sm">${total.toFixed(2)}</span>
      </div>

      {/* Time remaining / Pickup time */}
      {(timeRemaining || order.pickupTime) && (
        <div className={cn(
          'flex items-center gap-1 text-xs font-medium mb-3 px-2 py-1 rounded-lg',
          isOverdue ? 'text-red-700 bg-red-50' : 'text-blue-700 bg-blue-50'
        )}>
          {isOverdue && <AlertTriangle className="h-3 w-3" />}
          {timeRemaining?.text}
          {order.pickupTime && !timeRemaining && <span>Pickup: {order.pickupTime}</span>}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {action && (
          <Button
            className={cn('flex-1 min-h-[48px] text-base font-bold active:scale-95 transition-transform', action.color)}
            onClick={() => statusMutation.mutate(action.next)}
            disabled={statusMutation.isPending}
          >
            {action.label}
          </Button>
        )}
        {order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && (
          <Button
            variant="outline"
            size="icon"
            className="min-h-[48px] min-w-[48px] shrink-0 active:scale-95 transition-transform"
            onClick={() => {
              if (confirm('Cancel this order?')) {
                statusMutation.mutate('CANCELLED');
              }
            }}
            disabled={statusMutation.isPending}
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  );
}
