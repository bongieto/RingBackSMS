'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { tenantApi } from '@/lib/api';
import type { MenuCategory, MenuItem } from './types';

/**
 * Import tab — staging ground for items pulled from the POS that the
 * operator hasn't explicitly added to their RingbackSMS menu yet.
 *
 * "Staged" means: squareCatalogId IS NOT NULL AND isAvailable = false.
 * (Operators add items in the Items tab by toggling availability; Pull
 * from POS creates new rows as disabled.)
 *
 * Actions:
 *   - Add to menu → bulkSetItemAvailability(ids, true). Items move to
 *     Items tab on next render.
 *   - Clear selection → purely UI.
 */
export function ImportTab({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: allItems = [] } = useQuery<MenuItem[]>({
    queryKey: ['menu', tenantId],
    queryFn: () => tenantApi.getMenu(tenantId),
    enabled: !!tenantId,
  });
  const { data: categories = [] } = useQuery<MenuCategory[]>({
    queryKey: ['menu-categories', tenantId],
    queryFn: () => tenantApi.listCategories(tenantId),
    enabled: !!tenantId,
  });

  // Staged = came from Square (has a posCatalogId / squareCatalogId) but
  // not yet added to the menu (isAvailable=false).
  const staged = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allItems
      .filter((i) => !i.requiresBooking)
      .filter((i) => !!(i.squareCatalogId ?? i.posCatalogId))
      .filter((i) => i.isAvailable === false)
      .filter((i) => !filterCategoryId || i.categoryId === filterCategoryId)
      .filter((i) =>
        !q ||
        i.name.toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q),
      );
  }, [allItems, search, filterCategoryId]);

  const addMutation = useMutation({
    mutationFn: (ids: string[]) => tenantApi.bulkSetItemAvailability(tenantId, ids, true),
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      setSelected(new Set());
      toast.success(`Added ${ids.length} item${ids.length === 1 ? '' : 's'} to your menu`);
    },
    onError: () => toast.error('Failed to add items'),
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(staged.map((i) => i.id)));

  return (
    <div>
      <Card className="mb-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
        <CardContent className="pt-4 pb-4 flex items-start gap-3">
          <Download className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-medium">Items pulled from your POS waiting for review</div>
            <p className="text-muted-foreground text-xs mt-1">
              These come from your Square catalog but aren&apos;t on your RingbackSMS menu yet. Select the ones you want customers to see and click <b>Add to menu</b>. Leave the rest alone — they won&apos;t show up anywhere.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search staged items..."
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
        <div className="flex-1" />
        {staged.length > 0 && selected.size < staged.length && (
          <Button variant="outline" size="sm" onClick={selectAll}>
            Select all ({staged.length})
          </Button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-primary/5 px-4 py-2 mb-4">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={() => addMutation.mutate([...selected])}
            disabled={addMutation.isPending}
          >
            {addMutation.isPending ? 'Adding…' : 'Add to menu'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <div />
            <div>Item</div>
            <div>Price</div>
          </div>
          {staged.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {allItems.some((i) => !!(i.squareCatalogId ?? i.posCatalogId)) ? (
                <>All POS items added. Pull from POS again to see any newly-added Square items here.</>
              ) : (
                <>No POS items yet. Connect Square from Integrations and click &quot;Pull from POS&quot; to bring in your catalog.</>
              )}
            </div>
          ) : (
            staged.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-muted/40"
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
                    {item.description && (
                      <span className="truncate text-[11px] text-muted-foreground/80">
                        {item.description}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-sm whitespace-nowrap">${Number(item.price).toFixed(2)}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
