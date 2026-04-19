'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X, Search, Ban, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { tenantApi } from '@/lib/api';

interface MenuItem {
  id: string;
  name: string;
  category: string | null;
  price: number;
  isAvailable: boolean;
  requiresBooking?: boolean;
}

/**
 * "86 it" — industry slang for marking a menu item sold-out. Food trucks
 * run out of prep during rushes; staff needs to hide items in 1-2 taps
 * without leaving the KDS. This drawer is that shortcut.
 *
 * Shows ALL items (available + already-86'd) with search. Tapping
 * toggles availability. No confirmation dialog — kitchen workflow
 * prizes speed; accidental taps flip back in one tap.
 */
export function EightySixDrawer({
  tenantId,
  open,
  onClose,
}: {
  tenantId: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: items = [] } = useQuery<MenuItem[]>({
    queryKey: ['menu', tenantId],
    queryFn: () => tenantApi.getMenu(tenantId),
    enabled: !!tenantId && open,
  });

  const toggle = useMutation({
    mutationFn: async ({ id, isAvailable }: { id: string; isAvailable: boolean }) => {
      if (!tenantId) throw new Error('tenantId missing');
      const res = await tenantApi.bulkSetItemAvailability(tenantId, [id], isAvailable);
      // updateMany returns { count }. If 0 rows changed it means either
      // the id doesn't belong to this tenant (wrong cache) or someone
      // already flipped it. Surface this so we don't mislead staff.
      if (res && typeof res === 'object' && 'count' in res && (res as { count: number }).count === 0) {
        throw new Error('No rows updated — item may have been removed. Refreshing.');
      }
      return res;
    },
    onMutate: async ({ id, isAvailable }) => {
      // Optimistic — kitchen staff shouldn't feel any lag
      await queryClient.cancelQueries({ queryKey: ['menu', tenantId] });
      const prev = queryClient.getQueryData<MenuItem[]>(['menu', tenantId]);
      queryClient.setQueryData<MenuItem[]>(['menu', tenantId], (old = []) =>
        old.map((i) => (i.id === id ? { ...i, isAvailable } : i)),
      );
      return { prev };
    },
    onError: (err: unknown, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['menu', tenantId], ctx.prev);
      // Surface the real error — "Failed to update" without detail is
      // exactly how this bug hid in plain sight before.
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to update';
      toast.error(msg);
    },
    onSuccess: (_data, { isAvailable }) => {
      toast.success(isAvailable ? 'Brought back' : '86\'d');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => !i.requiresBooking)
      .filter((i) => !q || i.name.toLowerCase().includes(q) || (i.category ?? '').toLowerCase().includes(q));
  }, [items, search]);

  // Sort available first, then 86'd, within each alphabetically — lets
  // the rare "re-enable" case stay one glance away at the bottom.
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [filtered],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="fixed inset-0 bg-black/40"
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-md bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b px-4 py-3 shrink-0">
          <div>
            <h2 className="font-semibold text-lg">86 an item</h2>
            <p className="text-xs text-muted-foreground">Ran out? Tap to hide from customers.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </header>

        <div className="px-4 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {sorted.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No items match.
            </div>
          ) : (
            <ul className="divide-y">
              {sorted.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40"
                >
                  <div className="flex-1 min-w-0">
                    <div
                      className={`font-medium ${item.isAvailable ? '' : 'line-through text-muted-foreground'}`}
                    >
                      {item.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.category ?? 'Uncategorized'} · ${Number(item.price).toFixed(2)}
                    </div>
                  </div>
                  {item.isAvailable ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => toggle.mutate({ id: item.id, isAvailable: false })}
                      disabled={toggle.isPending}
                    >
                      <Ban className="h-4 w-4 mr-1.5" /> 86
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => toggle.mutate({ id: item.id, isAvailable: true })}
                      disabled={toggle.isPending}
                    >
                      <RotateCcw className="h-4 w-4 mr-1.5" /> Bring back
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
