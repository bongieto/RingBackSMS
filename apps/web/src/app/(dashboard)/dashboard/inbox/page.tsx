'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Dialog from '@radix-ui/react-dialog';
import Link from 'next/link';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  ExternalLink,
  Inbox,
  ListChecks,
  MessageSquare,
  Phone,
  PhoneCall,
  Search,
  ShoppingBag,
  TimerReset,
  Voicemail,
} from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useTenantId } from '@/components/providers/TenantProvider';
import { recoveryInboxApi, voicemailApi } from '@/lib/api';
import {
  cn,
  formatCallbackTaskTitle,
  formatPhoneNumber,
  formatRelativeTime,
} from '@/lib/utils';
import type { RecoveryPriority, RecoveryState } from '@ringback/shared-types';

type InboxFilter = 'ACTIVE' | RecoveryState;
type ResolutionReason =
  | 'CUSTOMER_CONTACTED'
  | 'ORDER_HANDLED'
  | 'QUESTION_ANSWERED'
  | 'NO_RESPONSE_NEEDED'
  | 'SPAM_OR_WRONG_NUMBER'
  | 'OTHER';

type TimelineEvent = {
  id: string;
  type: 'CALL' | 'VOICEMAIL' | 'CONVERSATION' | 'TASK' | 'ORDER' | 'MEETING';
  occurredAt: string;
  title: string;
  detail: string | null;
  href: string | null;
};

type RecoveryCase = {
  callerPhone: string;
  contact: {
    id: string;
    name: string | null;
    status: string;
    totalOrders: number;
    totalSpent: number;
  } | null;
  state: RecoveryState;
  priority: RecoveryPriority;
  nextAction: string;
  reason: string;
  lastActivityAt: string;
  callCount: number;
  callCount24h: number;
  openTaskCount: number;
  voicemail: {
    id: string;
    duration: number | null;
    intent: string | null;
    summary: string | null;
    transcriptionStatus: string | null;
  } | null;
  conversation: {
    id: string;
    flowType: string | null;
    handoffStatus: string;
    isActive: boolean;
    preview: string | null;
    messageCount: number;
  } | null;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string | null;
    total: number;
  } | null;
  meeting: {
    id: string;
    status: string;
    scheduledAt: string | null;
  } | null;
  disposition: {
    status: 'ACTIVE' | 'SNOOZED' | 'RESOLVED';
    resolutionReason: ResolutionReason | null;
    resolutionNote: string | null;
    resolvedAt: string | null;
    resolvedBy: string | null;
    snoozedUntil: string | null;
    reopenedAt: string | null;
    reopenReason: string | null;
  } | null;
  events: TimelineEvent[];
};

type RecoveryInboxResponse = {
  cases: RecoveryCase[];
  counts: {
    all: number;
    active: number;
    needsAttention: number;
    aiHandling: number;
    waiting: number;
    resolved: number;
  };
  generatedAt: string;
};

const FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: 'ACTIVE', label: 'Active' },
  { key: 'NEEDS_ATTENTION', label: 'Needs attention' },
  { key: 'AI_HANDLING', label: 'AI handling' },
  { key: 'WAITING_CUSTOMER', label: 'Waiting' },
  { key: 'RESOLVED', label: 'Resolved' },
];

const STATE_STYLES: Record<
  RecoveryState,
  { label: string; className: string; icon: typeof Inbox }
> = {
  NEEDS_ATTENTION: {
    label: 'Needs attention',
    className: 'bg-red-50 text-red-700 border-red-200',
    icon: CircleAlert,
  },
  AI_HANDLING: {
    label: 'AI handling',
    className: 'bg-violet-50 text-violet-700 border-violet-200',
    icon: Bot,
  },
  WAITING_PAYMENT: {
    label: 'Waiting for payment',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: Clock3,
  },
  WAITING_CUSTOMER: {
    label: 'Waiting on customer',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: Clock3,
  },
  SNOOZED: {
    label: 'Snoozed',
    className: 'bg-slate-100 text-slate-700 border-slate-300',
    icon: TimerReset,
  },
  RESOLVED: {
    label: 'Resolved',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
  },
};

const EVENT_ICONS: Record<TimelineEvent['type'], typeof Phone> = {
  CALL: Phone,
  VOICEMAIL: Voicemail,
  CONVERSATION: MessageSquare,
  TASK: ListChecks,
  ORDER: ShoppingBag,
  MEETING: Clock3,
};

function isWaiting(state: RecoveryState): boolean {
  return state === 'WAITING_CUSTOMER' || state === 'WAITING_PAYMENT' || state === 'SNOOZED';
}

