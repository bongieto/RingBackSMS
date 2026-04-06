'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { Voicemail, Phone, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { voicemailApi } from '@/lib/api';
import { maskPhone } from '@/lib/utils';

interface VoicemailRecord {
  id: string;
  callerPhone: string;
  voicemailDuration: number | null;
  voicemailReceivedAt: string | null;
  occurredAt: string;
  smsSent: boolean;
}

interface PaginatedResponse {
  success: boolean;
  data: VoicemailRecord[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function VoicemailsPage() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['voicemails', tenantId, page],
    queryFn: () => voicemailApi.list(tenantId!, { page, pageSize: 20 }),
    enabled: !!tenantId,
  });

  const voicemails = data?.data ?? [];
  const pagination = data?.pagination;

  const filtered = search
    ? voicemails.filter((v) => v.callerPhone.includes(search))
    : voicemails;

  return (
    <div>
      <Header
        title="Voicemails"
        description={pagination ? `${pagination.total} voicemail${pagination.total !== 1 ? 's' : ''}` : 'Loading...'}
      />

      {/* Search */}
      <div className="mb-4">
        <Input
          placeholder="Search by phone number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Loading voicemails...</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Voicemail className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground font-medium">No voicemails yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              When callers leave a voicemail, they will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-muted-foreground">
                  <th className="p-4 font-medium">Caller</th>
                  <th className="p-4 font-medium">Date & Time</th>
                  <th className="p-4 font-medium">Duration</th>
                  <th className="p-4 font-medium">Recording</th>
                  <th className="p-4 font-medium">SMS</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((vm) => (
                  <tr key={vm.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-mono">{maskPhone(vm.callerPhone)}</span>
                      </div>
                    </td>
                    <td className="p-4 text-sm">
                      {vm.voicemailReceivedAt
                        ? format(parseISO(vm.voicemailReceivedAt), 'MMM d, yyyy h:mm a')
                        : format(parseISO(vm.occurredAt), 'MMM d, yyyy h:mm a')}
                    </td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {formatDuration(vm.voicemailDuration)}
                    </td>
                    <td className="p-4">
                      {tenantId && (
                        <audio
                          controls
                          preload="none"
                          className="h-8 w-48"
                          src={voicemailApi.audioUrl(vm.id, tenantId)}
                        />
                      )}
                    </td>
                    <td className="p-4">
                      <Badge variant={vm.smsSent ? 'success' : 'outline'}>
                        {vm.smsSent ? (
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            Sent
                          </span>
                        ) : (
                          'Not sent'
                        )}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
