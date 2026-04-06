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
