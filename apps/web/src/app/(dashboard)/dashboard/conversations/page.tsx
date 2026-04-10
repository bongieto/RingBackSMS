'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { MessageSquare, Phone, Search, Filter } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { conversationApi, webApi } from '@/lib/api';
import { formatRelativeTime, maskPhone } from '@/lib/utils';
import Link from 'next/link';

const FLOW_COLORS: Record<string, 'success' | 'secondary' | 'outline' | 'default'> = {
  ORDER: 'success',
  MEETING: 'secondary',
  FALLBACK: 'outline',
  CUSTOM: 'default',
};

export default function ConversationsPage() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['conversations', tenantId, page],
    queryFn: () => conversationApi.list(tenantId!, { page, pageSize: 20 }),
    enabled: !!tenantId,
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

  const filtered = conversations.filter((c: { callerPhone: string }) =>
    c.callerPhone.includes(search)
  );

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
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground">No conversations yet</p>
              <p className="text-sm text-muted-foreground mt-1">Conversations appear when customers reply to missed-call SMS</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((conv: { id: string; callerPhone: string; flowType: string | null; isActive: boolean; messages: unknown[]; updatedAt: string; handoffStatus?: string }) => {
                const messages = Array.isArray(conv.messages) ? conv.messages : [];
                const lastMsg = messages[messages.length - 1] as { content?: string } | undefined;
                return (
                  <Link
                    key={conv.id}
                    href={`/dashboard/conversations/${conv.id}`}
                    className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
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
                      <p className="text-xs text-muted-foreground truncate">
                        {lastMsg?.content ?? 'No messages'}
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
