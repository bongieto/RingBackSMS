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

  const showForm = creating || !!editing;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button
          onClick={() => {
            setEditing(null);
            setCreating(true);
          }}
          disabled={groups.length === 0}
        >
          <Plus className="h-4 w-4 mr-1" /> Create Option
        </Button>
      </div>

      {showForm && (
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

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <div />
            <div>Amount</div>
            <div>Actions</div>
          </div>
          {groups.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Create an option group first before adding options.
            </div>
          ) : options.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No options yet.
            </div>
          ) : (
            options.map((o) => (
              <div
                key={o.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{o.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {o.groupName ?? 'Ungrouped'}
                    {o.isDefault ? ' · Default' : ''}
                  </div>
                </div>
                <div className="text-sm whitespace-nowrap">
                  {Number(o.priceAdjust) > 0 ? '+' : ''}${Number(o.priceAdjust).toFixed(2)}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setCreating(false);
                      setEditing(o);
                    }}
                    aria-label="Edit"
                  >
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
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
