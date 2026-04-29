'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { MessageSquare, Phone, Search } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { conversationApi, webApi } from '@/lib/api';
import { formatRelativeTime, maskPhone } from '@/lib/utils';
import Link from 'next/link';
import { useTenantId } from '@/components/providers/TenantProvider';

const FLOW_COLORS: Record<string, 'success' | 'secondary' | 'outline' | 'default'> = {
  ORDER: 'success',
  MEETING: 'secondary',
  FALLBACK: 'outline',
  CUSTOM: 'default',
};

interface ConversationIntake {
  verticalLabel: string;
  captured: Array<{ key: string; label: string; value: string }>;
  missing?: Array<{ key: string; label: string }>;
}

interface ConversationListItem {
  id: string;
  callerPhone: string;
  flowType: string | null;
  isActive: boolean;
  messages: unknown[];
  lastMessagePreview?: string | null;
  messageCount?: number;
  updatedAt: string;
  handoffStatus?: string;
  intake?: unknown;
}

function getApiErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Unable to load conversations. Please refresh and try again.';
  const status = error.response?.status;
  if (status === 401) return 'Please sign in again to view conversations.';
  if (status === 403) return 'This organization does not have access to the selected tenant.';
  if (status === 404) return 'No tenant was found for this organization.';
  return 'Unable to load conversations. Please refresh and try again.';
}

function readConversationIntake(value: unknown): ConversationIntake | null {
  if (!value || typeof value !== 'object') return null;
  const intake = value as Partial<ConversationIntake>;
  if (!Array.isArray(intake.captured) || intake.captured.length === 0) return null;
  const captured = intake.captured.filter((field) =>
    field &&
    typeof field.key === 'string' &&
    typeof field.label === 'string' &&
    typeof field.value === 'string',
  );
  if (captured.length === 0) return null;
  return {
    verticalLabel: typeof intake.verticalLabel === 'string' ? intake.verticalLabel : 'Lead',
    captured,
    missing: Array.isArray(intake.missing)
      ? intake.missing.filter((field) => field && typeof field.key === 'string' && typeof field.label === 'string')
      : [],
  };
}

function formatIntakeSummary(intake: ConversationIntake): string {
  const priority = [
    'issue',
    'system_type',
    'care_need',
    'relationship',
    'vehicle',
    'tow_needed',
    'service',
    'product',
    'variant',
    'urgency',
    'preferred_time',
    'start_date',
    'address',
    'location',
    'hold_request',
  ];
  const fields = [...intake.captured].sort((a, b) => {
    const ai = priority.indexOf(a.key);
    const bi = priority.indexOf(b.key);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return fields.slice(0, 3).map((field) => field.value).join(' · ');
}

function intakeSearchText(intake: ConversationIntake | null): string {
  if (!intake) return '';
  return [
    intake.verticalLabel,
    ...intake.captured.flatMap((field) => [field.label, field.value]),
    ...(intake.missing ?? []).map((field) => field.label),
  ].join(' ');
}

export default function ConversationsPage() {
  const { tenantId } = useTenantId();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, error, isError, isLoading } = useQuery({
    queryKey: ['conversations', tenantId, page],
    queryFn: () => conversationApi.list(tenantId!, { page, pageSize: 20 }),
    enabled: !!tenantId,
    retry: (failureCount, err) => {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status && status >= 400 && status < 500) return false;
      return failureCount < 2;
    },
  });

  const conversations = data?.data ?? [];
  const total = data?.pagination?.total ?? 0;
  const totalPages = data?.pagination?.totalPages ?? 1;

  // Batch-fetch consent statuses for all visible conversations
  const { data: consentStatuses } = useQuery<Record<string, string>>({
    queryKey: ['consent-statuses', tenantId],
    queryFn: () =>
      webApi
        .get(`/tenants/${tenantId}/consent-status`)
        .then((r) => r.data.data as Record<string, string>),
    enabled: !!tenantId,
    staleTime: 30_000,
  });

  const filtered = conversations.filter((c: ConversationListItem) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    const intake = readConversationIntake(c.intake);
    return `${c.callerPhone} ${intakeSearchText(intake)}`.toLowerCase().includes(needle);
  });

  return (
    <div>
      <Header title="Conversations" description={`${total} total conversations`} />

      {/* Search */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by phone..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : isError ? (
            <div className="p-12 text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground">{getApiErrorMessage(error)}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground">No conversations yet</p>
              <p className="text-sm text-muted-foreground mt-1">Conversations appear when customers reply to missed-call SMS</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((conv: ConversationListItem) => {
                const messages = Array.isArray(conv.messages) ? conv.messages : [];
                const lastMsg = messages[messages.length - 1] as { content?: string } | undefined;
                const lastMessagePreview = conv.lastMessagePreview ?? lastMsg?.content ?? 'No messages';
                const intake = readConversationIntake(conv.intake);
                const intakeSummary = intake ? formatIntakeSummary(intake) : null;
                return (
                  <Link
                    key={conv.id}
                    href={`/dashboard/conversations/${conv.id}`}
                    className="flex items-center gap-2 sm:gap-4 p-3 sm:p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <Phone className="h-5 w-5 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm">{maskPhone(conv.callerPhone)}</span>
                        {conv.flowType && (
                          <Badge variant={FLOW_COLORS[conv.flowType] ?? 'outline'} className="text-xs">
                            {conv.flowType}
                          </Badge>
                        )}
                        {conv.handoffStatus === 'HUMAN' && (
                          <Badge variant="destructive" className="text-xs">
                            Human
                          </Badge>
                        )}
                        {intake && (
                          <Badge variant="outline" className="text-xs">
                            {intake.verticalLabel}
                          </Badge>
                        )}
                        {intake?.missing && intake.missing.length > 0 && (
                          <Badge variant="outline" className="text-xs text-amber-600">
                            Missing {intake.missing.length}
                          </Badge>
                        )}
                        {conv.isActive && (
                          <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                        )}
                        {(() => {
                          const cs = consentStatuses?.[conv.callerPhone];
                          if (cs === 'PENDING') return <Badge variant="outline" className="text-xs text-yellow-600">⏳ Pending</Badge>;
                          if (cs === 'CONSENTED') return <Badge variant="outline" className="text-xs text-green-600">✓ Consented</Badge>;
                          if (cs === 'DECLINED') return <Badge variant="outline" className="text-xs text-red-600">✗ Declined</Badge>;
                          return null;
                        })()}
                      </div>
                      {intakeSummary && (
                        <p className="mb-0.5 truncate text-xs font-medium text-foreground">
                          {intakeSummary}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground truncate">
                        {lastMessagePreview}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {formatRelativeTime(conv.updatedAt)}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground self-center">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
