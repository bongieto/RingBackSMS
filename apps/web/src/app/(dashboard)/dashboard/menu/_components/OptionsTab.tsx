'use client';

import { useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GripVertical, Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { tenantApi } from '@/lib/api';
import { OptionForm } from './OptionForm';
import type { Modifier, ModifierGroup } from './types';
import { mergeOrderedSubset, moveIdToPosition } from '@/lib/menuOrdering';

export function OptionsTab({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Modifier | null>(null);
  const [creating, setCreating] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => tenantApi.reorderOptions(tenantId, ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['options', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success('Option order saved');
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['options', tenantId] });
      toast.error('Failed to save option order');
    },
  });

  const handleDrop = (event: DragEvent<HTMLDivElement>, target: Modifier) => {
    event.preventDefault();
    const dragged = options.find((option) => option.id === draggedId);
    if (
      !dragged ||
      dragged.id === target.id ||
      dragged.groupId !== target.groupId ||
      reorderMutation.isPending
    ) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const groupOptions = options.filter((option) => option.groupId === target.groupId);
    const nextGroupIds = moveIdToPosition(
      groupOptions.map((option) => option.id),
      dragged.id,
      target.id
    );
    const nextAllIds = mergeOrderedSubset(
      options.map((option) => option.id),
      nextGroupIds
    );
    const byId = new Map(options.map((option) => [option.id, option]));
    queryClient.setQueryData<Modifier[]>(
      ['options', tenantId],
      nextAllIds.map((id) => byId.get(id)).filter((option): option is Modifier => !!option)
    );
    reorderMutation.mutate(nextGroupIds);
    setDraggedId(null);
    setDragOverId(null);
  };

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
          <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 border-b px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <div />
            <div />
            <div>Amount</div>
            <div>Actions</div>
          </div>
          {groups.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Create an option group first before adding options.
            </div>
          ) : options.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No options yet.</div>
          ) : (
            options.map((o) => (
              <div
                key={o.id}
                onDragOver={(event) => {
                  const dragged = options.find((option) => option.id === draggedId);
                  if (!dragged || dragged.groupId !== o.groupId) return;
                  event.preventDefault();
                  if (dragged.id !== o.id) setDragOverId(o.id);
                }}
                onDragLeave={() => setDragOverId((current) => (current === o.id ? null : current))}
                onDrop={(event) => handleDrop(event, o)}
                className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-muted/40 ${dragOverId === o.id ? 'border-t-2 border-t-primary bg-primary/5' : ''}`}
              >
                <button
                  type="button"
                  draggable={!reorderMutation.isPending}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', o.id);
                    setDraggedId(o.id);
                  }}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDragOverId(null);
                  }}
                  className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed"
                  aria-label={`Drag ${o.name} to reorder within ${o.groupName ?? 'its option group'}`}
                  title="Drag to reorder within this option group"
                  disabled={reorderMutation.isPending}
                >
                  <GripVertical className="h-4 w-4" />
                </button>
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
