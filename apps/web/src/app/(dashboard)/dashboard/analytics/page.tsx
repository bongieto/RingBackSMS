'use client';

import { useQuery } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { analyticsApi } from '@/lib/api';
import { Phone, MessageSquare, ShoppingBag, Calendar, DollarSign } from 'lucide-react';

const PERIODS = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

export default function AnalyticsPage() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;
  const [days, setDays] = useState(30);

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['analytics', tenantId, days],
    queryFn: () => analyticsApi.get(tenantId!, days),
    enabled: !!tenantId,
  });

  const { data: recovery } = useQuery({
    queryKey: ['analytics-recovery', tenantId, days],
    queryFn: () => analyticsApi.recovery(tenantId!, days),
    enabled: !!tenantId,
  });

  const usageChartData = Object.entries(analytics?.usage ?? {}).map(([type, count]) => ({
    name: type.replace('_', ' '),
    count: count as number,
  }));

  const dailyTrend: Array<{ date: string; conversations: number }> = analytics?.dailyTrend ?? [];

  const formatRevenue = (cents: number) => {
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div>
      <Header
        title="Analytics"
        description="Track your RingBack performance"
        action={
          <div className="flex gap-2">
            {PERIODS.map(p => (
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard title="Missed Calls" value={analytics?.missedCalls ?? 0} icon={Phone} iconColor="text-blue-500" />
        <StatCard title="Conversations" value={analytics?.conversations ?? 0} icon={MessageSquare} iconColor="text-purple-500" />
        <StatCard title="Orders" value={analytics?.orders ?? 0} icon={ShoppingBag} iconColor="text-green-500" />
        <StatCard title="Meetings" value={analytics?.meetings ?? 0} icon={Calendar} iconColor="text-orange-500" />
        <StatCard title="Revenue" value={formatRevenue(analytics?.revenue ?? 0)} icon={DollarSign} iconColor="text-emerald-500" />
      </div>

      {/* Recovery Funnel */}
      {recovery && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Recovery Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const steps = [
                { label: 'Missed calls', value: recovery.missedCalls },
                { label: 'SMS sent', value: recovery.smsSent },
                { label: 'Caller replied', value: recovery.callerReplied },
                { label: 'Owner responded', value: recovery.ownerResponded },
                { label: 'Orders created', value: recovery.ordersCreated },
              ];
              const max = Math.max(1, ...steps.map((s) => s.value));
              return (
                <div className="space-y-3">
                  {steps.map((s, i) => {
                    const pct = (s.value / max) * 100;
                    const dropRate = i > 0 && steps[i - 1].value > 0
                      ? Math.round(((steps[i - 1].value - s.value) / steps[i - 1].value) * 100)
                      : null;
                    return (
                      <div key={s.label}>
                        <div className="flex items-baseline justify-between text-sm mb-1">
                          <span className="font-medium">{s.label}</span>
                          <span className="text-muted-foreground">
                            {s.value}
                            {dropRate !== null && dropRate > 0 && (
                              <span className="ml-2 text-xs text-red-500">−{dropRate}%</span>
                            )}
                          </span>
                        </div>
                        <div className="h-3 rounded bg-muted overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t mt-4 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">Conversion</div>
                      <div className="font-semibold text-lg">
                        {(recovery.conversionRate * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Avg response time</div>
                      <div className="font-semibold text-lg">
                        {recovery.avgResponseTimeSeconds > 0
                          ? `${Math.round(recovery.avgResponseTimeSeconds / 60)}m`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Meetings booked</div>
                      <div className="font-semibold text-lg">{recovery.meetingsBooked}</div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Daily Trend Chart */}
      {dailyTrend.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Daily Conversations</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  fontSize={12}
                />
                <YAxis allowDecimals={false} />
                <Tooltip
                  labelFormatter={(d) => new Date(String(d) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                />
                <Line type="monotone" dataKey="conversations" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {usageChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Usage Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={usageChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <div className="text-center py-12 text-muted-foreground">Loading analytics...</div>
      )}
    </div>
  );
}
