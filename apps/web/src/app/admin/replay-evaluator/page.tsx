'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { webApi } from '@/lib/api';
import { toast } from 'sonner';
import { AlertTriangle, BarChart3, RefreshCw, ShieldCheck } from 'lucide-react';

interface AdminTenant {
  id: string;
  name: string;
  isActive: boolean;
}

interface ReplayCase {
  turnId: string;
  callerPhone: string;
  inbound: string;
  originalReply: string;
  replayReply: string;
  originalOutcome: string;
  replayFlowType: string;
  replayFlowStep: string | null;
  labels: string[];
  score: number;
  notes: string[];
  originalBehavior: BotBehaviorStamp | null;
  replayBehavior: BotBehaviorStamp;
}

interface BotBehaviorStamp {
  behaviorVersion: string;
  promptVersion: string;
  ruleVersion: string;
  tenantConfigHash: string | null;
}

interface ReplayReport {
  tenant: { id: string; name: string };
  window: { days: number; since: string; requestedLimit: number };
  replayCallerPhone: string;
  behavior?: { current: BotBehaviorStamp };
  summary: {
    fetched: number;
    replayed: number;
    skipped: number;
    improved: number;
    regressed: number;
    neutral: number;
    totalScore: number;
    labelCounts: Record<string, number>;
  };
  riskyExamples?: ReplayCase[];
  examples?: ReplayCase[];
  skipped: Array<{ turnId: string; reason: string }>;
}

function clsForScore(score: number): string {
  if (score > 0) return 'text-emerald-300';
  if (score < 0) return 'text-red-300';
  return 'text-slate-300';
}

function labelTone(label: string): 'default' | 'destructive' | 'secondary' | 'outline' {
  if (label.includes('introduced') || label.includes('unsupported')) return 'destructive';
  if (label.includes('fixed') || label.includes('blocked') || label.includes('deflected')) return 'default';
  return 'secondary';
}

function clip(text: string, max = 260): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
}

