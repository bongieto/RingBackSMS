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
import type { Modifier, ModifierGroup } from './types';

export function OptionForm({
  tenantId,
  option,
  groups,
  onClose,
}: {
  tenantId: string;
  option: Modifier | null;
  groups: ModifierGroup[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [groupId, setGroupId] = useState(option?.groupId ?? (groups[0]?.id ?? ''));
  const [name, setName] = useState(option?.name ?? '');
  const [priceAdjust, setPriceAdjust] = useState(String(option?.priceAdjust ?? 0));
  const [isDefault, setIsDefault] = useState(option?.isDefault ?? false);

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name,
        priceAdjust: Number(priceAdjust) || 0,
        isDefault,
      };
      if (option) return tenantApi.updateOption(tenantId, option.id, body);
      return tenantApi.createOption(tenantId, { ...body, groupId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['options', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success(option ? 'Option updated' : 'Option created');
      onClose();
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error ?? 'Save failed'),
  });

  const canSave = name.trim().length > 0 && (option || groupId);

  return (
    <Card className="mb-4 bg-orange-50/60">
      <CardContent className="p-6 space-y-5">
        <h3 className="font-semibold">{option ? 'Edit option' : 'New option'}</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="opt-name">
              Option name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="opt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mild, Extra Cheese"
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="opt-price">Price add-on (USD)</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                id="opt-price"
                type="number"
                step="0.01"
                value={priceAdjust}
                onChange={(e) => setPriceAdjust(e.target.value)}
                placeholder="0.00"
                className="pl-7"
              />
            </div>
          </div>
        </div>

        {!option && (
          <div>
            <Label htmlFor="opt-group">
              Option group <span className="text-destructive">*</span>
            </Label>
            <select
              id="opt-group"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm mt-1"
            >
              <option value="">Select a group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <Label>Default selection</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pre-selected when the customer opens the group.
            </p>
          </div>
          <Switch checked={isDefault} onCheckedChange={setIsDefault} />
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending || !canSave}>
            {save.isPending ? 'Saving…' : option ? 'Save' : 'Add option'}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
