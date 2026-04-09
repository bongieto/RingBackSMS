'use client';

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import api from '@/lib/api';
import { StatusPill } from '../overview/page';

function fmtUsd(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function PartnerPayoutsPage() {
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ['agency-payouts'],
    queryFn: () => api.get('/agency/payouts').then((r) => r.data.data),
  });
  const rows = data ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Payouts</h1>
        <p className="text-slate-400 text-sm mt-1">
          Transfers to your connected bank account. Issued on the 1st of each month
          for balances over $10.
        </p>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No payouts yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3">Period</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Paid</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Transfer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-slate-800 last:border-0 text-sm"
                  >
                    <td className="px-5 py-3 text-slate-300">
                      {new Date(p.periodStart).toLocaleDateString()} –{' '}
                      {new Date(p.periodEnd).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-5 py-3 text-right text-green-400 font-medium">
                      {fmtUsd(p.amountCents)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={p.status} />
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500 font-mono">
                      {p.stripeTransferId ?? '—'}
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
