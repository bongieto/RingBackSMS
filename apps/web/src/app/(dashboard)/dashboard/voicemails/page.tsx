'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { toast } from 'sonner';
import { Voicemail, Phone, MessageSquare, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { voicemailApi } from '@/lib/api';
import { maskPhone } from '@/lib/utils';

interface VoicemailContact {
  id: string;
  name: string | null;
  status: 'LEAD' | 'CUSTOMER' | 'VIP' | 'INACTIVE';
  totalOrders: number;
  totalSpent: number;
}

interface VoicemailRecord {
  id: string;
  callerPhone: string;
  voicemailDuration: number | null;
  voicemailReceivedAt: string | null;
  occurredAt: string;
  smsSent: boolean;
  repeatCount24h: number;
  contact: VoicemailContact | null;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function statusBadgeVariant(status: VoicemailContact['status']): 'default' | 'success' | 'outline' | 'secondary' {
  switch (status) {
    case 'VIP':
      return 'default';
    case 'CUSTOMER':
      return 'success';
    case 'INACTIVE':
      return 'secondary';
    default:
      return 'outline';
  }
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['voicemails', tenantId, page],
    queryFn: () => voicemailApi.list(tenantId!, { page, pageSize: 20 }),
    enabled: !!tenantId,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['voicemails', tenantId] });
    setSelected(new Set());
  };

  const deleteOne = useMutation({
    mutationFn: (id: string) => voicemailApi.delete(id, tenantId!),
    onSuccess: () => {
      toast.success('Voicemail deleted');
      refresh();
    },
    onError: () => toast.error('Failed to delete voicemail'),
  });

  const deleteBulk = useMutation({
    mutationFn: (ids: string[]) => voicemailApi.bulkDelete(tenantId!, ids),
    onSuccess: (res: { data: { deleted: number } }) => {
      toast.success(`${res.data.deleted} voicemail${res.data.deleted !== 1 ? 's' : ''} deleted`);
      refresh();
    },
    onError: () => toast.error('Failed to delete voicemails'),
  });

  const handleDeleteOne = (id: string) => {
    if (!confirm('Delete this voicemail? This cannot be undone.')) return;
    deleteOne.mutate(id);
  };

  const handleDeleteBulk = () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} voicemail${selected.size !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    deleteBulk.mutate(Array.from(selected));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: string[]) => {
    setSelected((prev) => {
      if (ids.every((id) => prev.has(id))) return new Set();
      return new Set(ids);
    });
  };

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

      {/* Search + bulk actions */}
      <div className="mb-4 flex items-center gap-3">
        <Input
          placeholder="Search by phone number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {selected.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteBulk}
            disabled={deleteBulk.isPending}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Delete {selected.size}
          </Button>
        )}
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
                  <th className="p-4 font-medium w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={filtered.length > 0 && filtered.every((v) => selected.has(v.id))}
                      onChange={() => toggleSelectAll(filtered.map((v) => v.id))}
                    />
                  </th>
                  <th className="p-4 font-medium">Caller</th>
                  <th className="p-4 font-medium">Date & Time</th>
                  <th className="p-4 font-medium">Duration</th>
                  <th className="p-4 font-medium">Recording</th>
                  <th className="p-4 font-medium">SMS</th>
                  <th className="p-4 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((vm) => (
                  <tr key={vm.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="p-4">
                      <input
                        type="checkbox"
                        aria-label={`Select voicemail from ${maskPhone(vm.callerPhone)}`}
                        checked={selected.has(vm.id)}
                        onChange={() => toggleSelect(vm.id)}
                      />
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          {vm.contact?.name ? (
                            <a
                              href={`/dashboard/contacts/${vm.contact.id}`}
                              className="text-sm font-medium hover:underline"
                            >
                              {vm.contact.name}
                            </a>
                          ) : (
                            <span className="text-sm font-mono">{maskPhone(vm.callerPhone)}</span>
                          )}
                          {vm.contact && (
                            <Badge variant={statusBadgeVariant(vm.contact.status)} className="text-xs">
                              {vm.contact.status}
                            </Badge>
                          )}
                          {vm.repeatCount24h > 1 && (
                            <Badge variant="outline" className="text-xs">
                              {ordinal(vm.repeatCount24h)} call today
                            </Badge>
                          )}
                        </div>
                        {vm.contact?.name && (
                          <span className="text-xs font-mono text-muted-foreground ml-6">
                            {maskPhone(vm.callerPhone)}
                          </span>
                        )}
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
                    <td className="p-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Delete voicemail"
                        onClick={() => handleDeleteOne(vm.id)}
                        disabled={deleteOne.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
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
