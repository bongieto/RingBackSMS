'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { AlertTriangle, RefreshCw, CheckCircle2, Play } from 'lucide-react';
import { useState } from 'react';

interface FailureRow {
  id: string;
  tenantId: string;
  effectType: string;
  conversationId: string | null;
  callerPhone: string | null;
  error: string;
  attempts: number;
  lastAttemptAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

export default function SideEffectFailuresPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'open' | 'resolved'>('open');

  const { data, isLoading, refetch, isFetching } = useQuery<FailureRow[]>({
    queryKey: ['admin-side-effect-failures', statusFilter],
    queryFn: () =>
      api
        .get(`/admin/side-effect-failures?status=${statusFilter}`)
        .then((r) => r.data.data),
    refetchInterval: 30_000,
  });

  const mutate = useMutation({
    mutationFn: (body: { id: string; action: 'resolve' | 'retry' }) =>
      api.post('/admin/side-effect-failures', body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-side-effect-failures'] }),
  });

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : '—');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Side-Effect Failures</h1>
          <p className="text-slate-400 text-sm mt-1">
            DLQ rows from processInboundSms. The reprocessor cron retries open rows
            every cycle; this view is for manual review + force-retry.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStatusFilter(statusFilter === 'open' ? 'resolved' : 'open')}
            className="border-slate-700 text-slate-400 hover:text-white"
          >
            Show: {statusFilter === 'open' ? 'Open' : 'Resolved'} (toggle)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-slate-700 text-slate-400 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            {statusFilter === 'open' ? 'Open failures' : 'Resolved failures'} ({data?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-slate-500 text-sm">Loading...</p>
          ) : !data || data.length === 0 ? (
            <p className="text-slate-500 text-sm">
              {statusFilter === 'open' ? 'No open failures — queue is clean.' : 'No resolved rows yet.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase border-b border-slate-800">
                    <th className="pb-2 pr-4">Effect</th>
                    <th className="pb-2 pr-4">Tenant</th>
                    <th className="pb-2 pr-4">Caller</th>
                    <th className="pb-2 pr-4">Attempts</th>
                    <th className="pb-2 pr-4">Last error</th>
                    <th className="pb-2 pr-4">First seen</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.id} className="border-b border-slate-800 last:border-0 align-top">
                      <td className="py-2 pr-4 font-mono text-xs text-slate-300">{row.effectType}</td>
                      <td className="py-2 pr-4 text-xs text-slate-400 font-mono">{row.tenantId.slice(0, 8)}…</td>
                      <td className="py-2 pr-4 text-xs text-slate-400 font-mono">{row.callerPhone ?? '—'}</td>
                      <td className="py-2 pr-4 text-xs text-slate-300">{row.attempts}</td>
                      <td className="py-2 pr-4 text-xs text-red-300 max-w-md truncate" title={row.error}>
                        {row.error}
                      </td>
                      <td className="py-2 pr-4 text-xs text-slate-500">{fmt(row.createdAt)}</td>
                      <td className="py-2 flex gap-1">
                        {row.resolvedAt ? (
                          <span className="text-xs text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> {row.resolvedBy ?? 'resolved'}
                          </span>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={mutate.isPending}
                              onClick={() => mutate.mutate({ id: row.id, action: 'retry' })}
                              className="h-7 px-2 text-xs border-slate-700 text-slate-300 hover:text-white"
                            >
                              <Play className="h-3 w-3 mr-1" /> Retry
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={mutate.isPending}
                              onClick={() => mutate.mutate({ id: row.id, action: 'resolve' })}
                              className="h-7 px-2 text-xs border-slate-700 text-slate-300 hover:text-white"
                            >
                              Dismiss
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
