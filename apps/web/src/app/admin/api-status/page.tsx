'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Wifi } from 'lucide-react';

type PosHealth = 'ok' | 'expiring' | 'expired' | 'not_set_up';
type PosProvider = 'square' | 'clover' | 'toast' | 'shopify';

interface TenantIntegration {
  id: string;
  name: string;
  plan: string;
  isActive: boolean;
  twilioPhoneNumber: string | null;
  twilioSubAccountSid: string | null;
  pos: {
    provider: PosProvider | null;
    merchantId: string | null;
    locationId: string | null;
    tokenExpiresAt: string | null;
    health: PosHealth;
  };
}

interface ApiCheckResult {
  name: string;
  configured: boolean;
  status: 'ok' | 'error' | 'unconfigured';
  latencyMs?: number;
  error?: string;
  tenantsConnected?: number;
}

interface ApiStatusData {
  results: ApiCheckResult[];
  checkedAt: string;
  allOk: boolean;
  errors: number;
}

function StatusIcon({ status }: { status: ApiCheckResult['status'] }) {
  if (status === 'ok') return <CheckCircle2 className="h-5 w-5 text-green-400" />;
  if (status === 'error') return <XCircle className="h-5 w-5 text-red-400" />;
  return <AlertCircle className="h-5 w-5 text-slate-500" />;
}

function StatusBadge({ status }: { status: ApiCheckResult['status'] }) {
  const map = {
    ok:           'bg-green-900/30 text-green-400 border-green-800',
    error:        'bg-red-900/30 text-red-400 border-red-800',
    unconfigured: 'bg-slate-800 text-slate-500 border-slate-700',
  };
  const labels = { ok: 'Online', error: 'Error', unconfigured: 'Not Configured' };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function AdminApiStatusPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<ApiStatusData>({
    queryKey: ['admin-api-status'],
    queryFn: () => api.get('/admin/api-status').then((r) => r.data.data),
    staleTime: 30_000,
    retry: 1,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const results = data?.results ?? [];
  const liveChecks = results.filter((r) => r.latencyMs !== undefined);
  const configChecks = results.filter((r) => r.latencyMs === undefined);

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">API Connection Status</h1>
          <p className="text-slate-400 text-sm mt-1">
            {data?.checkedAt
              ? `Last checked ${new Date(data.checkedAt).toLocaleTimeString()}`
              : 'Real-time health check of all platform integrations'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
          className="border-slate-700 text-slate-300 hover:text-white"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing || isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error state */}
      {isError && !isLoading && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-red-800 bg-red-900/20 text-red-300 mb-8">
          <XCircle className="h-4 w-4" />
          <span className="text-sm">Failed to load API status. The health check may have timed out — try refreshing.</span>
        </div>
      )}

      {/* Summary bar */}
      {!isLoading && data && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border mb-8 ${
          data.errors > 0
            ? 'bg-red-900/20 border-red-800 text-red-300'
            : 'bg-green-900/20 border-green-800 text-green-300'
        }`}>
          <Wifi className="h-4 w-4" />
          <span className="text-sm font-medium">
            {data.errors > 0
              ? `${data.errors} service${data.errors > 1 ? 's' : ''} reporting errors`
              : 'All configured services are online'}
          </span>
          <span className="ml-auto text-xs opacity-70">
            {results.filter((r) => r.status === 'ok').length} / {results.length} checks passed
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(10)].map((_, i) => (
            <Card key={i} className="bg-slate-900 border-slate-800 animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <>
          {/* Live-checked services */}
          {liveChecks.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xs text-slate-500 uppercase tracking-widest mb-3">Live API Checks</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {liveChecks.map((r) => (
                  <Card key={r.name} className={`border ${r.status === 'error' ? 'bg-red-950/20 border-red-900/50' : 'bg-slate-900 border-slate-800'}`}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <StatusIcon status={r.status} />
                          <span className="text-sm font-medium text-white">{r.name}</span>
                        </div>
                        <StatusBadge status={r.status} />
                      </div>

                      <div className="mt-2 space-y-1 text-xs text-slate-500">
                        {r.latencyMs !== undefined && r.status !== 'unconfigured' && (
                          <div className="flex justify-between">
                            <span>Latency</span>
                            <span className={`font-mono ${r.latencyMs < 500 ? 'text-green-400' : r.latencyMs < 2000 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {r.latencyMs}ms
                            </span>
                          </div>
                        )}
                        {r.tenantsConnected !== undefined && (
                          <div className="flex justify-between">
                            <span>Tenants connected</span>
                            <span className="text-slate-400">{r.tenantsConnected}</span>
                          </div>
                        )}
                        {r.error && (
                          <p className="text-red-400 mt-1 break-words">{r.error}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Config-only services */}
          {configChecks.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xs text-slate-500 uppercase tracking-widest mb-3">Configuration Status</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {configChecks.map((r) => (
                  <Card key={r.name} className="bg-slate-900 border-slate-800">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <StatusIcon status={r.status} />
                          <span className="text-sm font-medium text-white">{r.name}</span>
                        </div>
                        <StatusBadge status={r.status} />
                      </div>

                      <div className="mt-2 space-y-1 text-xs text-slate-500">
                        <div className="flex justify-between">
                          <span>Credentials</span>
                          <span className={r.configured ? 'text-green-400' : 'text-slate-500'}>
                            {r.configured ? 'Configured' : 'Missing'}
                          </span>
                        </div>
                        {r.tenantsConnected !== undefined && (
                          <div className="flex justify-between">
                            <span>Tenants connected</span>
                            <span className="text-slate-400">{r.tenantsConnected}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-3">
                Twilio, MiniMax, Stripe, Resend, Clerk and Supabase are
                platform-wide shared credentials. See{' '}
                <span className="text-slate-400">Tenant integrations</span>{' '}
                below for per-tenant services like POS.
              </p>
            </div>
          )}

          {/* Per-tenant integrations */}
          <TenantIntegrationsSection />

          {/* Spam-blocked calls audit */}
          <SpamLogSection />
        </>
      )}
    </div>
  );
}

