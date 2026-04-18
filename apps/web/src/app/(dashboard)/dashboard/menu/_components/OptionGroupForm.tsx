'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { tenantApi } from '@/lib/api';
import type { MenuItem, ModifierGroup } from './types';

export function OptionGroupForm({
  tenantId,
  group,
  onClose,
}: {
  tenantId: string;
  group: ModifierGroup | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: items = [] } = useQuery<MenuItem[]>({
    queryKey: ['menu', tenantId],
    queryFn: () => tenantApi.getMenu(tenantId),
    enabled: !!tenantId && !group, // only needed when creating
  });

  const [menuItemId, setMenuItemId] = useState(group?.menuItemId ?? '');
  const [name, setName] = useState(group?.name ?? '');
  const [selectionType, setSelectionType] = useState<'SINGLE' | 'MULTIPLE'>(
    (group?.selectionType as 'SINGLE' | 'MULTIPLE') ?? 'SINGLE',
  );
  const [required, setRequired] = useState(group?.required ?? false);
  const [minSelections, setMinSelections] = useState(String(group?.minSelections ?? 0));
  const [maxSelections, setMaxSelections] = useState(String(group?.maxSelections ?? 1));

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name,
        selectionType,
        required,
        minSelections: Number(minSelections) || 0,
        maxSelections: Number(maxSelections) || 1,
      };
      if (group) return tenantApi.updateOptionGroup(tenantId, group.id, body);
      return tenantApi.createOptionGroup(tenantId, { ...body, menuItemId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['option-groups', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success(group ? 'Option group updated' : 'Option group created');
      onClose();
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error ?? 'Save failed'),
  });

  const canSave = name.trim().length > 0 && (group || menuItemId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between border-b px-4 py-3 sticky top-0 bg-white z-10">
          <h3 className="font-semibold">{group ? 'Edit option group' : 'New option group'}</h3>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-4 p-4">
          {!group && (
            <div>
              <Label htmlFor="og-item">Attach to item</Label>
              <select
                id="og-item"
                value={menuItemId}
                onChange={(e) => setMenuItemId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select an item...</option>
                {items
                  .filter((i) => !i.requiresBooking)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div>
            <Label htmlFor="og-name">Name</Label>
            <Input
              id="og-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Spice level"
              autoFocus
            />
          </div>
          <div>
            <Label>Selection type</Label>
            <div className="flex gap-4 mt-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={selectionType === 'SINGLE'}
                  onChange={() => setSelectionType('SINGLE')}
                />
                Single
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={selectionType === 'MULTIPLE'}
                  onChange={() => setSelectionType('MULTIPLE')}
                />
                Multiple
              </label>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>Required</Label>
            <Switch checked={required} onCheckedChange={setRequired} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="og-min">Min selections</Label>
              <Input
                id="og-min"
                type="number"
                min="0"
                value={minSelections}
                onChange={(e) => setMinSelections(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="og-max">Max selections</Label>
              <Input
                id="og-max"
                type="number"
                min="1"
                value={maxSelections}
                onChange={(e) => setMaxSelections(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Manage this group&apos;s individual options in the Options tab.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3 sticky bottom-0 bg-white z-10">
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
