'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import api from '@/lib/api';

interface AdminAgency {
  id: string;
  clerkUserId: string;
  name: string | null;
  defaultRevSharePct: number;
  stripeConnectAccountId: string | null;
  stripeConnectOnboarded: boolean;
  tenantCount: number;
  portfolioMrrDollars: number;
  pendingCents: number;
  paidCents: number;
  lifetimeCents: number;
  lastPayoutAt: string | null;
}

function fmtUsd(cents: number) {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export default function AdminAgenciesPage() {
  const { data, isLoading } = useQuery<AdminAgency[]>({
    queryKey: ['admin-agencies'],
    queryFn: () => api.get('/admin/agencies').then((r) => r.data.data),
  });

  const rows = data ?? [];
  const totals = rows.reduce(
    (acc, a) => ({
      pending: acc.pending + a.pendingCents,
      paid: acc.paid + a.paidCents,
      mrr: acc.mrr + a.portfolioMrrDollars,
      tenants: acc.tenants + a.tenantCount,
    }),
    { pending: 0, paid: 0, mrr: 0, tenants: 0 },
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Agencies</h1>
        <p className="text-slate-400 text-sm mt-1">
          Financial performance for every agency partner.
        </p>
      </div>

      {/* Program totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Active agencies" value={rows.length.toString()} />
        <StatCard label="Linked tenants" value={totals.tenants.toString()} />
        <StatCard label="Pending commissions" value={fmtUsd(totals.pending)} />
        <StatCard label="Lifetime paid" value={fmtUsd(totals.paid)} />
      </div>

      <Card className="bg-slate-900 border-slate-800">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No agencies yet. Grant agency access on{' '}
            <a href="/admin/users" className="text-blue-400 hover:underline">
              /admin/users
            </a>
            .
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3">Agency</th>
                  <th className="px-5 py-3 text-right">Rev share</th>
                  <th className="px-5 py-3">Payouts</th>
                  <th className="px-5 py-3 text-right">Tenants</th>
                  <th className="px-5 py-3 text-right">Portfolio MRR</th>
                  <th className="px-5 py-3 text-right">Pending</th>
                  <th className="px-5 py-3 text-right">Lifetime</th>
                  <th className="px-5 py-3">Last payout</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-slate-800 last:border-0 text-sm hover:bg-slate-800/50"
                  >
                    <td className="px-5 py-3">
                      <div className="text-white font-medium">
                        {a.name ?? '—'}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {a.clerkUserId}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-slate-300">
                      {a.defaultRevSharePct}%
                    </td>
                    <td className="px-5 py-3 text-xs">
                      {a.stripeConnectOnboarded ? (
                        <span className="text-green-400">Connected</span>
                      ) : (
                        <span className="text-slate-500">Not set up</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-300">
                      {a.tenantCount}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-300">
                      ${a.portfolioMrrDollars.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right text-yellow-400">
                      {fmtUsd(a.pendingCents)}
                    </td>
                    <td className="px-5 py-3 text-right text-green-400 font-medium">
                      {fmtUsd(a.lifetimeCents)}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {a.lastPayoutAt
                        ? new Date(a.lastPayoutAt).toLocaleDateString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
