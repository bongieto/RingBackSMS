'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { ChevronLeft, ChevronRight, ExternalLink, Search } from 'lucide-react';

interface AdminTenant {
  id: string;
  name: string;
  businessType: string;
  plan: string;
  isActive: boolean;
  clerkOrgId: string | null;
  twilioPhoneNumber: string | null;
  posProvider: string | null;
  createdAt: string;
  _count: { conversations: number; orders: number; contacts: number };
}

const PLANS = ['STARTER', 'GROWTH', 'SCALE', 'ENTERPRISE'];

const PLAN_BADGE: Record<string, string> = {
  STARTER:    'bg-slate-700 text-slate-300',
  GROWTH:     'bg-blue-900 text-blue-300',
  SCALE:      'bg-purple-900 text-purple-300',
  ENTERPRISE: 'bg-yellow-900 text-yellow-300',
};

export default function AdminTenantsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tenants', search, planFilter, page],
    queryFn: () =>
      api.get('/admin/tenants', {
        params: { search: search || undefined, plan: planFilter || undefined, page, pageSize: 20 },
      }).then((r) => r.data),
  });

  const tenants: AdminTenant[] = data?.data ?? [];
  const total: number = data?.pagination?.total ?? 0;
  const totalPages: number = data?.pagination?.totalPages ?? 1;

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; plan?: string; isActive?: boolean }) =>
      api.patch(`/admin/tenants/${id}`, body).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('Tenant updated');
      setEditingId(null);
    },
    onError: () => toast.error('Failed to update tenant'),
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Tenants</h1>
        <p className="text-slate-400 text-sm mt-1">{total} total organizations</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-3 text-slate-500" />
          <Input
            placeholder="Search name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9 w-56 bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
          />
        </div>
        <select
          value={planFilter}
          onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
          className="h-10 rounded-md border border-slate-700 bg-slate-900 text-slate-300 px-3 text-sm"
        >
          <option value="">All Plans</option>
          {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Table */}
      <Card className="bg-slate-900 border-slate-800">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">Loading tenants...</div>
        ) : tenants.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No tenants found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3">Organization</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">POS</th>
                  <th className="px-5 py-3 text-right">Convos</th>
                  <th className="px-5 py-3 text-right">Orders</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Joined</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/50 text-sm">
                    <td className="px-5 py-3">
                      <div className="font-medium text-white">{t.name}</div>
                      <div className="text-xs text-slate-500">{t.businessType}</div>
                    </td>
                    <td className="px-5 py-3">
                      {editingId === t.id ? (
                        <div className="flex gap-2 items-center">
                          <select
                            value={editPlan}
                            onChange={(e) => setEditPlan(e.target.value)}
                            className="h-7 text-xs rounded border border-slate-700 bg-slate-800 text-white px-2"
                          >
                            {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => updateMutation.mutate({ id: t.id, plan: editPlan })}
                            disabled={updateMutation.isPending}
                          >Save</Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-400" onClick={() => setEditingId(null)}>✕</Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingId(t.id); setEditPlan(t.plan); }}
                          className={`text-xs font-mono px-2 py-0.5 rounded cursor-pointer hover:opacity-80 ${PLAN_BADGE[t.plan] ?? 'bg-slate-700 text-slate-300'}`}
                        >
                          {t.plan}
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400 font-mono">
                      {t.twilioPhoneNumber ?? <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">
                      {t.posProvider ?? <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-300">{t._count.conversations}</td>
                    <td className="px-5 py-3 text-right text-slate-300">{t._count.orders}</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => updateMutation.mutate({ id: t.id, isActive: !t.isActive })}
                        className={`text-xs px-2 py-0.5 rounded border cursor-pointer ${
                          t.isActive
                            ? 'border-green-700 text-green-400 hover:bg-red-900/20 hover:border-red-700 hover:text-red-400'
                            : 'border-red-800 text-red-400 hover:bg-green-900/20 hover:border-green-700 hover:text-green-400'
                        }`}
                      >
                        {t.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/admin/tenants/${t.id}`}>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-slate-400 hover:text-white">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-800 text-sm text-slate-400">
            <span>Page {page} of {totalPages} ({total} total)</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page <= 1}
                className="border-slate-700 text-slate-400 hover:text-white">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
                className="border-slate-700 text-slate-400 hover:text-white">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
