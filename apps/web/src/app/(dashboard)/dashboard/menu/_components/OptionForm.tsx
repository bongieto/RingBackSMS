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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold">{option ? 'Edit option' : 'New option'}</h3>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-4 p-4">
          {!option && (
            <div>
              <Label htmlFor="opt-group">Group</Label>
              <select
                id="opt-group"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label htmlFor="opt-name">Name</Label>
            <Input
              id="opt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Spicy"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="opt-price">Price adjust (USD)</Label>
            <Input
              id="opt-price"
              type="number"
              step="0.01"
              value={priceAdjust}
              onChange={(e) => setPriceAdjust(e.target.value)}
              placeholder="0.00"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use negative values for discounts (e.g. &quot;No cheese&quot; → -0.50).
            </p>
          </div>
          <div className="flex items-center justify-between">
            <Label>Default selection</Label>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !canSave}>
            {save.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}
