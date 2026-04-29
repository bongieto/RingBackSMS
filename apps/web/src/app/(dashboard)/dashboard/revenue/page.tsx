'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, ShoppingBag, TrendingUp, Clock } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { useTenantId } from '@/components/providers/TenantProvider';
import { webApi } from '@/lib/api';

const RevenueByDayChart = dynamic(
  () => import('./RevenueCharts').then((mod) => mod.RevenueByDayChart),
  { ssr: false, loading: () => <div className="h-[250px] animate-pulse rounded bg-muted" /> },
);
const OrdersByHourChart = dynamic(
  () => import('./RevenueCharts').then((mod) => mod.OrdersByHourChart),
  { ssr: false, loading: () => <div className="h-[220px] animate-pulse rounded bg-muted" /> },
);

const PERIODS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

interface RevenueData {
  totals: { orders: number; revenueCents: number; tipCents: number; avgTicketCents: number };
  dailySeries: Array<{ date: string; revenueCents: number; orders: number }>;
  topItems: Array<{ name: string; count: number; revenueCents: number }>;
  hourHistogram: Array<{ hour: number; orders: number }>;
}

function fmtDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RevenuePage() {
  const { tenantId } = useTenantId();
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<RevenueData>({
    queryKey: ['revenue', tenantId, days],
    queryFn: () => webApi.get('/revenue', { params: { tenantId, days } }).then((r) => r.data.data),
    enabled: !!tenantId,
  });

  return (
    <div>
      <Header
        title="Revenue"
        description="Orders, tickets, and item mix"
        action={
          <div className="flex gap-2">
            {PERIODS.map((p) => (
              <Button
                key={p.value}
                variant={days === p.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDays(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Revenue" value={fmtDollars(data?.totals.revenueCents ?? 0)} icon={DollarSign} iconColor="text-emerald-500" />
        <StatCard title="Orders" value={data?.totals.orders ?? 0} icon={ShoppingBag} iconColor="text-blue-500" />
        <StatCard title="Avg ticket" value={fmtDollars(data?.totals.avgTicketCents ?? 0)} icon={TrendingUp} iconColor="text-purple-500" />
        <StatCard title="Tips" value={fmtDollars(data?.totals.tipCents ?? 0)} icon={DollarSign} iconColor="text-amber-500" />
      </div>

      {data && data.dailySeries.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Revenue by day</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueByDayChart data={data.dailySeries} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data && data.topItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.topItems.map((item) => (
                  <div key={item.name} className="flex justify-between items-baseline text-sm">
                    <span className="font-medium truncate">{item.name}</span>
                    <div className="flex items-baseline gap-3 shrink-0">
                      <span className="text-muted-foreground text-xs">{item.count}×</span>
                      <span className="font-mono">{fmtDollars(item.revenueCents)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {data && data.hourHistogram.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Orders by hour</CardTitle>
            </CardHeader>
            <CardContent>
              <OrdersByHourChart data={data.hourHistogram} />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                <Clock className="h-3 w-3" />
                Plan staffing around your peak hours.
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {isLoading && (
        <div className="text-center py-12 text-muted-foreground">Loading revenue data…</div>
      )}
    </div>
  );
}
