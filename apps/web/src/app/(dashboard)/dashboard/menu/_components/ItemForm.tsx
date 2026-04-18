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
import type { MenuCategory, MenuItem } from './types';
import { InlineOptionGroups } from './InlineOptionGroups';

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
    <Card className="mb-4 bg-orange-50/60">
      <CardContent className="p-6 space-y-5">
        <h3 className="font-semibold">{item ? 'Edit item' : 'New item'}</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="it-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="it-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="it-price">
              Price (USD) <span className="text-destructive">*</span>
            </Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                id="it-price"
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="pl-7"
              />
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="it-desc">Description</Label>
          <Input
            id="it-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="it-cat">Category</Label>
            <select
              id="it-cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm mt-1"
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="it-img">Image URL</Label>
            <Input
              id="it-img"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
          <Label>Available</Label>
          <Switch checked={isAvailable} onCheckedChange={setIsAvailable} />
        </div>

        {item && (
          <InlineOptionGroups
            tenantId={tenantId}
            itemId={item.id}
            groups={item.modifierGroups ?? []}
          />
        )}
        {!item && (
          <p className="text-xs text-muted-foreground italic">
            Save the item first to add option groups (Fries Flavor, Size, etc.).
          </p>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !name.trim() || !priceValid}
          >
            {save.isPending ? 'Saving…' : item ? 'Save' : 'Create'}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
