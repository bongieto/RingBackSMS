'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { tenantApi } from '@/lib/api';
import { BulkActionBar } from './BulkActionBar';
import { ItemForm } from './ItemForm';
import type { MenuCategory, MenuItem } from './types';

export function ItemsTab({ tenantId, noun = 'Item' }: { tenantId: string; noun?: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('');
  const [showDisabled, setShowDisabled] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Items tab is the curated menu view:
    //  - manual items (no Square link) always show, regardless of availability
    //    so operators can re-enable something they temporarily turned off.
    //  - Square-synced items only show when they're enabled — disabled ones
    //    live in the Import tab awaiting re-review.
    //  - "Show disabled" checkbox bypasses this so operators can still audit
    //    everything if they want.
    const isCurated = (i: MenuItem) =>
      i.isAvailable || !(i.squareCatalogId ?? i.posCatalogId);
    return items
      .filter((i) => !i.requiresBooking)
      .filter((i) => showDisabled || isCurated(i))
      .filter((i) => !filterCategoryId || i.categoryId === filterCategoryId)
      .filter((i) =>
        !q ||
        i.name.toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q),
      );
  }, [items, search, filterCategoryId, showDisabled]);

  const toggleMutation = useMutation({
    mutationFn: ({ item, isAvailable }: { item: MenuItem; isAvailable: boolean }) =>
      tenantApi.upsertMenuItem(tenantId, {
        id: item.id,
        name: item.name,
        description: item.description ?? undefined,
        price: Number(item.price),
        categoryId: item.categoryId,
        imageUrl: item.imageUrl ?? undefined,
        isAvailable,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu', tenantId] }),
    onError: () => toast.error('Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tenantApi.deleteMenuItem(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success('Item deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, isAvailable }: { ids: string[]; isAvailable: boolean }) =>
      tenantApi.bulkSetItemAvailability(tenantId, ids, isAvailable),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      setSelected(new Set());
      toast.success('Bulk update applied');
    },
    onError: () => toast.error('Bulk update failed'),
  });

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
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={`Search ${noun.toLowerCase()}s…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={filterCategoryId}
          onChange={(e) => setFilterCategoryId(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap">
          <input
            type="checkbox"
            checked={showDisabled}
            onChange={(e) => setShowDisabled(e.target.checked)}
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
        count={selected.size}
        onEnable={() => bulkMutation.mutate({ ids: [...selected], isAvailable: true })}
        onDisable={() => bulkMutation.mutate({ ids: [...selected], isAvailable: false })}
        onClear={() => setSelected(new Set())}
        busy={bulkMutation.isPending}
      />

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 border-b px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <div />
            <div>{noun}</div>
            <div>Price</div>
            <div>Available</div>
            <div>Actions</div>
          </div>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No {noun.toLowerCase()}s match.</div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggleSelect(item.id)}
                  className="h-4 w-4"
                />
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
                />
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setCreating(false);
                      setEditing(item);
                    }}
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
