'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import api from '@/lib/api';
import { ArrowLeft, Phone, MessageSquare, ShoppingBag, Users, Trash2, Save, Settings, X } from 'lucide-react';

const PLANS = ['FREE', 'PRO', 'BUSINESS', 'SCALE'];
const BUSINESS_TYPES = ['RESTAURANT', 'FOOD_TRUCK', 'SERVICE', 'CONSULTANT', 'MEDICAL', 'RETAIL', 'OTHER'];

interface AgencyOption {
  id: string;
  name: string | null;
  clerkUserId: string;
  defaultRevSharePct: number;
}

interface TenantDetail {
  id: string;
  name: string;
  businessType: string;
  plan: string;
  isActive: boolean;
  agencyId: string | null;
  agency: {
    id: string;
    name: string | null;
    clerkUserId: string;
    defaultRevSharePct: number | string;
  } | null;
  clerkOrgId: string | null;
  twilioPhoneNumber: string | null;
  twilioSubAccountSid: string | null;
  twilioAuthToken: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  posProvider: string | null;
  posLocationId: string | null;
  posMerchantId: string | null;
  posTokenExpiresAt: string | null;
  createdAt: string;
  smsLast30Days: number;
  recentConversations: Array<{ id: string; callerPhone: string; flowType: string | null; createdAt: string }>;
  _count: { conversations: number; orders: number; contacts: number };
  config: {
    greeting: string;
    timezone: string;
    businessHoursStart: string;
    businessHoursEnd: string;
    ownerEmail: string | null;
    ownerPhone: string | null;
    aiPersonality: string | null;
    calcomLink: string | null;
    slackWebhook: string | null;
  } | null;
}
const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London',
  'Europe/Paris', 'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney',
];

// ── Delete Modal ──────────────────────────────────────────────────────────────

