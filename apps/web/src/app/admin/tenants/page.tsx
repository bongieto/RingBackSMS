'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';
import { ChevronLeft, ChevronRight, ExternalLink, Search, Plus, Trash2, X } from 'lucide-react';

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
const BUSINESS_TYPES = ['RESTAURANT', 'SERVICE', 'CONSULTANT', 'MEDICAL', 'RETAIL', 'OTHER'];

const PLAN_BADGE: Record<string, string> = {
  STARTER:    'bg-slate-700 text-slate-300',
  GROWTH:     'bg-blue-900 text-blue-300',
  SCALE:      'bg-purple-900 text-purple-300',
  ENTERPRISE: 'bg-yellow-900 text-yellow-300',
};

// ── Add Tenant Modal ──────────────────────────────────────────────────────────

interface AddTenantModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function AddTenantModal({ onClose, onCreated }: AddTenantModalProps) {
  const [form, setForm] = useState({
    name: '',
    businessType: 'RESTAURANT',
    plan: 'STARTER',
    ownerEmail: '',
    ownerPhone: '',
    greeting: '',
  });

  const mutation = useMutation({
    mutationFn: () => api.post('/admin/tenants', form).then((r) => r.data.data),
    onSuccess: () => {
      toast.success('Tenant created');
      onCreated();
      onClose();
    },
    onError: () => toast.error('Failed to create tenant'),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Add New Tenant</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Organization Name *</label>
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Acme Restaurant"
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Business Type</label>
              <select
                value={form.businessType}
                onChange={(e) => set('businessType', e.target.value)}
                className="w-full h-10 rounded-md border border-slate-700 bg-slate-800 text-white px-3 text-sm"
              >
                {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Plan</label>
              <select
                value={form.plan}
                onChange={(e) => set('plan', e.target.value)}
                className="w-full h-10 rounded-md border border-slate-700 bg-slate-800 text-white px-3 text-sm"
              >
                {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Owner Email</label>
              <Input
                type="email"
                value={form.ownerEmail}
                onChange={(e) => set('ownerEmail', e.target.value)}
                placeholder="owner@example.com"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Owner Phone</label>
              <Input
                value={form.ownerPhone}
                onChange={(e) => set('ownerPhone', e.target.value)}
                placeholder="+15551234567"
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Greeting Message</label>
            <Input
              value={form.greeting}
              onChange={(e) => set('greeting', e.target.value)}
              placeholder="Hi! Sorry we missed your call..."
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button
            className="flex-1"
            onClick={() => mutation.mutate()}
            disabled={!form.name.trim() || mutation.isPending}
          >
            {mutation.isPending ? 'Creating...' : 'Create Tenant'}
          </Button>
          <Button variant="outline" onClick={onClose} className="border-slate-700 text-slate-300">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────

interface DeleteModalProps {
  tenant: AdminTenant;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteModal({ tenant, onClose, onDeleted }: DeleteModalProps) {
  const [confirm, setConfirm] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.delete(`/admin/tenants/${tenant.id}`).then((r) => r.data),
    onSuccess: () => {
      toast.success('Tenant deleted');
      onDeleted();
      onClose();
    },
    onError: () => toast.error('Failed to delete tenant'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-red-900/50 rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <Trash2 className="h-5 w-5 text-red-400" />
          <h2 className="text-lg font-bold text-white">Delete Tenant</h2>
        </div>

        <p className="text-slate-300 text-sm mb-2">
          This will permanently delete <strong>{tenant.name}</strong> and all associated data including
          conversations, orders, contacts, and configuration. This cannot be undone.
        </p>

        <div className="bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2 mb-5">
          <p className="text-xs text-red-400">
            {tenant._count.conversations} conversations · {tenant._count.orders} orders · {tenant._count.contacts} contacts will be deleted
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-xs text-slate-400 mb-1">
            Type <span className="font-mono text-slate-300">{tenant.name}</span> to confirm
          </label>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={tenant.name}
            className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
          />
        </div>

        <div className="flex gap-3">
          <Button
            variant="destructive"
            className="flex-1"
            onClick={() => mutation.mutate()}
            disabled={confirm !== tenant.name || mutation.isPending}
          >
            {mutation.isPending ? 'Deleting...' : 'Delete Permanently'}
          </Button>
          <Button variant="outline" onClick={onClose} className="border-slate-700 text-slate-300">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminTenantsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminTenant | null>(null);

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
      {showAdd && (
        <AddTenantModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
            queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
          }}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          tenant={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
            queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
          }}
        />
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Tenants</h1>
          <p className="text-slate-400 text-sm mt-1">{total} total organizations</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add Tenant
        </Button>
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
                        {t.isActive ? 'Active' : 'Suspended'}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <Link href={`/admin/tenants/${t.id}`}>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-slate-400 hover:text-white">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-slate-600 hover:text-red-400"
                          onClick={() => setDeleteTarget(t)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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
