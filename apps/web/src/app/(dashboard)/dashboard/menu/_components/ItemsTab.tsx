'use client';

import { useMemo, useState, type DragEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GripVertical, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { tenantApi } from '@/lib/api';
import { BulkActionBar } from './BulkActionBar';
import { ItemForm } from './ItemForm';
import type { MenuCategory, MenuItem } from './types';
import { mergeOrderedSubset, moveIdToPosition } from '@/lib/menuOrdering';
import { menuMutationError, validSelectedIds } from '@/lib/menuBulk';

export function ItemsTab({ tenantId, noun = 'Item' }: { tenantId: string; noun?: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('');
  const [showDisabled, setShowDisabled] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const { data: items = [] } = useQuery<MenuItem[]>({
    queryKey: ['menu', tenantId],
    queryFn: () => tenantApi.getMenu(tenantId),
    enabled: !!tenantId,
  });
  const { data: categories = [] } = useQuery<MenuCategory[]>({
    queryKey: ['menu-categories', tenantId],
    queryFn: () => tenantApi.listCategories(tenantId),
    enabled: !!tenantId,
  });
  const currentSelectedIds = useMemo(() => validSelectedIds(selected, items), [selected, items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Items tab is the curated menu view:
    //  - manual items (no Square link) always show, regardless of availability
    //    so operators can re-enable something they temporarily turned off.
    //  - Square-synced items only show when they're enabled — disabled ones
    //    live in the Import tab awaiting re-review.
    //  - "Show disabled" checkbox bypasses this so operators can still audit
    //    everything if they want.
    const isCurated = (i: MenuItem) => i.isAvailable || !(i.squareCatalogId ?? i.posCatalogId);
    return items
      .filter((i) => !i.requiresBooking)
      .filter((i) => showDisabled || isCurated(i))
      .filter((i) => !filterCategoryId || i.categoryId === filterCategoryId)
      .filter(
        (i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          (i.aliases ?? []).some((a) => a.toLowerCase().includes(q)) ||
          (i.description ?? '').toLowerCase().includes(q)
      );
  }, [items, search, filterCategoryId, showDisabled]);

  const toggleMutation = useMutation({
    mutationFn: ({ item, isAvailable }: { item: MenuItem; isAvailable: boolean }) =>
      tenantApi.upsertMenuItem(tenantId, {
        id: item.id,
        name: item.name,
        aliases: item.aliases ?? [],
        description: item.description ?? undefined,
        price: Number(item.price),
        categoryId: item.categoryId,
        imageUrl: item.imageUrl ?? undefined,
        isAvailable,
        duration: item.duration ?? null,
        requiresBooking: item.requiresBooking ?? false,
        priceMin: item.priceMin ?? null,
        priceMax: item.priceMax ?? null,
        quoteRequired: item.quoteRequired ?? false,
        emergencyEligible: item.emergencyEligible ?? false,
        serviceArea: item.serviceArea ?? null,
        intakeQuestions: item.intakeQuestions ?? [],
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu', tenantId] }),
    onError: (error) => toast.error(menuMutationError(error, 'Failed to update')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tenantApi.deleteMenuItem(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['menu-categories', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['option-groups', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['options', tenantId] });
      toast.success('Item deleted');
    },
    onError: (error) => toast.error(menuMutationError(error, 'Failed to delete')),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, isAvailable }: { ids: string[]; isAvailable: boolean }) =>
      tenantApi.bulkSetItemAvailability(tenantId, ids, isAvailable),
    onSuccess: async ({ count }: { count: number }, variables) => {
      if (count !== variables.ids.length) {
        await queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
        toast.error(
          `Only ${count} of ${variables.ids.length} selected items were updated. Refresh and try again.`
        );
        return;
      }
      const updatedIds = new Set(variables.ids);
      queryClient.setQueryData<MenuItem[]>(['menu', tenantId], (current = []) =>
        current.map((item) =>
          updatedIds.has(item.id) ? { ...item, isAvailable: variables.isAvailable } : item
        )
      );
      await queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      setSelected(new Set());
      toast.success(
        `${count} ${count === 1 ? noun.toLowerCase() : `${noun.toLowerCase()}s`} updated`
      );
    },
    onError: async (error) => {
      await queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.error(menuMutationError(error, 'Bulk update failed'));
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => tenantApi.bulkDeleteMenuItems(tenantId, ids),
    onSuccess: async ({ count }: { count: number }, ids) => {
      if (count !== ids.length) {
        await queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
        toast.error(
          `Only ${count} of ${ids.length} selected items were deleted. Refresh and try again.`
        );
        return;
      }
      const deletedIds = new Set(ids);
      queryClient.setQueryData<MenuItem[]>(['menu', tenantId], (current = []) =>
        current.filter((item) => !deletedIds.has(item.id))
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['menu', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['menu-categories', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['option-groups', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['options', tenantId] }),
      ]);
      setSelected(new Set());
      toast.success(
        `${count} ${count === 1 ? noun.toLowerCase() : `${noun.toLowerCase()}s`} deleted`
      );
    },
    onError: async (error) => {
      await queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.error(menuMutationError(error, 'Bulk delete failed'));
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => tenantApi.reorderMenuItems(tenantId, ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success(`${noun} order saved`);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.error(`Failed to save ${noun.toLowerCase()} order`);
    },
  });

  const bulkBusy = bulkMutation.isPending || bulkDeleteMutation.isPending;
  const actionBusy =
    bulkBusy || toggleMutation.isPending || deleteMutation.isPending || reorderMutation.isPending;
  const canReorder = Boolean(filterCategoryId) && showDisabled && search.trim() === '' && !bulkBusy;

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault();
    if (!canReorder || !draggedId || draggedId === targetId || reorderMutation.isPending) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const nextVisibleIds = moveIdToPosition(
      filtered.map((item) => item.id),
      draggedId,
      targetId
    );
    const nextAllIds = mergeOrderedSubset(
      items.map((item) => item.id),
      nextVisibleIds
    );
    const byId = new Map(items.map((item) => [item.id, item]));
    queryClient.setQueryData<MenuItem[]>(
      ['menu', tenantId],
      nextAllIds.map((id) => byId.get(id)).filter((item): item is MenuItem => !!item)
    );
    reorderMutation.mutate(nextVisibleIds);
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

  const allVisibleSelected = filtered.length > 0 && filtered.every((item) => selected.has(item.id));
  const toggleAllVisible = () => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (allVisibleSelected) filtered.forEach((item) => next.delete(item.id));
      else filtered.forEach((item) => next.add(item.id));
      return next;
    });
  };

  const showForm = creating || !!editing;

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`Search ${noun.toLowerCase()}s…`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelected(new Set());
            }}
            disabled={bulkBusy}
            className="pl-9"
          />
        </div>
        <select
          value={filterCategoryId}
          onChange={(e) => {
            const nextCategoryId = e.target.value;
            setFilterCategoryId(nextCategoryId);
            setSelected(new Set());
            // Category counts include both curated and staged POS items. When
            // an operator intentionally filters to a category, reveal all of
            // its rows so a category such as "Lumpia Bowls (12)" does not
            // misleadingly render an empty table just because all 12 are
            // waiting for review. Returning to All categories restores the
            // normal curated-only Items view.
            setShowDisabled(Boolean(nextCategoryId));
          }}
          disabled={bulkBusy}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.itemCount})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
          <input
            type="checkbox"
            checked={showDisabled}
            onChange={(e) => {
              setShowDisabled(e.target.checked);
              setSelected(new Set());
            }}
            disabled={bulkBusy}
            className="h-4 w-4"
          />
          Show disabled
        </label>
        <div className="flex-1" />
        <Button
          onClick={() => {
            setEditing(null);
            setCreating(true);
          }}
          disabled={actionBusy}
        >
          <Plus className="h-4 w-4 mr-1" /> Create {noun}
        </Button>
      </div>

      {showForm && (
        <ItemForm
          tenantId={tenantId}
          item={editing}
          categories={categories}
          noun={noun}
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
        onDelete={() => {
          const count = currentSelectedIds.length;
          if (
            confirm(
              `Permanently delete ${count} selected ${count === 1 ? noun.toLowerCase() : `${noun.toLowerCase()}s`}? This cannot be undone. Items linked to your POS may return the next time you pull its menu.`
            )
          ) {
            bulkDeleteMutation.mutate(currentSelectedIds);
          }
        }}
        onClear={() => setSelected(new Set())}
        busy={actionBusy}
      />

      {!canReorder && (
        <p className="mb-3 text-xs text-muted-foreground">
          Select a category and clear search to drag {noun.toLowerCase()}s into order.
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 border-b px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="w-4" aria-hidden="true" />
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                disabled={filtered.length === 0 || bulkBusy}
                aria-label={`Select all visible ${noun.toLowerCase()}s`}
                className="h-4 w-4"
              />
            </div>
            <div>{noun}</div>
            <div>Price</div>
            <div>Available</div>
            <div>Actions</div>
          </div>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No {noun.toLowerCase()}s match.
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                onDragOver={(event) => {
                  if (!canReorder) return;
                  event.preventDefault();
                  if (draggedId && draggedId !== item.id) setDragOverId(item.id);
                }}
                onDragLeave={() =>
                  setDragOverId((current) => (current === item.id ? null : current))
                }
                onDrop={(event) => handleDrop(event, item.id)}
                className={`grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-muted/40 ${dragOverId === item.id ? 'border-t-2 border-t-primary bg-primary/5' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    draggable={canReorder && !reorderMutation.isPending}
                    onDragStart={(event) => {
                      if (!canReorder) return;
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', item.id);
                      setDraggedId(item.id);
                    }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDragOverId(null);
                    }}
                    className="text-muted-foreground hover:text-foreground enabled:cursor-grab enabled:active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={`Drag ${item.name} to reorder`}
                    title={canReorder ? 'Drag to reorder' : 'Select a category to reorder'}
                    disabled={!canReorder || reorderMutation.isPending}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    disabled={bulkBusy}
                    className="h-4 w-4"
                  />
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{item.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                    {item.categoryRef?.name || item.category ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {item.categoryRef?.name ?? item.category}
                      </Badge>
                    ) : null}
                    {(item.modifierGroups ?? []).map((g) => (
                      <Badge key={g.id} variant="outline" className="text-[10px]">
                        {g.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="text-sm whitespace-nowrap">${Number(item.price).toFixed(2)}</div>
                <Switch
                  checked={item.isAvailable}
                  onCheckedChange={(v) => toggleMutation.mutate({ item, isAvailable: v })}
                  disabled={actionBusy}
                />
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setCreating(false);
                      setEditing(item);
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
                      if (confirm(`Delete "${item.name}"?`)) deleteMutation.mutate(item.id);
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
