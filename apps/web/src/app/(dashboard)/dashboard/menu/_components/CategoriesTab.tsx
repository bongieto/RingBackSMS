'use client';

import { useMemo, useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GripVertical, Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { tenantApi } from '@/lib/api';
import { BulkActionBar } from './BulkActionBar';
import { CategoryForm } from './CategoryForm';
import type { MenuCategory } from './types';
import { moveIdToPosition } from '@/lib/menuOrdering';
import { menuMutationError, validSelectedIds } from '@/lib/menuBulk';

export function CategoriesTab({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MenuCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const { data: categories = [] } = useQuery<MenuCategory[]>({
    queryKey: ['menu-categories', tenantId],
    queryFn: () => tenantApi.listCategories(tenantId),
    enabled: !!tenantId,
  });
  const currentSelectedIds = useMemo(
    () => validSelectedIds(selected, categories),
    [selected, categories]
  );

  const toggleMutation = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      tenantApi.updateCategory(tenantId, id, {
        isAvailable,
        name: categories.find((c) => c.id === id)?.name,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-categories', tenantId] }),
    onError: (error) => toast.error(menuMutationError(error, 'Failed to update')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tenantApi.deleteCategory(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-categories', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success('Category deleted');
    },
    onError: (error) => toast.error(menuMutationError(error, 'Failed to delete')),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, isAvailable }: { ids: string[]; isAvailable: boolean }) =>
      tenantApi.bulkSetCategoryAvailability(tenantId, ids, isAvailable),
    onSuccess: async ({ count }: { count: number }, variables) => {
      if (count !== variables.ids.length) {
        await queryClient.invalidateQueries({ queryKey: ['menu-categories', tenantId] });
        toast.error(
          `Only ${count} of ${variables.ids.length} selected categories were updated. Refresh and try again.`
        );
        return;
      }
      const updatedIds = new Set(variables.ids);
      queryClient.setQueryData<MenuCategory[]>(['menu-categories', tenantId], (current = []) =>
        current.map((category) =>
          updatedIds.has(category.id)
            ? { ...category, isAvailable: variables.isAvailable }
            : category
        )
      );
      await queryClient.invalidateQueries({ queryKey: ['menu-categories', tenantId] });
      setSelected(new Set());
      toast.success(`${count} ${count === 1 ? 'category' : 'categories'} updated`);
    },
    onError: async (error) => {
      await queryClient.invalidateQueries({ queryKey: ['menu-categories', tenantId] });
      toast.error(menuMutationError(error, 'Bulk update failed'));
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => tenantApi.reorderCategories(tenantId, ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-categories', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success('Category order saved');
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-categories', tenantId] });
      toast.error('Failed to save category order');
    },
  });

  const bulkBusy = bulkMutation.isPending;
  const actionBusy =
    bulkBusy || toggleMutation.isPending || deleteMutation.isPending || reorderMutation.isPending;

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault();
    if (!draggedId || draggedId === targetId || actionBusy) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const nextIds = moveIdToPosition(
      categories.map((category) => category.id),
      draggedId,
      targetId
    );
    const byId = new Map(categories.map((category) => [category.id, category]));
    queryClient.setQueryData<MenuCategory[]>(
      ['menu-categories', tenantId],
      nextIds.map((id) => byId.get(id)).filter((category): category is MenuCategory => !!category)
    );
    reorderMutation.mutate(nextIds);
    setDraggedId(null);
    setDragOverId(null);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
          disabled={actionBusy}
        >
          <Plus className="h-4 w-4 mr-1" /> Create Category
        </Button>
      </div>

      {showForm && (
        <CategoryForm
          tenantId={tenantId}
          category={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}

      <BulkActionBar
        count={currentSelectedIds.length}
        onEnable={() => bulkMutation.mutate({ ids: currentSelectedIds, isAvailable: true })}
        onDisable={() => bulkMutation.mutate({ ids: currentSelectedIds, isAvailable: false })}
        onClear={() => setSelected(new Set())}
        busy={actionBusy}
      />

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 border-b px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <div />
            <div>Category</div>
            <div>Items</div>
            <div>Available</div>
            <div>Actions</div>
          </div>
          {categories.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No categories yet.</div>
          ) : (
            categories.map((c) => (
              <div
                key={c.id}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (draggedId && draggedId !== c.id) setDragOverId(c.id);
                }}
                onDragLeave={() => setDragOverId((current) => (current === c.id ? null : current))}
                onDrop={(event) => handleDrop(event, c.id)}
                className={`grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-muted/40 ${dragOverId === c.id ? 'border-t-2 border-t-primary bg-primary/5' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    draggable={!actionBusy}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', c.id);
                      setDraggedId(c.id);
                    }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDragOverId(null);
                    }}
                    className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed"
                    aria-label={`Drag ${c.name} to reorder`}
                    title="Drag to reorder"
                    disabled={actionBusy}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    disabled={bulkBusy}
                    className="h-4 w-4"
                  />
                </div>
                <div className="font-medium">{c.name}</div>
                <div className="text-sm text-muted-foreground">{c.itemCount}</div>
                <Switch
                  checked={c.isAvailable}
                  onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, isAvailable: v })}
                  disabled={actionBusy}
                />
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setCreating(false);
                      setEditing(c);
                    }}
                    disabled={actionBusy}
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (
                        confirm(
                          `Delete category "${c.name}"? Items in it will become uncategorized.`
                        )
                      ) {
                        deleteMutation.mutate(c.id);
                      }
                    }}
                    disabled={actionBusy}
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
