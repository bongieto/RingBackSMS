'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { webApi } from '@/lib/api';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Send, RefreshCw, Bot, User as UserIcon, Zap, CreditCard } from 'lucide-react';

type ReadinessCategory =
  | 'happy_path'
  | 'after_hours'
  | 'emergency'
  | 'handoff'
  | 'pricing'
  | 'booking'
  | 'cancellation'
  | 'vague'
  | 'impossible';

interface AdminTenant {
  id: string;
  name: string;
  isActive: boolean;
}

interface SideEffect {
  type: string;
  payload: unknown;
}

interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
  sideEffects?: SideEffect[];
  flowType?: string;
  flowStep?: string | null;
  at: number;
}

interface ReadinessResult {
  verticalKey: string;
  verticalLabel: string;
  score: number;
  passed: number;
  total: number;
  recommendedIntegrations: string[];
  valueMetrics: string[];
  intakeFields: Array<{ key: string; label: string; examples: string[] }>;
  categoryBreakdown: Array<{
    category: ReadinessCategory;
    passed: number;
    total: number;
    score: number;
  }>;
  escalationPolicies: Array<{
    id: string;
    label: string;
    severity: string;
    keywords: string[];
    stopAutomation: boolean;
    source: string;
  }>;
  results: Array<{
    id: string;
    label: string;
    category: ReadinessCategory;
    message: string;
    passed: boolean;
    failures: string[];
    suggestedFixes: string[];
    reply: string;
    flowType: string;
    flowStep: string | null;
  }>;
}

const CATEGORY_LABELS: Record<ReadinessCategory, string> = {
  happy_path: 'Happy path',
  after_hours: 'After-hours',
  emergency: 'Emergency',
  handoff: 'Handoff',
  pricing: 'Pricing',
  booking: 'Booking',
  cancellation: 'Cancellation',
  vague: 'Vague',
  impossible: 'Boundary',
};

function categoryLabel(category: ReadinessCategory): string {
  return CATEGORY_LABELS[category] ?? category;
}

function readinessStatus(score: number): {
  label: string;
  className: string;
} {
  if (score >= 1) {
    return {
      label: 'Ready',
      className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    };
  }
  if (score >= 0.8) {
    return {
      label: 'Needs review',
      className: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    };
  }
  return {
    label: 'Not ready',
    className: 'bg-red-500/10 text-red-300 border-red-500/30',
  };
}

/**
 * Admin bot tester — talk to the flow engine directly, without Twilio,
 * Stripe, or the POS doing anything real. Side effects are collected
 * and rendered as badges so we can see what WOULD have fired. Lives
 * under /admin so the existing SUPER_ADMIN_CLERK_USER_ID layout gate
 * keeps non-admins out.
 */
