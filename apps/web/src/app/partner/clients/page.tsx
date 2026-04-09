'use client';

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import api from '@/lib/api';

function fmtUsd(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function PartnerClientsPage() {
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ['agency-tenants'],
    queryFn: () => api.get('/agency/tenants').then((r) => r.data.data),
  });

  const rows = data ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Clients</h1>
        <p className="text-slate-400 text-sm mt-1">
          Tenants linked to your agency. New tenants you create are auto-linked.
        </p>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No linked clients yet. Create a new organization from the sidebar
            and it will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Business type</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Lifetime commission</th>
                  <th className="px-5 py-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-slate-800 last:border-0 text-sm hover:bg-slate-800/50"
                  >
                    <td className="px-5 py-3 text-white font-medium">{t.name}</td>
                    <td className="px-5 py-3 text-slate-400">{t.businessType}</td>
                    <td className="px-5 py-3 text-slate-300">{t.plan}</td>
                    <td className="px-5 py-3">
                      {t.isActive ? (
                        <span className="text-green-400 text-xs">Active</span>
                      ) : (
                        <span className="text-red-400 text-xs">Suspended</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-green-400">
                      {fmtUsd(t.lifetimeCommissionCents)}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {new Date(t.createdAt).toLocaleDateString()}
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
