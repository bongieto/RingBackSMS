'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { ShoppingBag, Clock, ChevronDown, ChevronUp, X } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { orderApi } from '@/lib/api';
import { formatDate, formatRelativeTime, maskPhone, formatCurrency } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface OrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
}

interface Order {
  id: string;
  orderNumber: string;
  callerPhone: string;
  status: string;
  items: OrderItem[];
  total: number;
  pickupTime: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_TABS = ['ALL', 'PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'] as const;

const STATUS_BADGE_CLASSES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 border-transparent',
  CONFIRMED: 'bg-blue-100 text-blue-800 border-transparent',
  PREPARING: 'bg-orange-100 text-orange-800 border-transparent',
  READY: 'bg-green-100 text-green-800 border-transparent',
  COMPLETED: 'bg-gray-100 text-gray-600 border-transparent',
  CANCELLED: 'bg-red-100 text-red-800 border-transparent',
};

interface StatusAction {
  label: string;
  target: string;
  variant: 'default' | 'outline' | 'destructive' | 'secondary';
}

const STATUS_ACTIONS: Record<string, StatusAction[]> = {
  PENDING: [
    { label: 'Confirm', target: 'CONFIRMED', variant: 'default' },
    { label: 'Cancel', target: 'CANCELLED', variant: 'destructive' },
  ],
  CONFIRMED: [
    { label: 'Start Preparing', target: 'PREPARING', variant: 'default' },
    { label: 'Cancel', target: 'CANCELLED', variant: 'destructive' },
  ],
  PREPARING: [
    { label: 'Mark Ready', target: 'READY', variant: 'default' },
    { label: 'Cancel', target: 'CANCELLED', variant: 'destructive' },
  ],
  READY: [
    { label: 'Complete', target: 'COMPLETED', variant: 'default' },
    { label: 'Cancel', target: 'CANCELLED', variant: 'destructive' },
  ],
};

// ── Component ────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const queryParams: Record<string, unknown> = { page, pageSize: 20 };
  if (statusFilter !== 'ALL') {
    queryParams.status = statusFilter;
  }

  const { data, isLoading } = useQuery({
    queryKey: ['orders', tenantId, statusFilter, page],
    queryFn: () => orderApi.list(tenantId!, queryParams),
    enabled: !!tenantId,
    refetchInterval: 30000,
  });

  const orders: Order[] = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;
  const totalPages = data?.pagination?.totalPages ?? 1;

  const statusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      orderApi.updateStatus(orderId, status, tenantId!),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders', tenantId] });
      toast.success(`Order updated to ${variables.status.toLowerCase()}`);
    },
    onError: () => toast.error('Failed to update order status'),
  });

  function itemsSummary(items: OrderItem[]): string {
    if (!Array.isArray(items) || items.length === 0) return 'No items';
    const names = items.slice(0, 3).map((i) => `${i.quantity}x ${i.name}`);
    const suffix = items.length > 3 ? ` +${items.length - 3} more` : '';
    return names.join(', ') + suffix;
  }

  return (
    <div>
      <Header
        title="Orders"
        description={`${total} total order${total !== 1 ? 's' : ''}`}
      />

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-6 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab}
            variant={statusFilter === tab ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setStatusFilter(tab);
              setPage(1);
            }}
          >
            {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
          </Button>
        ))}
      </div>

      {/* Orders list */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading orders...</div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center">
              <ShoppingBag className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground font-medium">No orders found</p>
              <p className="text-sm text-muted-foreground mt-1">
                When customers order via SMS, their orders show up here in real-time
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {orders.map((order) => {
                const isExpanded = expandedId === order.id;
                const actions = STATUS_ACTIONS[order.status] ?? [];
                const items: OrderItem[] = Array.isArray(order.items) ? order.items : [];

                return (
                  <div key={order.id}>
                    {/* Order row */}
                    <button
                      type="button"
                      className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : order.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">{order.orderNumber}</span>
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASSES[order.status] ?? ''}`}
                            >
                              {order.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{maskPhone(order.callerPhone)}</span>
                            <span className="truncate max-w-xs">{itemsSummary(items)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-semibold text-sm">{formatCurrency(order.total * 100)}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                            {order.pickupTime && (
                              <>
                                <Clock className="h-3 w-3" />
                                <span>{formatDate(order.pickupTime)}</span>
                                <span className="mx-1">|</span>
                              </>
                            )}
                            <span>{formatRelativeTime(order.createdAt)}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-muted-foreground">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t bg-muted/20">
                        <div className="pt-4">
                          {/* Item list */}
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Items
                          </h4>
                          <div className="space-y-1 mb-4">
                            {items.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm">
                                <div>
                                  <span className="font-medium">{item.quantity}x</span>{' '}
                                  <span>{item.name}</span>
                                  {item.notes && (
                                    <span className="text-xs text-muted-foreground ml-2">
                                      ({item.notes})
                                    </span>
                                  )}
                                </div>
                                <span className="text-muted-foreground">
                                  {formatCurrency(item.price * item.quantity * 100)}
                                </span>
                              </div>
                            ))}
                            <div className="flex items-center justify-between text-sm font-semibold pt-2 border-t">
                              <span>Total</span>
                              <span>{formatCurrency(order.total * 100)}</span>
                            </div>
                          </div>

                          {/* Notes */}
                          {order.notes && (
                            <div className="mb-4">
                              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                                Notes
                              </h4>
                              <p className="text-sm">{order.notes}</p>
                            </div>
                          )}

                          {/* Meta */}
                          <div className="text-xs text-muted-foreground mb-4">
                            Created {formatDate(order.createdAt)}
                            {order.pickupTime && <> | Pickup: {formatDate(order.pickupTime)}</>}
                          </div>

                          {/* Actions */}
                          {actions.length > 0 && (
                            <div className="flex gap-2">
                              {actions.map((action) => (
                                <Button
                                  key={action.target}
                                  variant={action.variant}
                                  size="sm"
                                  disabled={statusMutation.isPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    statusMutation.mutate({
                                      orderId: order.id,
                                      status: action.target,
                                    });
                                  }}
                                >
                                  {statusMutation.isPending ? 'Updating...' : action.label}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground self-center">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
