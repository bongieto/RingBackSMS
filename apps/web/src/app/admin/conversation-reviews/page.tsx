'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { RefreshCw, Play, ChevronDown, ChevronRight, MessageSquareWarning } from 'lucide-react';

interface ReviewFinding {
  conversationId: string;
  tenantName: string;
  severity: 'high' | 'medium' | 'low';
  category: string;
  issue: string;
  evidence: string;
  suggestedFix: string;
  /** Set once the operator decides: approve files a fix task, dismiss records the call. */
  status?: 'approved' | 'dismissed';
}

interface ReviewReport {
  id: string;
  periodStart: string;
  periodEnd: string;
  conversationCount: number;
  findingCount: number;
  summary: string;
  findings: ReviewFinding[];
  stats: { bySeverity?: Record<string, number>; byCategory?: Record<string, number> } | null;
  createdAt: string;
}

function SeverityBadge({ severity }: { severity: ReviewFinding['severity'] }) {
  const map = {
    high: 'bg-red-900/30 text-red-400 border-red-800',
    medium: 'bg-amber-900/30 text-amber-400 border-amber-800',
    low: 'bg-slate-800 text-slate-400 border-slate-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium uppercase ${map[severity]}`}>
      {severity}
    </span>
  );
}

function FindingRow({
  finding,
  reportId,
  findingIndex,
}: {
  finding: ReviewFinding;
  reportId: string;
  findingIndex: number;
}) {
  const queryClient = useQueryClient();
  const decide = useMutation({
    mutationFn: (status: 'approved' | 'dismissed') =>
      api.patch('/admin/conversation-reviews', { reportId, findingIndex, status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-conversation-reviews'] }),
  });

  const decided = finding.status;

  return (
    <div className={`border border-slate-800 rounded-lg p-4 space-y-2 ${decided === 'dismissed' ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <SeverityBadge severity={finding.severity} />
        <span className="text-xs px-2 py-0.5 rounded border border-slate-700 text-slate-300">
          {finding.category}
        </span>
        <span className="text-xs text-slate-500">{finding.tenantName}</span>
        {decided && (
          <span
            className={`text-xs px-2 py-0.5 rounded border font-medium ${
              decided === 'approved'
                ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {decided === 'approved' ? 'Approved → task created' : 'Dismissed'}
          </span>
        )}
        <a
          href={`/admin/tenants?conversation=${finding.conversationId}`}
          className="text-xs text-slate-500 hover:text-slate-300 underline ml-auto"
        >
          {finding.conversationId.slice(0, 8)}
        </a>
      </div>
      <p className="text-sm text-white">{finding.issue}</p>
      {finding.evidence && (
        <p className="text-xs text-slate-400 border-l-2 border-slate-700 pl-3 italic">
          &ldquo;{finding.evidence}&rdquo;
        </p>
      )}
      <p className="text-sm text-emerald-400/90">
        <span className="text-slate-500">Fix: </span>
        {finding.suggestedFix}
      </p>
      {!decided && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="bg-emerald-700 hover:bg-emerald-600 text-white"
            onClick={() => decide.mutate('approved')}
            disabled={decide.isPending}
          >
            Approve fix
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-slate-700 text-slate-400 hover:text-white"
            onClick={() => decide.mutate('dismissed')}
            disabled={decide.isPending}
          >
            Dismiss
          </Button>
        </div>
      )}
      {decide.isError && (
        <p className="text-xs text-red-400">Failed to save decision — try again.</p>
      )}
    </div>
  );
}

function ReportCard({ report }: { report: ReviewReport }) {
  const [open, setOpen] = useState(false);
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const day = new Date(report.periodEnd).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="p-4">
        <button
          className="w-full flex items-center gap-3 text-left"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? (
            <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-white font-medium">{day}</span>
              <span className="text-xs text-slate-500">
                {report.conversationCount} conversations
              </span>
              {report.findingCount > 0 ? (
                <span className="text-xs px-2 py-0.5 rounded border border-amber-800 bg-amber-900/30 text-amber-400">
                  {report.findingCount} finding{report.findingCount === 1 ? '' : 's'}
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded border border-green-800 bg-green-900/30 text-green-400">
                  clean
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400 mt-1 truncate">{report.summary}</p>
          </div>
        </button>

        {open && findings.length > 0 && (
          <div className="mt-4 space-y-3">
            {findings.map((f, i) => (
              <FindingRow
                key={`${f.conversationId}-${i}`}
                finding={f}
                reportId={report.id}
                findingIndex={i}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminConversationReviewsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<{ reports: ReviewReport[] }>({
    queryKey: ['admin-conversation-reviews'],
    queryFn: () => api.get('/admin/conversation-reviews').then((r) => r.data.data),
    staleTime: 60_000,
    retry: 1,
  });

  const runNow = useMutation({
    mutationFn: () =>
      api.post('/admin/conversation-reviews', { periodHours: 24 }).then((r) => r.data.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-conversation-reviews'] }),
  });

  const reports = data?.reports ?? [];

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Conversation Reviews</h1>
          <p className="text-slate-400 text-sm mt-1">
            Daily AI quality review of bot conversations — issues found and suggested fixes.
            Runs automatically at 9:00 UTC.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="border-slate-700 text-slate-300 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => runNow.mutate()}
            disabled={runNow.isPending}
            className="bg-emerald-700 hover:bg-emerald-600 text-white"
          >
            <Play className={`h-4 w-4 mr-2 ${runNow.isPending ? 'animate-pulse' : ''}`} />
            {runNow.isPending ? 'Reviewing…' : 'Run now'}
          </Button>
        </div>
      </div>

      {runNow.isError && (
        <p className="text-sm text-red-400 mb-4">Manual run failed — check server logs.</p>
      )}
      {isError && !isLoading && (
        <p className="text-sm text-red-400 mb-4">Failed to load reports.</p>
      )}

      {!isLoading && reports.length === 0 && !isError && (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-8 text-center text-slate-400">
            <MessageSquareWarning className="h-8 w-8 mx-auto mb-3 text-slate-600" />
            No review reports yet. The daily cron runs at 9:00 UTC, or click &ldquo;Run
            now&rdquo; to review the last 24 hours immediately.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {reports.map((r) => (
          <ReportCard key={r.id} report={r} />
        ))}
      </div>
    </div>
  );
}
