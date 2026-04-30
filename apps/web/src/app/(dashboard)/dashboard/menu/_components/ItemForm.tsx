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
  noun = 'item',
  onClose,
}: {
  tenantId: string;
  item: MenuItem | null;
  categories: MenuCategory[];
  noun?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(item?.name ?? '');
  const [aliases, setAliases] = useState((item?.aliases ?? []).join(', '));
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item?.price != null ? String(item.price) : '');
  const [priceMin, setPriceMin] = useState(item?.priceMin != null ? String(item.priceMin) : '');
  const [priceMax, setPriceMax] = useState(item?.priceMax != null ? String(item.priceMax) : '');
  const [categoryId, setCategoryId] = useState<string>(item?.categoryId ?? '');
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? '');
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true);
  const [duration, setDuration] = useState(item?.duration != null ? String(item.duration) : '');
  const [quoteRequired, setQuoteRequired] = useState(item?.quoteRequired ?? false);
  const [emergencyEligible, setEmergencyEligible] = useState(item?.emergencyEligible ?? false);
  const [serviceArea, setServiceArea] = useState(item?.serviceArea ?? '');
  const [intakeQuestions, setIntakeQuestions] = useState((item?.intakeQuestions ?? []).join('\n'));
  const showServiceFields = noun.toLowerCase().includes('service') || item?.requiresBooking;

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name,
        aliases: aliases
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        description: description || undefined,
        price: Number(price),
        priceMin: priceMin.trim() ? Number(priceMin) : null,
        priceMax: priceMax.trim() ? Number(priceMax) : null,
        categoryId: categoryId || null,
        imageUrl: imageUrl || null,
        isAvailable,
        duration: duration.trim() ? Number(duration) : null,
        quoteRequired,
        emergencyEligible,
        serviceArea: serviceArea.trim() || null,
        intakeQuestions: intakeQuestions
          .split('\n')
          .map((q) => q.trim())
          .filter(Boolean),
      };
      if (item) body.id = item.id;
      return tenantApi.upsertMenuItem(tenantId, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success(item ? `${noun} updated` : `${noun} created`);
      onClose();
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error ?? 'Save failed'),
  });

  const priceValid = price !== '' && !Number.isNaN(Number(price)) && Number(price) >= 0;

  return (
    <Card className="mb-4 bg-orange-50/60">
      <CardContent className="p-6 space-y-5">
        <h3 className="font-semibold">{item ? `Edit ${noun.toLowerCase()}` : `New ${noun.toLowerCase()}`}</h3>

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

        <div>
          <Label htmlFor="it-aliases">Customer names</Label>
          <Input
            id="it-aliases"
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder="egg rolls, pork rolls, regular lumpia"
            className="mt-1"
          />
        </div>

        {showServiceFields && (
          <div className="space-y-3 rounded-md border bg-background p-3">
            <div className="text-sm font-medium">Service details</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="it-duration">Duration (minutes)</Label>
                <Input
                  id="it-duration"
                  type="number"
                  min="1"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="it-price-min">Price min</Label>
                <Input
                  id="it-price-min"
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="it-price-max">Price max</Label>
                <Input
                  id="it-price-max"
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="it-service-area">Service area</Label>
              <Input
                id="it-service-area"
                value={serviceArea}
                onChange={(e) => setServiceArea(e.target.value)}
                placeholder="e.g. Chicago, Oak Park, within 20 miles"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="it-intake">Intake questions</Label>
              <textarea
                id="it-intake"
                value={intakeQuestions}
                onChange={(e) => setIntakeQuestions(e.target.value)}
                placeholder="One question per line"
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label>Quote required</Label>
                <Switch checked={quoteRequired} onCheckedChange={setQuoteRequired} />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label>Emergency eligible</Label>
                <Switch checked={emergencyEligible} onCheckedChange={setEmergencyEligible} />
              </div>
            </div>
          </div>
        )}

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
            {save.isPending ? 'Saving…' : item ? 'Save' : `Create ${noun}`}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
