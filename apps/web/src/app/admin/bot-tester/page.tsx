'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { webApi } from '@/lib/api';
import { toast } from 'sonner';
import { Send, RefreshCw, Bot, User as UserIcon, Zap } from 'lucide-react';

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
              onChange={(e) => setCallerPhone(e.target.value)}
              placeholder="+19990000001"
              className="bg-slate-950 border-slate-800 text-white"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-white text-base">Conversation</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetSession}
            className="text-slate-400 hover:text-white"
          >
            <RefreshCw className="w-4 h-4 mr-1" /> Reset session
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div
            ref={scrollRef}
            className="h-[480px] overflow-y-auto px-4 py-3 space-y-3 border-t border-slate-800"
          >
            {messages.length === 0 && (
              <div className="text-center text-slate-500 text-sm py-12">
                Send a message to start. Try "menu", "order: 1 #A1", "yes
                confirm".
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
