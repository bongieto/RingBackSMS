'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { ArrowLeft, Phone, Globe, Calendar, MessageSquare, ShoppingBag, Users } from 'lucide-react';

const PLANS = ['STARTER', 'GROWTH', 'SCALE', 'ENTERPRISE'];

export default function AdminTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['admin-tenant', id],
    queryFn: () => api.get(`/admin/tenants/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (body: { plan?: string; isActive?: boolean }) =>
      api.patch(`/admin/tenants/${id}`, body).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      toast.success('Tenant updated');
    },
    onError: () => toast.error('Update failed'),
  });

  if (isLoading) return <div className="text-slate-400">Loading...</div>;
  if (!tenant) return <div className="text-slate-400">Tenant not found</div>;

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/tenants">
          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
            <ArrowLeft className="h-4 w-4 mr-1" /> Tenants
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">{tenant.name}</h1>
          <p className="text-slate-400 text-sm">{tenant.businessType} · Created {new Date(tenant.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Conversations', value: tenant._count?.conversations ?? 0, icon: MessageSquare },
              { label: 'Orders', value: tenant._count?.orders ?? 0, icon: ShoppingBag },
              { label: 'Contacts', value: tenant._count?.contacts ?? 0, icon: Users },
              { label: 'SMS (30d)', value: tenant.smsLast30Days ?? 0, icon: Phone },
            ].map((s) => (
              <Card key={s.label} className="bg-slate-900 border-slate-800">
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-slate-500">{s.label}</p>
                  <p className="text-2xl font-bold text-white mt-1">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Recent conversations */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-sm">Recent Conversations</CardTitle>
            </CardHeader>
            <CardContent>
              {tenant.recentConversations?.length === 0 ? (
                <p className="text-slate-500 text-sm">No conversations yet</p>
              ) : (
                <div className="space-y-2">
                  {tenant.recentConversations?.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                      <div>
                        <span className="text-slate-300 text-sm font-mono">{c.callerPhone}</span>
                        {c.flowType && <span className="ml-2 text-xs text-slate-500">{c.flowType}</span>}
                      </div>
                      <span className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Config */}
          {tenant.config && (
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white text-sm">Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Timezone</span>
                  <span className="text-slate-300">{tenant.config.timezone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Hours</span>
                  <span className="text-slate-300">{tenant.config.businessHoursStart} – {tenant.config.businessHoursEnd}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Owner Email</span>
                  <span className="text-slate-300">{tenant.config.ownerEmail ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cal.com</span>
                  <span className="text-slate-300">{tenant.config.calcomLink ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Slack</span>
                  <span className="text-slate-300">{tenant.config.slackWebhook ? '✓ Connected' : '—'}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column — controls */}
        <div className="space-y-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-sm">Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Status</p>
                <Button
                  size="sm"
                  variant={tenant.isActive ? 'destructive' : 'outline'}
                  className="w-full"
                  onClick={() => updateMutation.mutate({ isActive: !tenant.isActive })}
                  disabled={updateMutation.isPending}
                >
                  {tenant.isActive ? 'Deactivate Account' : 'Reactivate Account'}
                </Button>
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-1">Plan</p>
                <select
                  defaultValue={tenant.plan}
                  onChange={(e) => updateMutation.mutate({ plan: e.target.value })}
                  className="w-full h-9 rounded border border-slate-700 bg-slate-800 text-white text-sm px-3"
                >
                  {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="pt-2 space-y-2 text-xs text-slate-500 border-t border-slate-800">
                <div className="flex justify-between">
                  <span>Tenant ID</span>
                  <span className="font-mono text-slate-400">{tenant.id.slice(0, 8)}...</span>
                </div>
                <div className="flex justify-between">
                  <span>Clerk Org</span>
                  <span className="font-mono text-slate-400">{tenant.clerkOrgId ? tenant.clerkOrgId.slice(0, 8) + '...' : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Phone</span>
                  <span className="font-mono text-slate-400">{tenant.twilioPhoneNumber ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>POS</span>
                  <span className="text-slate-400">{tenant.posProvider ?? '—'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
