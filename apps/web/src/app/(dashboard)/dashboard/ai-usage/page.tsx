'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Sparkles, Zap, DollarSign } from 'lucide-react';
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

interface AiUsageData {
  totals: { calls: number; inputTokens: number; outputTokens: number; costCents: number };
  dailySeries: Array<{ date: string; costCents: number; calls: number }>;
  byPurpose: Array<{ purpose: string; calls: number; inTokens: number; outTokens: number; costCents: number }>;
  byModel: Array<{ model: string; calls: number; costCents: number }>;
}

function fmtDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}

export default function AiUsagePage() {
  const { tenantId } = useTenantId();
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery<AiUsageData>({
    queryKey: ['ai-usage', tenantId, days],
    queryFn: () => webApi.get('/ai-usage', { params: { tenantId, days } }).then((r) => r.data.data),
    enabled: !!tenantId,
  });

  return (
    <div>
      <Header
        title="AI usage"
        description="Estimated token + cost breakdown across the AI features we use"
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
        <StatCard title="Estimated cost" value={fmtDollars(data?.totals.costCents ?? 0)} icon={DollarSign} iconColor="text-emerald-500" />
        <StatCard title="AI calls" value={fmtInt(data?.totals.calls ?? 0)} icon={Sparkles} iconColor="text-purple-500" />
        <StatCard title="Input tokens" value={fmtInt(data?.totals.inputTokens ?? 0)} icon={Zap} iconColor="text-blue-500" />
        <StatCard title="Output tokens" value={fmtInt(data?.totals.outputTokens ?? 0)} icon={Zap} iconColor="text-amber-500" />
      </div>

      {data && data.dailySeries.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Cost by day</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.dailySeries.map((d) => ({ ...d, dollars: d.costCents / 100 }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  fontSize={12}
                />
                <YAxis tickFormatter={(v) => `$${v.toFixed(2)}`} fontSize={12} />
                <Tooltip
                  formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']}
                  labelFormatter={(d) => new Date(String(d) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                />
                <Line type="monotone" dataKey="dollars" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data && data.byPurpose.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>By purpose</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.byPurpose.map((row) => (
                  <div key={row.purpose} className="flex justify-between items-baseline text-sm">
                    <span className="font-medium">{row.purpose}</span>
                    <div className="flex items-baseline gap-3 text-xs">
                      <span className="text-muted-foreground">{fmtInt(row.calls)} calls</span>
                      <span className="font-mono">{fmtDollars(row.costCents)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {data && data.byModel.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>By model</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.byModel.map((row) => (
                  <div key={row.model} className="flex justify-between items-baseline text-sm">
                    <span className="font-medium truncate">{row.model}</span>
                    <div className="flex items-baseline gap-3 text-xs shrink-0">
                      <span className="text-muted-foreground">{fmtInt(row.calls)} calls</span>
                      <span className="font-mono">{fmtDollars(row.costCents)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Costs are estimates based on published provider pricing — treat as ±10% accurate.
      </p>

      {isLoading && (
        <div className="text-center py-12 text-muted-foreground">Loading usage data…</div>
      )}
    </div>
  );
}
