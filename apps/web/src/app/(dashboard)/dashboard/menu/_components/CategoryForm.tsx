'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { tenantApi } from '@/lib/api';
import type { MenuCategory } from './types';

export function CategoryForm({
  tenantId,
  category,
  onClose,
}: {
  tenantId: string;
  category: MenuCategory | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(category?.name ?? '');
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [isAvailable, setIsAvailable] = useState(category?.isAvailable ?? true);

  const save = useMutation({
    mutationFn: async () => {
      const body = { name, sortOrder: Number(sortOrder) || 0, isAvailable };
      if (category) return tenantApi.updateCategory(tenantId, category.id, body);
      return tenantApi.createCategory(tenantId, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-categories', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success(category ? 'Category updated' : 'Category created');
      onClose();
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error ?? 'Save failed'),
  });

  return (
    <Card className="mb-4 bg-orange-50/60">
      <CardContent className="p-6 space-y-5">
        <h3 className="font-semibold">{category ? 'Edit category' : 'New category'}</h3>

        <div>
          <Label htmlFor="cat-name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Appetizers, Drinks"
            className="mt-1"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cat-sort">Sort order</Label>
            <Input
              id="cat-sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              placeholder="0"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Lower numbers appear first.</p>
          </div>
          <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
            <Label>Available</Label>
            <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !name.trim()}
          >
            {save.isPending ? 'Saving…' : category ? 'Save' : 'Create'}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
