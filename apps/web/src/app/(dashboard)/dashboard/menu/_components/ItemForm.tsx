'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { tenantApi } from '@/lib/api';
import type { MenuCategory, MenuItem } from './types';

export function ItemForm({
  tenantId,
  item,
  categories,
  onClose,
}: {
  tenantId: string;
  item: MenuItem | null;
  categories: MenuCategory[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item?.price != null ? String(item.price) : '');
  const [categoryId, setCategoryId] = useState<string>(item?.categoryId ?? '');
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '');
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true);

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name,
        description: description || undefined,
        price: Number(price),
        categoryId: categoryId || null,
        imageUrl: imageUrl || null,
        isAvailable,
      };
      if (item) body.id = item.id;
      return tenantApi.upsertMenuItem(tenantId, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success(item ? 'Item updated' : 'Item created');
      onClose();
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error ?? 'Save failed'),
  });

  const priceValid = price !== '' && !Number.isNaN(Number(price)) && Number(price) >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between border-b px-4 py-3 sticky top-0 bg-white z-10">
          <h3 className="font-semibold">{item ? 'Edit item' : 'New item'}</h3>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-4 p-4">
          <div>
            <Label htmlFor="it-name">Name</Label>
            <Input id="it-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label htmlFor="it-desc">Description</Label>
            <Input id="it-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="it-price">Price (USD)</Label>
              <Input
                id="it-price"
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="it-cat">Category</Label>
              <select
                id="it-cat"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="it-img">Image URL (optional)</Label>
            <Input
              id="it-img"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Available</Label>
            <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
          </div>
          {item && (item.modifierGroups?.length ?? 0) > 0 && (
            <div className="border-t pt-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Option groups
              </div>
              <div className="flex flex-wrap gap-2">
                {item.modifierGroups!.map((g) => (
                  <span
                    key={g.id}
                    className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {g.name} ({g.modifiers?.length ?? 0})
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Manage option groups in the Option groups tab.
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3 sticky bottom-0 bg-white z-10">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !name.trim() || !priceValid}
          >
            {save.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