export default function ReplayEvaluatorPage() {
  const [tenantId, setTenantId] = useState('');
  const [days, setDays] = useState(14);
  const [limit, setLimit] = useState(25);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<ReplayReport | null>(null);

  const { data: tenantsData } = useQuery({
    queryKey: ['admin', 'tenants', 'replay-evaluator'],
    queryFn: async () => {
      const res = await webApi.get('/admin/tenants?pageSize=200');
      return res.data.data as AdminTenant[];
    },
  });

  const tenants = useMemo(
    () => (tenantsData ?? []).filter((t) => t.isActive),
    [tenantsData],
  );

  useEffect(() => {
    if (!tenantId && tenants.length > 0) setTenantId(tenants[0].id);
  }, [tenantId, tenants]);

  async function runReplay() {
    if (!tenantId || running) return;
    setRunning(true);
    setReport(null);
    try {
      const res = await webApi.post('/admin/replay-evaluator', {
        tenantId,
        days,
        limit,
        includeExamples: true,
      });
      setReport(res.data.data as ReplayReport);
      toast.success('Replay complete');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? err?.message ?? 'Replay failed');
    } finally {
      setRunning(false);
    }
  }

  const sortedLabels = useMemo(() => {
    const counts = report?.summary.labelCounts ?? {};
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [report]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Replay Evaluator</h1>
          <p className="text-sm text-slate-400 max-w-3xl">
            Replay recent Turn records through the current bot in test mode, then compare old replies with new replies.
          </p>
        </div>
        <Button
          onClick={runReplay}
          disabled={running || !tenantId}
          className="bg-blue-600 hover:bg-blue-500 text-white"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Running...' : 'Run replay'}
        </Button>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
              Tenant
            </label>
            <select
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white"
              value={tenantId}
              onChange={(e) => {
                setTenantId(e.target.value);
                setReport(null);
              }}
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
              Days
            </label>
            <Input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
              className="bg-slate-950 border-slate-800 text-white"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
              Limit
            </label>
            <Input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="bg-slate-950 border-slate-800 text-white"
            />
          </div>
        </CardContent>
      </Card>

      {!report && (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-8 text-center text-slate-400">
            <BarChart3 className="h-8 w-8 mx-auto mb-3 text-slate-500" />
            Run a replay to see routing, guardrail, and reply-change results.
          </CardContent>
        </Card>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Metric label="Fetched" value={report.summary.fetched} />
            <Metric label="Replayed" value={report.summary.replayed} />
            <Metric label="Improved" value={report.summary.improved} tone="good" />
            <Metric label="Regressed" value={report.summary.regressed} tone="bad" />
            <Metric label="Neutral" value={report.summary.neutral} />
            <Metric
              label="Score"
              value={report.summary.totalScore}
              tone={report.summary.totalScore < 0 ? 'bad' : report.summary.totalScore > 0 ? 'good' : undefined}
            />
          </div>

          {report.behavior?.current && (
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                <span className="text-slate-500 uppercase tracking-wide">Behavior</span>
                <VersionText label="behavior" value={report.behavior.current.behaviorVersion} />
                <VersionText label="prompt" value={report.behavior.current.promptVersion} />
                <VersionText label="rules" value={report.behavior.current.ruleVersion} />
                <VersionText label="config" value={report.behavior.current.tenantConfigHash ?? 'none'} />
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Label Counts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sortedLabels.length === 0 ? (
                  <p className="text-sm text-slate-500">No labels recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {sortedLabels.map(([label, count]) => (
                      <div key={label} className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2 last:border-0">
                        <span className="text-xs text-slate-300 break-all">{label}</span>
                        <span className="text-xs font-mono text-slate-500">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  Risky Examples
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(report.riskyExamples ?? []).length === 0 ? (
                  <p className="text-sm text-slate-500">No risky examples in this replay.</p>
                ) : (
                  <div className="space-y-4">
                    {report.riskyExamples?.map((example) => (
                      <ReplayExample key={example.turnId} example={example} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-sm">Top Changed Examples</CardTitle>
            </CardHeader>
            <CardContent>
              {(report.examples ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No examples returned.</p>
              ) : (
                <div className="space-y-4">
                  {report.examples?.map((example) => (
                    <ReplayExample key={example.turnId} example={example} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'good' | 'bad';
}) {
  const valueClass =
    tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-red-300' : 'text-white';
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`text-2xl font-semibold mt-1 ${valueClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function ReplayExample({ example }: { example: ReplayCase }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap gap-1">
          {example.labels.map((label) => (
            <Badge key={label} variant={labelTone(label)} className="text-[10px]">
              {label}
            </Badge>
          ))}
        </div>
        <span className={`text-xs font-mono ${clsForScore(example.score)}`}>
          score {example.score > 0 ? '+' : ''}{example.score}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <TextBlock title="Inbound" text={example.inbound} />
        <TextBlock title="Original reply" text={example.originalReply || '(empty)'} />
        <TextBlock title="Replay reply" text={example.replayReply || '(empty)'} />
      </div>
      {example.notes.length > 0 && (
        <div className="mt-3 border-t border-slate-800 pt-3">
          {example.notes.map((note) => (
            <p key={note} className="text-xs text-amber-300">
              {note}
            </p>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
        <span>turn {example.turnId}</span>
        <span>original {example.originalOutcome}</span>
        <span>replay {example.replayFlowType}{example.replayFlowStep ? ` / ${example.replayFlowStep}` : ''}</span>
        {example.originalBehavior && (
          <span>was {example.originalBehavior.behaviorVersion}</span>
        )}
        <span>now {example.replayBehavior.behaviorVersion}</span>
      </div>
    </div>
  );
}

function VersionText({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-slate-400">
      {label} <span className="font-mono text-slate-200">{value}</span>
    </span>
  );
}

function TextBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">{title}</p>
      <p className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-300 whitespace-pre-wrap">
        {clip(text)}
      </p>
    </div>
  );
}