function matchesFilter(item: RecoveryCase, filter: InboxFilter): boolean {
  if (filter === 'ACTIVE') return item.state !== 'RESOLVED' && item.state !== 'SNOOZED';
  if (filter === 'WAITING_CUSTOMER') return isWaiting(item.state);
  return item.state === filter;
}

function compactDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function RecoveryInboxPage() {
  const { tenantId } = useTenantId();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<InboxFilter>('ACTIVE');
  const [search, setSearch] = useState('');
  const [expandedPhone, setExpandedPhone] = useState<string | null>(null);
  const [resolveCase, setResolveCase] = useState<RecoveryCase | null>(null);
  const [resolutionReason, setResolutionReason] = useState<ResolutionReason>('CUSTOMER_CONTACTED');
  const [resolutionNote, setResolutionNote] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const { data, isLoading, isError } = useQuery<RecoveryInboxResponse>({
    queryKey: ['recovery-inbox', tenantId],
    queryFn: () => recoveryInboxApi.list(tenantId!),
    enabled: Boolean(tenantId),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const updateCase = useMutation({
    mutationFn: recoveryInboxApi.update,
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['recovery-inbox', tenantId] });
      toast.success(
        variables.action === 'resolve'
          ? 'Case marked done'
          : variables.action === 'snooze'
            ? 'Case snoozed'
            : 'Case reopened'
      );
      setResolveCase(null);
      setResolutionNote('');
    },
    onError: () => toast.error('Could not update this recovery case'),
  });

  function snooze(item: RecoveryCase, hours: number) {
    updateCase.mutate({
      tenantId: tenantId!,
      callerPhone: item.callerPhone,
      action: 'snooze',
      snoozedUntil: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
    });
  }

  const cases = useMemo(() => {
    const rows = data?.cases ?? [];
    return rows.filter((item) => {
      if (!matchesFilter(item, filter)) return false;
      if (!deferredSearch) return true;
      const searchText = [
        item.callerPhone,
        item.contact?.name,
        item.voicemail?.intent,
        item.voicemail?.summary,
        item.conversation?.preview,
        item.order?.orderNumber,
        item.nextAction,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchText.includes(deferredSearch);
    });
  }, [data?.cases, deferredSearch, filter]);

  return (
    <div>
      <Header
        title="Recovery Inbox"
        description="Every missed call, voicemail, text, and follow-up — organized by caller."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Needs attention"
          value={data?.counts.needsAttention ?? 0}
          icon={CircleAlert}
          tone="red"
        />
        <SummaryCard
          label="AI handling"
          value={data?.counts.aiHandling ?? 0}
          icon={Bot}
          tone="violet"
        />
        <SummaryCard label="Waiting" value={data?.counts.waiting ?? 0} icon={Clock3} tone="blue" />
        <SummaryCard
          label="Resolved"
          value={data?.counts.resolved ?? 0}
          icon={CheckCircle2}
          tone="green"
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((item) => {
            const count =
              item.key === 'ACTIVE'
                ? data?.counts.active
                : item.key === 'NEEDS_ATTENTION'
                  ? data?.counts.needsAttention
                  : item.key === 'AI_HANDLING'
                    ? data?.counts.aiHandling
                    : item.key === 'RESOLVED'
                      ? data?.counts.resolved
                      : data?.counts.waiting;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={cn(
                  'whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  filter === item.key
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                )}
              >
                {item.label} <span className="ml-1 opacity-75">{count ?? 0}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full xl:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, phone, intent, order…"
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-slate-500">
            Loading recovery cases…
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-red-600">
            Recovery Inbox could not be loaded. Please refresh and try again.
          </CardContent>
        </Card>
      ) : cases.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
            <p className="font-medium text-slate-900">Nothing in this view</p>
            <p className="mt-1 text-sm text-slate-500">
              You are caught up, or no callers match the current search.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {cases.map((item) => (
            <RecoveryCaseCard
              key={item.callerPhone}
              item={item}
              tenantId={tenantId!}
              expanded={expandedPhone === item.callerPhone}
              onToggle={() =>
                setExpandedPhone((current) =>
                  current === item.callerPhone ? null : item.callerPhone
                )
              }
              onResolve={() => {
                setResolveCase(item);
                setResolutionReason('CUSTOMER_CONTACTED');
                setResolutionNote('');
              }}
              onSnooze={(hours) => snooze(item, hours)}
              onReopen={() =>
                updateCase.mutate({
                  tenantId: tenantId!,
                  callerPhone: item.callerPhone,
                  action: 'reopen',
                })
              }
              isUpdating={updateCase.isPending}
            />
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-slate-500">Need the underlying records?</span>
        <Link className="text-blue-600 hover:underline" href="/dashboard/tasks">
          Tasks
        </Link>
        <Link className="text-blue-600 hover:underline" href="/dashboard/conversations">
          SMS archive
        </Link>
        <Link className="text-blue-600 hover:underline" href="/dashboard/voicemails">
          Voicemail archive
        </Link>
      </div>

      {resolveCase ? (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open && !updateCase.isPending) setResolveCase(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[100] bg-slate-950/50" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-xl">
              <Dialog.Title className="text-lg font-semibold text-slate-900">
                Mark this case done?
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-600">
                This removes{' '}
                {resolveCase.contact?.name ?? formatPhoneNumber(resolveCase.callerPhone)} from the
                active queue. New caller activity will reopen it automatically.
              </Dialog.Description>
              {resolveCase.openTaskCount > 0 ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  This caller has {resolveCase.openTaskCount} open task
                  {resolveCase.openTaskCount === 1 ? '' : 's'}. Marking the case done will not
                  complete or delete those tasks.
                </div>
              ) : null}
              <label
                className="mt-4 block text-sm font-medium text-slate-700"
                htmlFor="resolution-reason"
              >
                Resolution reason
              </label>
              <select
                id="resolution-reason"
                value={resolutionReason}
                onChange={(event) => setResolutionReason(event.target.value as ResolutionReason)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="CUSTOMER_CONTACTED">Customer contacted</option>
                <option value="ORDER_HANDLED">Order handled</option>
                <option value="QUESTION_ANSWERED">Question answered</option>
                <option value="NO_RESPONSE_NEEDED">No response needed</option>
                <option value="SPAM_OR_WRONG_NUMBER">Spam or wrong number</option>
                <option value="OTHER">Other</option>
              </select>
              <label
                className="mt-4 block text-sm font-medium text-slate-700"
                htmlFor="resolution-note"
              >
                Internal note <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                id="resolution-note"
                value={resolutionNote}
                onChange={(event) => setResolutionNote(event.target.value.slice(0, 1000))}
                rows={3}
                className="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="What was done?"
              />
              <div className="mt-5 flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button variant="outline" disabled={updateCase.isPending}>
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button
                  onClick={() =>
                    updateCase.mutate({
                      tenantId: tenantId!,
                      callerPhone: resolveCase.callerPhone,
                      action: 'resolve',
                      reason: resolutionReason,
                      note: resolutionNote,
                    })
                  }
                  disabled={updateCase.isPending}
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  {updateCase.isPending ? 'Saving…' : 'Mark done'}
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Inbox;
  tone: 'red' | 'violet' | 'blue' | 'green';
}) {
  const tones = {
    red: 'bg-red-50 text-red-700',
    violet: 'bg-violet-50 text-violet-700',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
  } as const;

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('rounded-lg p-2.5', tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-semibold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RecoveryCaseCard({
  item,
  tenantId,
  expanded,
  onToggle,
  onResolve,
  onSnooze,
  onReopen,
  isUpdating,
}: {
  item: RecoveryCase;
  tenantId: string;
  expanded: boolean;
  onToggle: () => void;
  onResolve: () => void;
  onSnooze: (hours: number) => void;
  onReopen: () => void;
  isUpdating: boolean;
}) {
  const style = STATE_STYLES[item.state];
  const StateIcon = style.icon;
  const readablePhone = formatPhoneNumber(item.callerPhone);
  const callerLabel = item.contact?.name ?? readablePhone;
  const duration = compactDuration(item.voicemail?.duration ?? null);

  return (
    <Card
      className={cn(
        item.priority === 'URGENT' && item.state === 'NEEDS_ATTENTION' ? 'border-red-300' : ''
      )}
    >
      <CardContent className="relative p-0">
        <div className="absolute right-12 top-3 z-10">
          {item.state === 'RESOLVED' ? (
            <Button size="sm" variant="outline" onClick={onReopen} disabled={isUpdating}>
              <span className="hidden sm:inline">Reopen</span>
              <span className="sm:hidden">Open</span>
            </Button>
          ) : item.state === 'SNOOZED' ? (
            <Button size="sm" variant="outline" onClick={onReopen} disabled={isUpdating}>
              <span className="hidden sm:inline">Return to active</span>
              <span className="sm:hidden">Open</span>
            </Button>
          ) : (
            <Button size="sm" onClick={onResolve} disabled={isUpdating}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              <span className="hidden sm:inline">Mark done</span>
              <span className="sm:hidden">Done</span>
            </Button>
          )}
        </div>
        <button
          type="button"
          className="w-full p-4 pr-24 text-left sm:pr-40"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <div className="flex items-start gap-3">
            <div className={cn('mt-0.5 rounded-full border p-2.5', style.className)}>
              <StateIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{callerLabel}</span>
                {item.contact?.name ? (
                  <span className="font-mono text-sm font-medium text-slate-600">
                    {readablePhone}
                  </span>
                ) : null}
                <Badge variant="outline" className={style.className}>
                  {style.label}
                </Badge>
                {item.priority === 'URGENT' ? <Badge variant="destructive">Urgent</Badge> : null}
                {item.voicemail?.intent ? (
                  <Badge variant="outline">{item.voicemail.intent.toLowerCase()}</Badge>
                ) : null}
                {item.callCount24h > 1 ? (
                  <Badge variant="warning">{item.callCount24h} calls today</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm font-medium text-slate-800">{item.nextAction}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {item.conversation?.preview ?? item.voicemail?.summary ?? item.reason}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                <span>{formatRelativeTime(item.lastActivityAt)}</span>
                <span>
                  {item.callCount} call{item.callCount === 1 ? '' : 's'} in 90 days
                </span>
                {item.openTaskCount > 0 ? (
                  <span>
                    {item.openTaskCount} open task{item.openTaskCount === 1 ? '' : 's'}
                  </span>
                ) : null}
                {duration ? <span>{duration} voicemail</span> : null}
              </div>
            </div>
            {expanded ? (
              <ChevronUp className="mt-2 h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="mt-2 h-4 w-4 text-slate-400" />
            )}
          </div>
        </button>

        {expanded ? (
          <div className="border-t bg-slate-50/60 p-4">
            <div className="mb-4 flex flex-wrap gap-2">
              <Button asChild size="sm">
                <a href={`tel:${item.callerPhone}`} aria-label={`Call ${readablePhone}`}>
                  <PhoneCall className="mr-1.5 h-4 w-4" />
                  <span className="sm:hidden">Call now</span>
                  <span className="hidden sm:inline">Call {readablePhone}</span>
                </a>
              </Button>
              {item.conversation ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/dashboard/conversations/${item.conversation.id}`}>
                    <MessageSquare className="mr-1.5 h-4 w-4" />
                    Open conversation
                  </Link>
                </Button>
              ) : null}
              {item.contact ? (
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/contacts">
                    Customer record
                    <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : null}
              {item.state !== 'RESOLVED' ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSnooze(1)}
                    disabled={isUpdating}
                  >
                    <TimerReset className="mr-1.5 h-4 w-4" />
                    Snooze 1 hour
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSnooze(24)}
                    disabled={isUpdating}
                  >
                    Snooze until tomorrow
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSnooze(168)}
                    disabled={isUpdating}
                  >
                    Snooze one week
                  </Button>
                </>
              ) : null}
            </div>

            {item.disposition?.resolutionNote && item.state === 'RESOLVED' ? (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <span className="font-medium">Resolution note:</span>{' '}
                {item.disposition.resolutionNote}
              </div>
            ) : null}

            {item.voicemail ? (
              <div className="mb-4 rounded-lg border bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Latest voicemail
                    </p>
                    <p className="mt-0.5 text-sm text-slate-700">
                      {item.voicemail.summary ??
                        (item.voicemail.duration && item.voicemail.duration <= 3
                          ? 'No usable message'
                          : 'No summary available')}
                    </p>
                  </div>
                  {item.voicemail.transcriptionStatus === 'pending' ? (
                    <Badge variant="warning">Transcription delayed</Badge>
                  ) : null}
                </div>
                <audio
                  className="h-9 w-full max-w-xl"
                  controls
                  preload="none"
                  src={voicemailApi.audioUrl(item.voicemail.id, tenantId)}
                >
                  Your browser does not support voicemail playback.
                </audio>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Caller timeline
              </p>
              <ol className="space-y-2">
                {item.events.map((event) => {
                  const EventIcon = EVENT_ICONS[event.type];
                  const content = (
                    <div className="flex gap-3 rounded-lg border bg-white p-3">
                      <EventIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-slate-800">
                            {event.type === 'TASK'
                              ? formatCallbackTaskTitle(event.title, item.callerPhone)
                              : event.title}
                          </p>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {formatRelativeTime(event.occurredAt)}
                          </span>
                        </div>
                        {event.detail ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                            {event.detail}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                  return (
                    <li key={event.id}>
                      {event.href ? <Link href={event.href}>{content}</Link> : content}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
