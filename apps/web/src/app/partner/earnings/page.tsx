'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import api from '@/lib/api';
import { StatusPill } from '../overview/page';

function fmtUsd(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function PartnerEarningsPage() {
  const [filter, setFilter] = useState<'all' | 'PENDING' | 'PAID'>('all');
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ['agency-commissions', filter],
    queryFn: () =>
      api
        .get('/agency/commissions', {
          params: filter === 'all' ? {} : { status: filter },
        })
        .then((r) => r.data.data),
  });

  const rows = data ?? [];
  const total = rows.reduce((s, r) => s + r.commissionAmountCents, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Earnings</h1>
        <p className="text-slate-400 text-sm mt-1">
          Commission ledger — every invoice your clients pay creates one row.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {(['all', 'PENDING', 'PAID'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
        <div className="ml-auto text-sm text-slate-400">
          Showing total: <span className="text-green-400 font-medium">{fmtUsd(total)}</span>
        </div>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No commissions to show.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3 text-right">Invoice</th>
                  <th className="px-5 py-3 text-right">Rate</th>
                  <th className="px-5 py-3 text-right">Commission</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-800 last:border-0 text-sm"
                  >
                    <td className="px-5 py-3 text-slate-400 text-xs">
                      {new Date(r.accruedAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-white">{r.tenant?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-300">{r.tenant?.plan ?? '—'}</td>
                    <td className="px-5 py-3 text-right text-slate-300">
                      {fmtUsd(r.invoiceAmountCents)}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-400">
                      {r.commissionPct}%
                    </td>
                    <td className="px-5 py-3 text-right text-green-400 font-medium">
                      {fmtUsd(r.commissionAmountCents)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={r.status} />
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