export default function BotTesterPage() {
  const [tenantId, setTenantId] = useState<string>('');
  const [callerPhone, setCallerPhone] = useState<string>('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [readinessRunning, setReadinessRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: tenantsData } = useQuery({
    queryKey: ['admin', 'tenants', 'bot-tester'],
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
  }, [tenants, tenantId]);

  useEffect(() => {
    // Scroll to bottom on new messages
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || !tenantId || sending) return;
    setInput('');
    // Special-case: /paid triggers the simulated Stripe webhook path
    // instead of running the flow engine. Mirrors clicking "Mark paid".
    if (/^\/paid\b/i.test(text)) {
      await markPaid(text);
      return;
    }
    const userMsg: ChatMessage = { role: 'user', content: text, at: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setSending(true);
    try {
      const res = await webApi.post('/admin/bot-tester/chat', {
        tenantId,
        message: text,
        ...(callerPhone.trim() && { callerPhone: callerPhone.trim() }),
      });
      const data = res.data.data as {
        reply: string;
        sideEffects: SideEffect[];
        flowType: string;
        flowStep: string | null;
        callerPhone: string;
      };
      if (!callerPhone) setCallerPhone(data.callerPhone);
      const botMsg: ChatMessage = {
        role: 'bot',
        content: data.reply || '(no reply)',
        sideEffects: data.sideEffects,
        flowType: data.flowType,
        flowStep: data.flowStep,
        at: Date.now(),
      };
      setMessages((m) => [...m, botMsg]);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ?? err?.message ?? 'Request failed';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  async function runReadiness() {
    if (!tenantId || readinessRunning) return;
    setReadinessRunning(true);
    setReadiness(null);
    try {
      const res = await webApi.post('/admin/bot-tester/readiness', { tenantId });
      const data = res.data.data as ReadinessResult;
      setReadiness(data);
      const pct = Math.round(data.score * 100);
      if (data.passed === data.total) {
        toast.success(`Readiness ${pct}% (${data.passed}/${data.total})`);
      } else {
        toast.warning(`Readiness ${pct}% (${data.passed}/${data.total})`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Readiness run failed');
    } finally {
      setReadinessRunning(false);
    }
  }

  async function markPaid(triggerLabel = '[Mark paid]') {
    if (!tenantId || sending) return;
    const userMsg: ChatMessage = {
      role: 'user',
      content: triggerLabel,
      at: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);
    setSending(true);
    try {
      const res = await webApi.post('/admin/bot-tester/mark-paid', {
        tenantId,
        ...(callerPhone.trim() && { callerPhone: callerPhone.trim() }),
      });
      const data = res.data.data as {
        reply: string;
        sideEffects: SideEffect[];
        flowType: string;
        flowStep: string | null;
        orderNumber: string;
      };
      const botMsg: ChatMessage = {
        role: 'bot',
        content: data.reply || '(no reply)',
        sideEffects: data.sideEffects,
        flowType: data.flowType,
        flowStep: data.flowStep,
        at: Date.now(),
      };
      setMessages((m) => [...m, botMsg]);
      toast.success(`Order ${data.orderNumber} marked PAID (simulated)`);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ?? err?.message ?? 'Mark-paid failed';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  // "Mark paid" is enabled once the most recent bot turn shows a
  // CREATE_PAYMENT_LINK side effect (= the agent just handed over the
  // payment link; in prod this is where we'd wait for the Stripe webhook).
  const canMarkPaid = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== 'bot') continue;
      return (m.sideEffects ?? []).some(
        (se) => se.type === 'CREATE_PAYMENT_LINK',
      );
    }
    return false;
  }, [messages]);

  const failedReadinessAreas = useMemo(() => {
    if (!readiness) return [];
    return readiness.categoryBreakdown.filter((area) => area.passed < area.total);
  }, [readiness]);

  const readinessFixes = useMemo(() => {
    if (!readiness) return [];
    return [...new Set(readiness.results.flatMap((result) => result.suggestedFixes))];
  }, [readiness]);

  async function resetSession() {
    if (!tenantId) return;
    try {
      await webApi.post('/admin/bot-tester/reset', {
        tenantId,
        ...(callerPhone.trim() && { callerPhone: callerPhone.trim() }),
      });
      setMessages([]);
      toast.success('Session reset');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Reset failed');
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Bot Tester</h1>
        <p className="text-sm text-slate-400">
          Chat directly with the flow engine for a tenant. All side effects are
          stubbed — no Twilio SMS, no Stripe session, no POS push. Conversation
          + caller state ARE persisted so multi-turn flows (carts, confirms)
          behave like prod.
        </p>
      </div>

      <Card className="bg-slate-900 border-slate-800 mb-4">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
              Tenant
            </label>
            <select
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white"
              value={tenantId}
              onChange={(e) => {
                setTenantId(e.target.value);
                setMessages([]);
                setReadiness(null);
              }}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1">
              Caller phone (optional — default sentinel)
            </label>
            <Input
              value={callerPhone}
              onChange={(e) => {
                setCallerPhone(e.target.value);
                setMessages([]);
                setReadiness(null);
              }}
              placeholder="+19990000001"
              className="bg-slate-950 border-slate-800 text-white"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800 mb-4">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-white text-base">Readiness</CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Run the tenant&apos;s vertical scenario pack without sending SMS or creating side effects.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={runReadiness}
            disabled={!tenantId || readinessRunning}
            className="border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-800"
          >
            <Zap className="w-4 h-4 mr-1" />
            {readinessRunning ? 'Running…' : 'Run readiness'}
          </Button>
        </CardHeader>
        {readiness && (
          <CardContent className="pt-0 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
              <div className="rounded border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {readiness.verticalLabel}
                </div>
                <div className="mt-2 text-4xl font-semibold text-white">
                  {Math.round(readiness.score * 100)}%
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`font-mono text-xs px-2 py-1 rounded border ${readinessStatus(readiness.score).className}`}
                  >
                    {readinessStatus(readiness.score).label}
                  </span>
                  <span className="text-xs text-slate-400">
                    {readiness.passed}/{readiness.total}
                  </span>
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex flex-wrap gap-2">
                  {readiness.categoryBreakdown.map((area) => (
                    <span
                      key={area.category}
                      className={`text-xs px-2 py-1 rounded border ${
                        area.passed === area.total
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {categoryLabel(area.category)} {area.passed}/{area.total}
                    </span>
                  ))}
                </div>
                <div className="mt-3 text-sm text-slate-300">
                  {failedReadinessAreas.length === 0
                    ? 'All readiness categories passed for this tenant.'
                    : `Needs attention: ${failedReadinessAreas.map((area) => categoryLabel(area.category)).join(', ')}.`}
                </div>
                {readinessFixes.length > 0 && (
                  <div className="mt-3 space-y-1 text-xs text-slate-400">
                    {readinessFixes.slice(0, 3).map((fix) => (
                      <div key={fix}>Fix: {fix}</div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {readiness.valueMetrics.slice(0, 5).map((metric) => (
                    <span key={metric} className="text-xs text-slate-500">
                      {metric}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {readiness.results.map((result) => (
                <div
                  key={result.id}
                  className={`rounded border p-3 text-sm ${
                    result.passed
                      ? 'border-slate-800 bg-slate-950/70'
                      : 'border-amber-500/30 bg-amber-500/5'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {result.passed ? (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-slate-100">{result.label}</div>
                        <span className="font-mono text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          {categoryLabel(result.category)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500 truncate">
                        “{result.message}”
                      </div>
                      <div className="mt-2 text-xs text-slate-400">
                        {result.reply}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="font-mono text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          {result.flowType}
                          {result.flowStep ? ` · ${result.flowStep}` : ''}
                        </span>
                        {result.failures.map((failure) => (
                          <span
                            key={failure}
                            className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30"
                          >
                            {failure}
                          </span>
                        ))}
                      </div>
                      {!result.passed && result.suggestedFixes.length > 0 && (
                        <div className="mt-2 space-y-1 text-xs text-slate-400">
                          {result.suggestedFixes.map((fix) => (
                            <div key={fix}>Fix: {fix}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {(readiness.intakeFields.length > 0 || readiness.recommendedIntegrations.length > 0 || readiness.escalationPolicies.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-slate-800 pt-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                    Intake fields
                  </div>
                  <div className="text-xs text-slate-400">
                    {readiness.intakeFields.map((f) => f.label).join(', ') || 'None configured'}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                    Recommended integrations
                  </div>
                  <div className="text-xs text-slate-400">
                    {readiness.recommendedIntegrations.slice(0, 5).join(', ') || 'None'}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                    Escalation rules
                  </div>
                  <div className="space-y-1 text-xs text-slate-400">
                    {readiness.escalationPolicies.slice(0, 5).map((policy) => (
                      <div key={policy.id}>
                        {policy.label} · {policy.severity}
                        {policy.stopAutomation ? ' · stops AI' : ' · notify only'}
                      </div>
                    ))}
                    {readiness.escalationPolicies.length === 0 && 'None'}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-white text-base">Conversation</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markPaid()}
              disabled={!canMarkPaid || sending}
              className="text-emerald-400 hover:text-emerald-300 disabled:text-slate-600"
              title={
                canMarkPaid
                  ? 'Simulate Stripe webhook firing for the pending order'
                  : 'Place + confirm an order first so there is a payment link to simulate'
              }
            >
              <CreditCard className="w-4 h-4 mr-1" /> Mark paid
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetSession}
              className="text-slate-400 hover:text-white"
            >
              <RefreshCw className="w-4 h-4 mr-1" /> Reset session
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div
            ref={scrollRef}
            className="h-[480px] overflow-y-auto px-4 py-3 space-y-3 border-t border-slate-800"
          >
            {messages.length === 0 && (
              <div className="text-center text-slate-500 text-sm py-12 px-4 leading-relaxed">
                Send a message to start. Try <code className="text-slate-400">menu</code>,{' '}
                <code className="text-slate-400">order: 1 #A1</code>,{' '}
                <code className="text-slate-400">yes confirm</code>.<br />
                After a payment link fires, click <span className="text-emerald-400">Mark paid</span>{' '}
                or type <code className="text-slate-400">/paid</code> to
                simulate the Stripe webhook.
              </div>
            )}
            {messages.map((m, i) => (
              <MessageBubble key={i} msg={m} />
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Bot className="w-4 h-4 animate-pulse" /> Bot is thinking…
              </div>
            )}
          </div>
          <div className="border-t border-slate-800 p-3 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type a message…"
              disabled={!tenantId || sending}
              className="bg-slate-950 border-slate-800 text-white"
            />
            <Button
              onClick={sendMessage}
              disabled={!tenantId || sending || !input.trim()}
            >
              <Send className="w-4 h-4 mr-1" /> Send
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] ${isUser ? 'order-2' : ''}`}>
        <div
          className={`flex items-start gap-2 ${
            isUser ? 'flex-row-reverse' : ''
          }`}
        >
          <div
            className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
              isUser ? 'bg-blue-600' : 'bg-slate-700'
            }`}
          >
            {isUser ? (
              <UserIcon className="w-4 h-4 text-white" />
            ) : (
              <Bot className="w-4 h-4 text-white" />
            )}
          </div>
          <div
            className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
              isUser
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-100 border border-slate-700'
            }`}
          >
            {msg.content}
          </div>
        </div>
        {!isUser && (msg.sideEffects?.length || msg.flowType) && (
          <div className="ml-9 mt-1.5 flex flex-wrap gap-1.5">
            {msg.flowType && (
              <span className="text-[10px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                {msg.flowType}
                {msg.flowStep ? ` · ${msg.flowStep}` : ''}
              </span>
            )}
            {msg.sideEffects?.map((se, i) => (
              <SideEffectBadge key={i} effect={se} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SideEffectBadge({ effect }: { effect: SideEffect }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen((v) => !v)}
      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 flex items-center gap-1"
      title="Click to toggle payload"
    >
      <Zap className="w-3 h-3" />
      {effect.type}
      {open && (
        <span className="ml-1 max-w-[280px] truncate text-amber-200/80">
          {JSON.stringify(effect.payload)}
        </span>
      )}
    </button>
  );
}