// ── Spam-blocked calls audit ────────────────────────────────────────────────

interface SpamEvent {
  id: string;
  tenantId: string;
  tenantName: string;
  callerPhone: string;
  reason: string;
  createdAt: string;
}

function SpamLogSection() {
  const { data, isLoading } = useQuery<{ events: SpamEvent[] }>({
    queryKey: ['admin-spam-log'],
    queryFn: () => api.get('/admin/spam-log').then((r) => r.data.data),
    staleTime: 60_000,
  });

  const events = data?.events ?? [];

  return (
    <div className="mt-12">
      <h2 className="text-xs text-slate-500 uppercase tracking-widest mb-3">
        Spam-Blocked Calls (last 50)
      </h2>
      <p className="text-xs text-slate-500 mb-3">
        Inbound numbers Twilio Lookup classified as invalid or unbranded
        VoIP. Their consent SMS was suppressed. Review for false positives.
      </p>
      {isLoading ? (
        <div className="h-24 bg-slate-900 border border-slate-800 rounded animate-pulse" />
      ) : events.length === 0 ? (
        <div className="border border-slate-800 rounded-lg p-6 text-center text-slate-500 text-sm bg-slate-900">
          No spam blocks recorded.
        </div>
      ) : (
        <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900">
          <table className="w-full text-sm">
            <thead className="bg-slate-950/60 text-slate-400">
              <tr className="border-b border-slate-800">
                <th className="px-4 py-2 text-left font-medium">When</th>
                <th className="px-4 py-2 text-left font-medium">Tenant</th>
                <th className="px-4 py-2 text-left font-medium">Caller</th>
                <th className="px-4 py-2 text-left font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {events.map((e) => (
                <tr key={e.id} className="border-b border-slate-800 last:border-0">
                  <td className="px-4 py-2 text-xs text-slate-400">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">{e.tenantName}</td>
                  <td className="px-4 py-2 font-mono text-xs">{e.callerPhone}</td>
                  <td className="px-4 py-2 text-xs">{e.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Per-tenant integrations section ─────────────────────────────────────────

function TenantIntegrationsSection() {
  const { data, isLoading } = useQuery<TenantIntegration[]>({
    queryKey: ['admin-api-status-tenants'],
    queryFn: () =>
      api.get('/admin/api-status/tenants').then((r) => r.data.data),
    staleTime: 30_000,
  });

  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<'all' | PosProvider | 'none'>('all');
  const [healthFilter, setHealthFilter] = useState<'all' | PosHealth>('all');

  const rows = data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (providerFilter !== 'all') {
        if (providerFilter === 'none') {
          if (r.pos.provider) return false;
        } else {
          if (r.pos.provider !== providerFilter) return false;
        }
      }
      if (healthFilter !== 'all' && r.pos.health !== healthFilter) return false;
      return true;
    });
  }, [rows, search, providerFilter, healthFilter]);

  return (
    <div>
      <h2 className="text-xs text-slate-500 uppercase tracking-widest mb-3">
        Tenant Integrations
      </h2>

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          type="text"
          placeholder="Search by tenant name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
        />
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value as any)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="all">All providers</option>
          <option value="square">Square</option>
          <option value="clover">Clover</option>
          <option value="toast">Toast</option>
          <option value="shopify">Shopify</option>
          <option value="none">None</option>
        </select>
        <select
          value={healthFilter}
          onChange={(e) => setHealthFilter(e.target.value as any)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="all">All health</option>
          <option value="ok">OK</option>
          <option value="expiring">Expiring</option>
          <option value="expired">Expired</option>
          <option value="not_set_up">Not set up</option>
        </select>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No tenants yet.
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No tenants match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3">Tenant</th>
                  <th className="px-5 py-3">Twilio phone</th>
                  <th className="px-5 py-3">POS provider</th>
                  <th className="px-5 py-3">POS health</th>
                  <th className="px-5 py-3">POS merchant</th>
                  <th className="px-5 py-3">Expires</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-slate-800 last:border-0 text-sm hover:bg-slate-800/50"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/tenants/${t.id}`}
                        className="text-white font-medium hover:text-blue-400"
                      >
                        {t.name}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {t.plan} · {t.isActive ? 'Active' : 'Suspended'}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-300 font-mono text-xs">
                      {t.twilioPhoneNumber ?? (
                        <span className="text-slate-600">— Not set up</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-300">
                      {t.pos.provider ? (
                        <span className="capitalize">{t.pos.provider}</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <PosHealthPill health={t.pos.health} />
                    </td>
                    <td className="px-5 py-3 text-slate-400 font-mono text-xs">
                      {t.pos.merchantId ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {t.pos.tokenExpiresAt
                        ? new Date(t.pos.tokenExpiresAt).toLocaleDateString()
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

function PosHealthPill({ health }: { health: PosHealth }) {
  const map: Record<PosHealth, { cls: string; label: string }> = {
    ok: {
      cls: 'bg-green-900/30 text-green-400 border-green-800',
      label: 'OK',
    },
    expiring: {
      cls: 'bg-yellow-900/30 text-yellow-300 border-yellow-800',
      label: 'Expiring',
    },
    expired: {
      cls: 'bg-red-900/30 text-red-400 border-red-800',
      label: 'Expired',
    },
    not_set_up: {
      cls: 'bg-slate-800 text-slate-500 border-slate-700',
      label: 'Not set up',
    },
  };
  const { cls, label } = map[health];
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${cls}`}>
      {label}
    </span>
  );
}
