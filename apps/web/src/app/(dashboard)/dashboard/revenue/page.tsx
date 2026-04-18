'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, ShoppingBag, TrendingUp, Clock } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { useTenantId } from '@/components/providers/TenantProvider';
import { webApi } from '@/lib/api';

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
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data.dailySeries.map((d) => ({ ...d, dollars: d.revenueCents / 100 }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  fontSize={12}
                />
                <YAxis tickFormatter={(v) => `$${v}`} fontSize={12} />
                <Tooltip
                  formatter={(v: number) => [`$${v.toFixed(2)}`, 'Revenue']}
                  labelFormatter={(d) => new Date(String(d) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                />
                <Line type="monotone" dataKey="dollars" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
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
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.hourHistogram}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={(h) => {
                      if (h === 0) return '12a';
                      if (h === 12) return '12p';
                      return h < 12 ? `${h}a` : `${h - 12}p`;
                    }}
                    fontSize={11}
                    interval={1}
                  />
                  <YAxis allowDecimals={false} fontSize={12} />
                  <Tooltip
                    labelFormatter={(h) => {
                      const hour = Number(h);
                      const label = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
                      return label;
                    }}
                  />
                  <Bar dataKey="orders" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
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
