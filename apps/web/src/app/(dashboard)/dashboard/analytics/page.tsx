'use client';

import { useQuery } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/button';
import { analyticsApi } from '@/lib/api';
import { Phone, MessageSquare, ShoppingBag, Calendar } from 'lucide-react';

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Missed Calls" value={analytics?.missedCalls ?? 0} icon={Phone} iconColor="text-blue-500" />
        <StatCard title="Conversations" value={analytics?.conversations ?? 0} icon={MessageSquare} iconColor="text-purple-500" />
        <StatCard title="Orders" value={analytics?.orders ?? 0} icon={ShoppingBag} iconColor="text-green-500" />
        <StatCard title="Meetings" value={analytics?.meetings ?? 0} icon={Calendar} iconColor="text-orange-500" />
      </div>

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
