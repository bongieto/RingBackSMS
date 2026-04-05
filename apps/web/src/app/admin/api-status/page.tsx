'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { CheckCircle2, XCircle, AlertCircle, RefreshCw, Wifi } from 'lucide-react';

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
            <div>
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
