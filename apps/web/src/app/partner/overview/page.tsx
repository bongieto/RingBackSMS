'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/lib/api';
import { Users, DollarSign, TrendingUp } from 'lucide-react';
import { StatusPill } from '../_components/StatusPill';

interface AgencyMe {
  id: string;
  name: string | null;
  defaultRevSharePct: number;
  stripeConnectOnboarded: boolean;
  stats: {
    tenantCount: number;
    pendingCents: number;
    paidCents: number;
    lifetimeCents: number;
  };
}

function fmtUsd(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function PartnerOverviewPage() {
  const { data, isLoading } = useQuery<AgencyMe>({
    queryKey: ['agency-me'],
    queryFn: () => api.get('/agency/me').then((r) => r.data.data),
    refetchInterval: 60_000,
  });

  const { data: commissions } = useQuery<any[]>({
    queryKey: ['agency-commissions', 'recent'],
    queryFn: () => api.get('/agency/commissions').then((r) => r.data.data),
  });

  if (isLoading || !data) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-8">Partner Overview</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="bg-slate-900 border-slate-800 h-28 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const recent = (commissions ?? []).slice(0, 10);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Partner Overview</h1>
        <p className="text-slate-400 text-sm mt-1">
          {data.defaultRevSharePct}% revenue share on every linked client.
          {!data.stripeConnectOnboarded && (
            <span className="text-yellow-400 ml-2">
              Set up payouts in Settings to receive transfers.
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Active clients"
          value={data.stats.tenantCount.toString()}
          icon={Users}
          color="text-blue-400"
        />
        <StatCard
          label="Pending commissions"
          value={fmtUsd(data.stats.pendingCents)}
          sub="next payout on the 1st"
          icon={TrendingUp}
          color="text-yellow-400"
        />
        <StatCard
          label="Lifetime earned"
          value={fmtUsd(data.stats.lifetimeCents)}
          sub={`${fmtUsd(data.stats.paidCents)} paid`}
          icon={DollarSign}
          color="text-green-400"
        />
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white text-base">Recent commissions</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-slate-500 text-sm">
              No commissions yet. They&apos;ll appear here when your clients pay
              their subscriptions.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase">
                  <th className="pb-2">Client</th>
                  <th className="pb-2">Invoice</th>
                  <th className="pb-2 text-right">Commission</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r: any) => (
                  <tr key={r.id} className="border-t border-slate-800">
                    <td className="py-2 text-white">{r.tenant?.name ?? '—'}</td>
                    <td className="py-2 text-slate-400">{fmtUsd(r.invoiceAmountCents)}</td>
                    <td className="py-2 text-right text-green-400">
                      {fmtUsd(r.commissionAmountCents)}
                    </td>
                    <td className="py-2">
                      <StatusPill status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: any;
  color: string;
}) {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
            <p className="text-3xl font-bold text-white mt-1">{value}</p>
            {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
          </div>
          <Icon className={`h-5 w-5 ${color} opacity-70`} />
        </div>
      </CardContent>
    </Card>
  );
}

