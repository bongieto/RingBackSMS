'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { tenantApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { MenuItem, ModifierGroup } from './types';

type SelectionType = 'SINGLE' | 'MULTIPLE' | 'QUANTITY' | 'PIZZA' | 'MIXED';

const SELECTION_TYPES: Array<{
  value: SelectionType;
  title: string;
  subtitle: string;
  supported: boolean;
}> = [
  { value: 'SINGLE', title: 'Single', subtitle: 'Select one option', supported: true },
  { value: 'MULTIPLE', title: 'Multiple', subtitle: 'Select more than one', supported: true },
  { value: 'QUANTITY', title: 'Quantity', subtitle: 'Select the amount', supported: false },
  { value: 'PIZZA', title: 'Pizza', subtitle: 'Select half or whole', supported: false },
  { value: 'MIXED', title: 'Mixed', subtitle: 'Various option selections', supported: false },
];

/**
 * Inline expanding form for creating/editing an option group. Renders as a
 * Card the parent tab mounts above the list (no modal overlay).
 */
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
    enabled: !!tenantId && !group,
  });

  const [menuItemId, setMenuItemId] = useState(group?.menuItemId ?? '');
  const [name, setName] = useState(group?.name ?? '');
  const [selectionType, setSelectionType] = useState<SelectionType>(
    (group?.selectionType as SelectionType) ?? 'SINGLE',
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
    <Card className="mb-4 bg-orange-50/60">
      <CardContent className="p-6 space-y-5">
        <h3 className="font-semibold">{group ? 'Edit option group' : 'New option group'}</h3>

        {!group && (
          <div>
            <Label htmlFor="og-item">
              Attach to item <span className="text-destructive">*</span>
            </Label>
            <select
              id="og-item"
              value={menuItemId}
              onChange={(e) => setMenuItemId(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm mt-1"
            >
              <option value="">Select an item…</option>
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
          <Label htmlFor="og-name">Group name</Label>
          <Input
            id="og-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Add-ons, Protein choice, Size"
            className="mt-1"
            autoFocus
          />
        </div>

        <div>
          <Label>Selection type</Label>
          <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3">
            {SELECTION_TYPES.map((t) => {
              const active = selectionType === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setSelectionType(t.value)}
                  className={cn(
                    'rounded-md border px-4 py-3 text-left transition-colors',
                    active
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'bg-background hover:border-foreground/30',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn('font-medium text-sm', active && 'text-primary')}>
                      {t.title}
                    </span>
                    {!t.supported && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        SMS: coming soon
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t.subtitle}</div>
                </button>
              );
            })}
          </div>
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
              className="mt-1"
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
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Label>Required</Label>
          <Switch checked={required} onCheckedChange={setRequired} />
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending || !canSave}>
            {save.isPending ? 'Saving…' : group ? 'Save' : 'Create'}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
