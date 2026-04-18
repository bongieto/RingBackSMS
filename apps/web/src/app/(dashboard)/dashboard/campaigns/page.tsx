'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Send, Plus, Megaphone } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTenantId } from '@/components/providers/TenantProvider';
import { webApi } from '@/lib/api';

interface Campaign {
  id: string;
  name: string;
  body: string;
  status: string;
  sentCount: number;
  suppressedCount: number;
  failedCount: number;
  createdAt: string;
  sentAt: string | null;
}

export default function CampaignsPage() {
  const { tenantId } = useTenantId();
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ['campaigns', tenantId],
    queryFn: () => webApi.get('/campaigns', { params: { tenantId } }).then((r) => r.data.data),
    enabled: !!tenantId,
    refetchInterval: 10_000,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      webApi.post('/campaigns', { tenantId, name, body }).then((r) => r.data.data as Campaign),
    onSuccess: () => {
      toast.success('Draft saved');
      setComposing(false);
      setName('');
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: () => toast.error('Failed to save draft'),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => webApi.post(`/campaigns/${id}/send`).then((r) => r.data.data),
    onSuccess: (data) => {
      toast.success(`Queued ${data.queued} recipients`);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Send failed'),
  });

  const footerNote = 'Reply STOP to opt out.';
  const preview = body.includes('STOP') ? body : `${body}${body.trim() ? '\n\n' : ''}${footerNote}`;
  const chars = preview.length;

  return (
    <div>
      <Header
        title="Campaigns"
        description="Send SMS blasts to your opted-in contacts"
        action={
          !composing && (
            <Button onClick={() => setComposing(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New campaign
            </Button>
          )
        }
      />

      {composing && (
        <Card className="mb-6">
          <CardContent className="p-6 space-y-4">
            <div>
              <label className="text-sm font-semibold text-slate-700">Name (internal)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Friday lunch special"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700">Message</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder="Hi! We've got fresh lumpia ready tonight — come grab some before we close at 9."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {chars} / 1600 chars · We auto-append &quot;Reply STOP to opt out&quot; for TCPA compliance.
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 border p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Preview</div>
              <div className="text-sm whitespace-pre-wrap">{preview}</div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setComposing(false)}>Cancel</Button>
              <Button onClick={() => createMutation.mutate()} disabled={!name || !body || createMutation.isPending}>
                Save draft
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : (campaigns?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Megaphone className="h-10 w-10 mx-auto text-muted-foreground opacity-30 mb-3" />
            <p className="font-medium text-slate-700">No campaigns yet</p>
            <p className="text-sm text-muted-foreground">Send your first blast to drive a slow hour.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns!.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-slate-900 truncate">{c.name}</h3>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      c.status === 'SENT' ? 'bg-green-100 text-green-800' :
                      c.status === 'SENDING' ? 'bg-blue-100 text-blue-800 animate-pulse' :
                      c.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {c.status.toLowerCase()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 line-clamp-2 whitespace-pre-wrap">{c.body}</p>
                  <div className="mt-2 text-xs text-muted-foreground flex gap-4">
                    <span>Sent: {c.sentCount}</span>
                    {c.suppressedCount > 0 && <span>Suppressed: {c.suppressedCount}</span>}
                    {c.failedCount > 0 && <span className="text-red-600">Failed: {c.failedCount}</span>}
                    <span>Created: {new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                {(c.status === 'DRAFT' || c.status === 'QUEUED') && (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (confirm(`Send "${c.name}" to every opted-in contact?`)) {
                        sendMutation.mutate(c.id);
                      }
                    }}
                    disabled={sendMutation.isPending}
                  >
                    <Send className="h-3.5 w-3.5 mr-1" />
                    Send now
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