function DeleteModal({ tenantName, onConfirm, onClose, isPending }: {
  tenantName: string;
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [confirm, setConfirm] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-red-900/50 rounded-xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <Trash2 className="h-5 w-5 text-red-400" />
          <h2 className="text-lg font-bold text-white">Delete Tenant</h2>
          <button onClick={onClose} className="ml-auto text-slate-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-slate-300 text-sm mb-4">
          Permanently delete <strong>{tenantName}</strong> and all associated conversations, orders,
          contacts, and configuration. This cannot be undone.
        </p>
        <div className="mb-5">
          <label className="block text-xs text-slate-400 mb-1">
            Type <span className="font-mono text-slate-300">{tenantName}</span> to confirm
          </label>
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={tenantName}
            className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
          />
        </div>
        <div className="flex gap-3">
          <Button
            variant="destructive"
            className="flex-1"
            onClick={onConfirm}
            disabled={confirm !== tenantName || isPending}
          >
            {isPending ? 'Deleting...' : 'Delete Permanently'}
          </Button>
          <Button variant="outline" onClick={onClose} className="border-slate-700 text-slate-300">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminTenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showDelete, setShowDelete] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'config'>('overview');

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});
  const [settingsDirty, setSettingsDirty] = useState(false);

  const { data: tenant, isLoading } = useQuery<TenantDetail>({
    queryKey: ['admin-tenant', id],
    queryFn: () => api.get(`/admin/tenants/${id}`).then((r) => r.data.data),
    enabled: !!id,
  });

  const { data: agencyOptions } = useQuery<AgencyOption[]>({
    queryKey: ['admin-agencies'],
    queryFn: () => api.get('/admin/agencies').then((r) => r.data.data),
  });

  const [agencySelection, setAgencySelection] = useState<string>('');
  useEffect(() => {
    setAgencySelection(tenant?.agencyId ?? '');
  }, [tenant?.agencyId]);

  // Populate settings form when data loads
  useEffect(() => {
    if (!tenant) return;
    setSettingsForm({
      name: tenant.name ?? '',
      businessType: tenant.businessType ?? 'RESTAURANT',
      plan: tenant.plan ?? 'FREE',
      greeting: tenant.config?.greeting ?? '',
      timezone: tenant.config?.timezone ?? 'America/Chicago',
      businessHoursStart: tenant.config?.businessHoursStart ?? '11:00',
      businessHoursEnd: tenant.config?.businessHoursEnd ?? '20:00',
      ownerEmail: tenant.config?.ownerEmail ?? '',
      ownerPhone: tenant.config?.ownerPhone ?? '',
      aiPersonality: tenant.config?.aiPersonality ?? '',
    });
    setSettingsDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id]);

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/admin/tenants/${id}`, body).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      toast.success('Tenant updated');
      setSettingsDirty(false);
    },
    onError: () => toast.error('Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/tenants/${id}`).then((r) => r.data),
    onSuccess: () => {
      toast.success('Tenant deleted');
      router.push('/admin/tenants');
    },
    onError: () => toast.error('Failed to delete tenant'),
  });

  const setField = (key: string, val: string) => {
    setSettingsForm((f) => ({ ...f, [key]: val }));
    setSettingsDirty(true);
  };

  const handleSaveSettings = () => {
    updateMutation.mutate({
      name: settingsForm.name,
      businessType: settingsForm.businessType,
      plan: settingsForm.plan,
      greeting: settingsForm.greeting,
      timezone: settingsForm.timezone,
      businessHoursStart: settingsForm.businessHoursStart,
      businessHoursEnd: settingsForm.businessHoursEnd,
      ownerEmail: settingsForm.ownerEmail || undefined,
      ownerPhone: settingsForm.ownerPhone || undefined,
      aiPersonality: settingsForm.aiPersonality || undefined,
    });
  };

  if (isLoading) return <div className="text-slate-400 p-8">Loading...</div>;
  if (!tenant) return <div className="text-slate-400 p-8">Tenant not found</div>;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'settings', label: 'Settings' },
    { key: 'config', label: 'Integrations' },
  ] as const;

  return (
    <div>
      {showDelete && (
        <DeleteModal
          tenantName={tenant.name}
          onConfirm={() => deleteMutation.mutate()}
          onClose={() => setShowDelete(false)}
          isPending={deleteMutation.isPending}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/tenants">
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
              <ArrowLeft className="h-4 w-4 mr-1" /> Tenants
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{tenant.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded border ${
                tenant.isActive ? 'border-green-700 text-green-400' : 'border-red-800 text-red-400'
              }`}>
                {tenant.isActive ? 'Active' : 'Suspended'}
              </span>
            </div>
            <p className="text-slate-400 text-sm">{tenant.businessType} · {tenant.plan} plan · Created {new Date(tenant.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={tenant.isActive ? 'outline' : 'default'}
            size="sm"
            className={tenant.isActive ? 'border-slate-700 text-slate-300 hover:text-white' : ''}
            onClick={() => updateMutation.mutate({ isActive: !tenant.isActive })}
            disabled={updateMutation.isPending}
          >
            {tenant.isActive ? 'Suspend' : 'Reactivate'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-red-900/60 text-red-400 hover:bg-red-950/40 hover:text-red-300"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? 'text-white border-b-2 border-blue-500 -mb-px'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
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
              {(tenant.recentConversations?.length ?? 0) === 0 ? (
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

          {/* Quick info */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-sm">Account Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                ['Tenant ID', tenant.id],
                ['Clerk Org', tenant.clerkOrgId ?? '—'],
                ['Twilio Phone', tenant.twilioPhoneNumber ?? '—'],
                ['Twilio Sub-Account', tenant.twilioSubAccountSid ?? '—'],
                ['Stripe Customer', tenant.stripeCustomerId ?? '—'],
                ['Stripe Subscription', tenant.stripeSubscriptionId ?? '—'],
                ['POS Provider', tenant.posProvider ?? '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <span className="text-slate-500 shrink-0">{label}</span>
                  <span className="text-slate-300 font-mono text-xs text-right break-all">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Agency link */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-sm">Agency</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {tenant.agency ? (
                <p className="text-slate-300">
                  Linked to <span className="text-white font-medium">{tenant.agency.name ?? tenant.agency.clerkUserId}</span>{' '}
                  <span className="text-slate-500">
                    — {Number(tenant.agency.defaultRevSharePct)}% rev share
                  </span>
                </p>
              ) : (
                <p className="text-slate-500">Not linked to any agency</p>
              )}
              <div className="flex gap-2">
                <select
                  value={agencySelection}
                  onChange={(e) => setAgencySelection(e.target.value)}
                  className="flex-1 h-9 rounded-md border border-slate-700 bg-slate-800 text-white px-3 text-sm"
                >
                  <option value="">— None —</option>
                  {(agencyOptions ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name ?? a.clerkUserId} ({a.defaultRevSharePct}%)
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={
                    updateMutation.isPending ||
                    agencySelection === (tenant.agencyId ?? '')
                  }
                  onClick={() =>
                    updateMutation.mutate({ agencyId: agencySelection || null })
                  }
                >
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Settings Tab ── */}
      {activeTab === 'settings' && (
        <div className="max-w-2xl space-y-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Settings className="h-4 w-4 text-slate-400" /> Organization Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Name & Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Organization Name</label>
                  <Input
                    value={settingsForm.name ?? ''}
                    onChange={(e) => setField('name', e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Business Type</label>
                  <select
                    value={settingsForm.businessType ?? 'RESTAURANT'}
                    onChange={(e) => setField('businessType', e.target.value)}
                    className="w-full h-10 rounded-md border border-slate-700 bg-slate-800 text-white px-3 text-sm"
                  >
                    {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Plan */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Plan</label>
                <select
                  value={settingsForm.plan ?? 'FREE'}
                  onChange={(e) => setField('plan', e.target.value)}
                  className="w-full h-10 rounded-md border border-slate-700 bg-slate-800 text-white px-3 text-sm"
                >
                  {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="border-t border-slate-800 pt-4">
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">Contact Info</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Owner Email</label>
                    <Input
                      type="email"
                      value={settingsForm.ownerEmail ?? ''}
                      onChange={(e) => setField('ownerEmail', e.target.value)}
                      placeholder="owner@example.com"
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Owner Phone</label>
                    <Input
                      value={settingsForm.ownerPhone ?? ''}
                      onChange={(e) => setField('ownerPhone', e.target.value)}
                      placeholder="+15551234567"
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-4">
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">Business Hours</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Timezone</label>
                    <select
                      value={settingsForm.timezone ?? 'America/Chicago'}
                      onChange={(e) => setField('timezone', e.target.value)}
                      className="w-full h-10 rounded-md border border-slate-700 bg-slate-800 text-white px-3 text-sm"
                    >
                      {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Opens</label>
                    <Input
                      type="time"
                      value={settingsForm.businessHoursStart ?? '11:00'}
                      onChange={(e) => setField('businessHoursStart', e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Closes</label>
                    <Input
                      type="time"
                      value={settingsForm.businessHoursEnd ?? '20:00'}
                      onChange={(e) => setField('businessHoursEnd', e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-4">
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">AI Configuration</p>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Greeting Message</label>
                  <Input
                    value={settingsForm.greeting ?? ''}
                    onChange={(e) => setField('greeting', e.target.value)}
                    placeholder="Hi! Sorry we missed your call. How can we help?"
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                  />
                </div>
                <div className="mt-3">
                  <label className="block text-xs text-slate-400 mb-1">AI Personality / Instructions</label>
                  <textarea
                    value={settingsForm.aiPersonality ?? ''}
                    onChange={(e) => setField('aiPersonality', e.target.value)}
                    rows={4}
                    placeholder="You are a helpful assistant for [business name]. Be friendly and concise..."
                    className="w-full rounded-md border border-slate-700 bg-slate-800 text-white text-sm px-3 py-2 placeholder:text-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleSaveSettings}
                  disabled={!settingsDirty || updateMutation.isPending}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="bg-slate-900 border-red-900/40">
            <CardHeader>
              <CardTitle className="text-red-400 text-sm">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white font-medium">
                    {tenant.isActive ? 'Suspend Account' : 'Reactivate Account'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {tenant.isActive
                      ? 'Prevents all SMS and AI activity for this tenant'
                      : 'Restores all functionality for this tenant'}
                  </p>
                </div>
                <Button
                  variant={tenant.isActive ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={() => updateMutation.mutate({ isActive: !tenant.isActive })}
                  disabled={updateMutation.isPending}
                  className={!tenant.isActive ? 'border-slate-700 text-slate-300' : ''}
                >
                  {tenant.isActive ? 'Suspend' : 'Reactivate'}
                </Button>
              </div>
              <div className="flex items-center justify-between border-t border-slate-800 pt-3">
                <div>
                  <p className="text-sm text-white font-medium">Delete Tenant</p>
                  <p className="text-xs text-slate-400 mt-0.5">Permanently removes all data. Cannot be undone.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-900/60 text-red-400 hover:bg-red-950/40"
                  onClick={() => setShowDelete(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Integrations Tab ── */}
      {activeTab === 'config' && (
        <div className="max-w-2xl space-y-4">
          {/* Twilio */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-400" /> Twilio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                ['Phone Number', tenant.twilioPhoneNumber ?? '—'],
                ['Sub-Account SID', tenant.twilioSubAccountSid ?? '—'],
                ['Auth Token', tenant.twilioAuthToken ? '•••••••••••••• (encrypted)' : '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <span className="text-slate-500 shrink-0">{label}</span>
                  <span className="text-slate-300 font-mono text-xs text-right">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Stripe */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-sm">Stripe</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                ['Customer ID', tenant.stripeCustomerId ?? '—'],
                ['Subscription ID', tenant.stripeSubscriptionId ?? '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <span className="text-slate-500 shrink-0">{label}</span>
                  <span className="text-slate-300 font-mono text-xs text-right">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* POS */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-sm">POS Integration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                ['Provider', tenant.posProvider ?? '—'],
                ['Location ID', tenant.posLocationId ?? '—'],
                ['Merchant ID', tenant.posMerchantId ?? '—'],
                ['Token Expires', tenant.posTokenExpiresAt ? new Date(tenant.posTokenExpiresAt).toLocaleString() : '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <span className="text-slate-500 shrink-0">{label}</span>
                  <span className="text-slate-300 font-mono text-xs text-right">{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Cal.com / Notifications */}
          {tenant.config && (
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white text-sm">Notifications & Scheduling</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  ['Cal.com Link', tenant.config.calcomLink ?? '—'],
                  ['Slack Webhook', tenant.config.slackWebhook ? '✓ Configured' : '—'],
                  ['Clerk Org ID', tenant.clerkOrgId ?? '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span className="text-slate-500 shrink-0">{label}</span>
                    <span className="text-slate-300 font-mono text-xs text-right break-all">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
