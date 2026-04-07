'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Reply, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { replyTemplateApi } from '@/lib/api';

interface ReplyTemplate {
  id: string;
  label: string;
  body: string;
  sortOrder: number;
}

export function ReplyTemplatesCard({ tenantId }: { tenantId: string | undefined }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [body, setBody] = useState('');

  const { data: templates = [] } = useQuery<ReplyTemplate[]>({
    queryKey: ['reply-templates', tenantId],
    queryFn: () => replyTemplateApi.list(tenantId!),
    enabled: !!tenantId,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['reply-templates', tenantId] });

  const create = useMutation({
    mutationFn: () => replyTemplateApi.create(tenantId!, label.trim(), body.trim()),
    onSuccess: () => {
      toast.success('Template added');
      setLabel('');
      setBody('');
      refresh();
    },
    onError: () => toast.error('Failed to add template'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => replyTemplateApi.delete(id),
    onSuccess: () => {
      toast.success('Template deleted');
      refresh();
    },
    onError: () => toast.error('Failed to delete template'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Reply className="h-5 w-5" />
          Reply Templates
        </CardTitle>
        <CardDescription>Quick-reply snippets you can send from a voicemail in one tap</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {templates.length > 0 ? (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-start gap-3 rounded-md border p-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{t.body}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Delete template"
                  onClick={() => remove.mutate(t.id)}
                  disabled={remove.isPending}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No templates yet. Add one below.</p>
        )}

        <div className="space-y-2 border-t pt-4">
          <div>
            <Label htmlFor="rt-label">Label</Label>
            <Input
              id="rt-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. On our way"
              maxLength={60}
            />
          </div>
          <div>
            <Label htmlFor="rt-body">Message</Label>
            <textarea
              id="rt-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi! Thanks for calling — we'll be in touch shortly."
              rows={3}
              maxLength={1600}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
            />
          </div>
          <Button
            size="sm"
            onClick={() => create.mutate()}
            disabled={!label.trim() || !body.trim() || create.isPending || !tenantId}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add template
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
