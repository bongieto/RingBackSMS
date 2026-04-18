'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { tenantApi } from '@/lib/api';
import { BulkActionBar } from './BulkActionBar';
import { CategoryForm } from './CategoryForm';
import type { MenuCategory } from './types';

export function CategoriesTab({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<MenuCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: categories = [] } = useQuery<MenuCategory[]>({
    queryKey: ['menu-categories', tenantId],
    queryFn: () => tenantApi.listCategories(tenantId),
    enabled: !!tenantId,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      tenantApi.updateCategory(tenantId, id, { isAvailable, name: categories.find((c) => c.id === id)?.name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-categories', tenantId] }),
    onError: () => toast.error('Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tenantApi.deleteCategory(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-categories', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success('Category deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, isAvailable }: { ids: string[]; isAvailable: boolean }) =>
      tenantApi.bulkSetCategoryAvailability(tenantId, ids, isAvailable),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-categories', tenantId] });
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
      <div className="flex justify-end mb-4">
        <Button
          onClick={() => {
            setEditing(null);
            setCreating(true);
          }}
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
                className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggleSelect(c.id)}
                  className="h-4 w-4"
                />
                <div className="font-medium">{c.name}</div>
                <div className="text-sm text-muted-foreground">{c.itemCount}</div>
                <Switch
                  checked={c.isAvailable}
                  onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, isAvailable: v })}
                />
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setCreating(false);
                      setEditing(c);
                    }}
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(`Delete category "${c.name}"? Items in it will become uncategorized.`)) {
                        deleteMutation.mutate(c.id);
                      }
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
