'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { tenantApi } from '@/lib/api';
import { OptionForm } from './OptionForm';
import type { Modifier, ModifierGroup } from './types';

export function OptionsTab({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Modifier | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: options = [] } = useQuery<Modifier[]>({
    queryKey: ['options', tenantId],
    queryFn: () => tenantApi.listOptions(tenantId),
    enabled: !!tenantId,
  });
  const { data: groups = [] } = useQuery<ModifierGroup[]>({
    queryKey: ['option-groups', tenantId],
    queryFn: () => tenantApi.listOptionGroups(tenantId),
    enabled: !!tenantId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tenantApi.deleteOption(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['options', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success('Option deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  // Group options by parent group name for readability
  const byGroup = options.reduce<Record<string, Modifier[]>>((acc, o) => {
    const key = o.groupName ?? 'Ungrouped';
    (acc[key] ||= []).push(o);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setCreating(true)} disabled={groups.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> Create Option
        </Button>
      </div>
      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Create an option group first before adding options.
          </CardContent>
        </Card>
      ) : options.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No options yet.
          </CardContent>
        </Card>
      ) : (
        Object.entries(byGroup).map(([groupName, opts]) => (
          <Card key={groupName} className="mb-4">
            <CardContent className="p-0">
              <div className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {groupName}
              </div>
              {opts.map((o) => (
                <div
                  key={o.id}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-muted/40"
                >
                  <div>
                    <div className="font-medium">{o.name}</div>
                    {o.isDefault && (
                      <div className="text-xs text-muted-foreground">Default</div>
                    )}
                  </div>
                  <div className="text-sm whitespace-nowrap">
                    {o.priceAdjust > 0 ? '+' : ''}${o.priceAdjust.toFixed(2)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(o)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Delete option "${o.name}"?`)) deleteMutation.mutate(o.id);
                      }}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}

      {(creating || editing) && (
        <OptionForm
          tenantId={tenantId}
          option={editing}
          groups={groups}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
