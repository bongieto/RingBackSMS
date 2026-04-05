'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/lib/api';
import { DollarSign, TrendingUp, Users, BarChart3, ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface FinanceData {
  mrr: number;
  arr: number;
  mrrGrowth: number;
  newMrr: number;
  revenueByPlan: Array<{ plan: string; count: number; mrr: number }>;
  payingCustomers: number;
  freeCustomers: number;
  totalActive: number;
  totalTenants: number;
  newThisMonth: number;
  lostThisMonth: number;
  smsLast30Days: number;
  ordersLast30Days: number;
  monthlyTrend: Array<{ month: string; mrr: number; tenants: number }>;
  planPricing: Record<string, number>;
  note: string;
}

const PLAN_COLORS: Record<string, string> = {
  STARTER:    'bg-slate-600',
  GROWTH:     'bg-blue-600',
  SCALE:      'bg-purple-600',
  ENTERPRISE: 'bg-yellow-500',
};

const PLAN_TEXT: Record<string, string> = {
  STARTER:    'text-slate-400',
  GROWTH:     'text-blue-400',
  SCALE:      'text-purple-400',
  ENTERPRISE: 'text-yellow-400',
};

function formatCurrency(n: number) {
  return '$' + n.toLocaleString();
}

export default function AdminFinancePage() {
  const { data: fin, isLoading } = useQuery<FinanceData>({
    queryKey: ['admin-finance'],
    queryFn: () => api.get('/admin/finance').then((r) => r.data.data),
    refetchInterval: 120_000,
  });

  if (isLoading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-8">Financial Performance</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="bg-slate-900 border-slate-800 animate-pulse h-28" />
          ))}
        </div>
      </div>
    );
  }

  const maxMrr = Math.max(...(fin?.monthlyTrend.map((m) => m.mrr) ?? [1]), 1);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Financial Performance</h1>
        <p className="text-slate-400 text-sm mt-1">
          Estimated revenue based on plan prices · {fin?.note}
        </p>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* MRR */}
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">MRR</p>
                <p className="text-3xl font-bold text-white mt-1">{formatCurrency(fin?.mrr ?? 0)}</p>
                <div className="flex items-center gap-1 mt-1">
                  {(fin?.mrrGrowth ?? 0) > 0 ? (
                    <ArrowUp className="h-3 w-3 text-green-400" />
                  ) : (fin?.mrrGrowth ?? 0) < 0 ? (
                    <ArrowDown className="h-3 w-3 text-red-400" />
                  ) : (
                    <Minus className="h-3 w-3 text-slate-500" />
                  )}
                  <span className={`text-xs ${(fin?.mrrGrowth ?? 0) > 0 ? 'text-green-400' : (fin?.mrrGrowth ?? 0) < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                    {fin?.mrrGrowth ?? 0}% vs last month
                  </span>
                </div>
              </div>
              <DollarSign className="h-5 w-5 text-green-400 opacity-70" />
            </div>
          </CardContent>
        </Card>

        {/* ARR */}
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">ARR</p>
                <p className="text-3xl font-bold text-white mt-1">{formatCurrency(fin?.arr ?? 0)}</p>
                <p className="text-xs text-slate-500 mt-1">annualized</p>
              </div>
              <TrendingUp className="h-5 w-5 text-blue-400 opacity-70" />
            </div>
          </CardContent>
        </Card>

        {/* New MRR */}
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">New MRR (30d)</p>
                <p className="text-3xl font-bold text-white mt-1">{formatCurrency(fin?.newMrr ?? 0)}</p>
                <p className="text-xs text-slate-500 mt-1">{fin?.newThisMonth ?? 0} new tenants</p>
              </div>
              <TrendingUp className="h-5 w-5 text-purple-400 opacity-70" />
            </div>
          </CardContent>
        </Card>

        {/* Paying customers */}
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Paying Customers</p>
                <p className="text-3xl font-bold text-white mt-1">{fin?.payingCustomers ?? 0}</p>
                <p className="text-xs text-slate-500 mt-1">{fin?.freeCustomers ?? 0} on free plan</p>
              </div>
              <Users className="h-5 w-5 text-yellow-400 opacity-70" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Monthly Revenue Trend */}
        <Card className="lg:col-span-2 bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-slate-400" /> Monthly Revenue Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(fin?.monthlyTrend?.length ?? 0) === 0 ? (
              <p className="text-slate-500 text-sm">No data yet</p>
            ) : (
              <div className="space-y-3">
                {fin?.monthlyTrend.map((m) => {
                  const pct = maxMrr > 0 ? Math.round((m.mrr / maxMrr) * 100) : 0;
                  return (
                    <div key={m.month} className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 w-12 shrink-0">{m.month}</span>
                      <div className="flex-1 bg-slate-800 rounded-full h-5 relative overflow-hidden">
                        <div
                          className="h-5 rounded-full bg-blue-600 transition-all duration-500"
                          style={{ width: `${Math.max(pct, 1)}%` }}
                        />
                      </div>
                      <div className="text-right shrink-0 w-28">
                        <span className="text-white text-sm font-mono">{formatCurrency(m.mrr)}</span>
                        <span className="text-slate-500 text-xs ml-2">{m.tenants}t</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue by Plan */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-slate-400" /> Revenue by Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(fin?.revenueByPlan?.length ?? 0) === 0 ? (
              <p className="text-slate-500 text-sm">No tenants yet</p>
            ) : (
              <div className="space-y-4">
                {fin?.revenueByPlan.map((p) => {
                  const totalMrr = fin.mrr || 1;
                  const pct = p.mrr > 0 ? Math.round((p.mrr / totalMrr) * 100) : 0;
                  return (
                    <div key={p.plan}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className={`font-semibold ${PLAN_TEXT[p.plan] ?? 'text-slate-300'}`}>{p.plan}</span>
                        <div className="text-right">
                          <span className="text-white font-mono">{formatCurrency(p.mrr)}</span>
                          <span className="text-slate-500 text-xs ml-1">/ mo</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-800 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${PLAN_COLORS[p.plan] ?? 'bg-slate-600'}`}
                            style={{ width: `${Math.max(pct, p.count > 0 ? 3 : 0)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 w-16 text-right">{p.count} tenant{p.count !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  );
                })}

                <div className="pt-3 border-t border-slate-800 space-y-1 text-xs text-slate-500">
                  <p className="font-semibold text-slate-400 uppercase tracking-wide text-xs mb-2">Plan Pricing</p>
                  {Object.entries(fin?.planPricing ?? {}).map(([plan, price]) => (
                    <div key={plan} className="flex justify-between">
                      <span>{plan}</span>
                      <span className="font-mono text-slate-400">{price === 0 ? 'Free' : `$${price}/mo`}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Tenants', value: fin?.totalTenants ?? 0 },
          { label: 'Active Tenants', value: fin?.totalActive ?? 0 },
          { label: 'SMS Sent (30d)', value: (fin?.smsLast30Days ?? 0).toLocaleString() },
          { label: 'Orders (30d)', value: (fin?.ordersLast30Days ?? 0).toLocaleString() },
        ].map((s) => (
          <Card key={s.label} className="bg-slate-900 border-slate-800">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className="text-2xl font-bold text-white mt-1">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
