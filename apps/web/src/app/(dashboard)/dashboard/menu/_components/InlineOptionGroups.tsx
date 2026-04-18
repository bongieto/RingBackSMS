'use client';

/**
 * InlineOptionGroups — renders inside ItemForm, lists this item's option
 * groups and lets the operator create / edit / delete them + their
 * options without leaving the item edit screen.
 *
 * Why a separate component: OptionGroupsTab is a top-level list view
 * keyed by "all tenant groups". Here we're scoped to one item, which
 * changes defaults (menuItemId is pre-filled, no item picker) and
 * affords a richer nested-options editor in the same panel.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { tenantApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Modifier, ModifierGroup } from './types';

type SelectionType = 'SINGLE' | 'MULTIPLE' | 'QUANTITY' | 'PIZZA' | 'MIXED';

const SELECTION_TYPES: Array<{ value: SelectionType; label: string; supported: boolean }> = [
  { value: 'SINGLE', label: 'Single', supported: true },
  { value: 'MULTIPLE', label: 'Multiple', supported: true },
  { value: 'QUANTITY', label: 'Quantity', supported: false },
  { value: 'PIZZA', label: 'Pizza', supported: false },
  { value: 'MIXED', label: 'Mixed', supported: false },
];

interface OptionDraft {
  id?: string;            // existing Modifier id
  tempId: string;         // stable React key during editing
  name: string;
  priceAdjust: string;    // kept as string for the input
  isDefault: boolean;
}

function toDraft(m: Modifier): OptionDraft {
  return {
    id: m.id,
    tempId: m.id,
    name: m.name,
    priceAdjust: String(Number(m.priceAdjust)),
    isDefault: m.isDefault,
  };
}

function newDraft(): OptionDraft {
  return {
    tempId: `new-${Math.random().toString(36).slice(2, 9)}`,
    name: '',
    priceAdjust: '0',
    isDefault: false,
  };
}

export function InlineOptionGroups({
  tenantId,
  itemId,
  groups,
}: {
  tenantId: string;
  itemId: string;
  groups: ModifierGroup[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ModifierGroup | null>(null);
  const [creating, setCreating] = useState(false);

  const showCreate = creating && !editing;
  const showEdit = !!editing;

  return (
    <div className="border-t pt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <Label>Option groups</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            e.g. &quot;Fries Flavor&quot; with Cheese / BBQ / Plain
          </p>
        </div>
        {!showCreate && !showEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(null);
              setCreating(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Add option group
          </Button>
        )}
      </div>

      {/* Existing groups */}
      {groups.length === 0 && !showCreate && !showEdit && (
        <p className="text-xs text-muted-foreground">No option groups yet.</p>
      )}
      {groups.length > 0 && !showEdit && (
        <div className="space-y-1 mb-3">
          {groups.map((g) => (
            <GroupRow
              key={g.id}
              group={g}
              tenantId={tenantId}
              expanded={expandedId === g.id}
              onToggle={() => setExpandedId(expandedId === g.id ? null : g.id)}
              onEdit={() => {
                setCreating(false);
                setEditing(g);
              }}
            />
          ))}
        </div>
      )}

      {/* Create / edit sub-form */}
      {(showCreate || showEdit) && (
        <GroupEditor
          tenantId={tenantId}
          itemId={itemId}
          group={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ── Single-row display of an existing group + expandable option list ─────

function GroupRow({
  group,
  tenantId,
  expanded,
  onToggle,
  onEdit,
}: {
  group: ModifierGroup;
  tenantId: string;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const deleteGroup = useMutation({
    mutationFn: () => tenantApi.deleteOptionGroup(tenantId, group.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['option-groups', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success('Option group deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  return (
    <div className="rounded-md border bg-background">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="flex-1 text-sm">
          <span className="font-medium">{group.name}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {group.modifiers?.length ?? group.optionCount ?? 0} options · {group.selectionType === 'MULTIPLE' ? 'Multiple' : group.selectionType === 'SINGLE' ? 'Single' : group.selectionType}
            {group.required ? ' · Required' : ''}
          </span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            if (confirm(`Delete option group "${group.name}" and all its options?`)) {
              deleteGroup.mutate();
            }
          }}
          aria-label="Delete group"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      {expanded && (
        <div className="border-t px-3 py-2 bg-muted/30">
          {(group.modifiers ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No options. Click Edit to add some.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {group.modifiers!.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <span className="flex-1">{m.name}</span>
                  {m.isDefault && <span className="text-xs text-muted-foreground">Default</span>}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {Number(m.priceAdjust) > 0 ? '+' : ''}${Number(m.priceAdjust).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Inline create/edit editor for a group + its options ────────────────────

function GroupEditor({
  tenantId,
  itemId,
  group,
  onClose,
}: {
  tenantId: string;
  itemId: string;
  group: ModifierGroup | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(group?.name ?? '');
  const [selectionType, setSelectionType] = useState<SelectionType>(
    (group?.selectionType as SelectionType) ?? 'SINGLE',
  );
  const [required, setRequired] = useState(group?.required ?? false);
  const [minSelections, setMinSelections] = useState(String(group?.minSelections ?? 0));
  const [maxSelections, setMaxSelections] = useState(String(group?.maxSelections ?? 1));

  // Nested options — start from existing ones, seed one empty row when creating
  const [options, setOptions] = useState<OptionDraft[]>(() => {
    if (group?.modifiers && group.modifiers.length > 0) {
      return group.modifiers.map(toDraft);
    }
    return [newDraft()];
  });
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function updateOption(tempId: string, patch: Partial<OptionDraft>) {
    setOptions((prev) => prev.map((o) => (o.tempId === tempId ? { ...o, ...patch } : o)));
  }

  function removeOption(opt: OptionDraft) {
    setOptions((prev) => prev.filter((o) => o.tempId !== opt.tempId));
    if (opt.id) setDeletedIds((prev) => [...prev, opt.id!]);
  }

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Group name is required');
      return;
    }
    const validOptions = options.filter((o) => o.name.trim().length > 0);
    setSaving(true);
    try {
      // 1. Upsert the group
      const groupBody = {
        name: trimmedName,
        selectionType,
        required,
        minSelections: Number(minSelections) || 0,
        maxSelections: Number(maxSelections) || 1,
      };
      const saved = group
        ? await tenantApi.updateOptionGroup(tenantId, group.id, groupBody)
        : await tenantApi.createOptionGroup(tenantId, { ...groupBody, menuItemId: itemId });
      const groupId: string = (saved as { id: string }).id;

      // 2. Delete any removed options (best-effort parallel)
      await Promise.all(
        deletedIds.map((id) =>
          tenantApi.deleteOption(tenantId, id).catch((err: unknown) => {
            console.warn('Failed to delete option', err);
          }),
        ),
      );

      // 3. Upsert options (sequential to keep errors clean)
      for (const opt of validOptions) {
        const priceAdjust = Number(opt.priceAdjust) || 0;
        if (opt.id) {
          await tenantApi.updateOption(tenantId, opt.id, {
            name: opt.name.trim(),
            priceAdjust,
            isDefault: opt.isDefault,
          });
        } else {
          await tenantApi.createOption(tenantId, {
            groupId,
            name: opt.name.trim(),
            priceAdjust,
            isDefault: opt.isDefault,
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['option-groups', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['options', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success(group ? 'Option group updated' : 'Option group added');
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border bg-background p-4 space-y-4">
      <div className="text-sm font-semibold">
        {group ? 'Edit option group' : 'New option group'}
      </div>

      <div>
        <Label htmlFor="iog-name">
          Group name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="iog-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Fries Flavor, Size"
          className="mt-1"
          autoFocus
        />
      </div>

      <div>
        <Label>Selection type</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {SELECTION_TYPES.map((t) => {
            const active = selectionType === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setSelectionType(t.value)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'bg-background hover:border-foreground/30',
                )}
              >
                {t.label}
                {!t.supported && (
                  <span className="ml-1 text-[10px] text-muted-foreground">·soon</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 items-end">
        <div>
          <Label htmlFor="iog-min">Min</Label>
          <Input
            id="iog-min"
            type="number"
            min="0"
            value={minSelections}
            onChange={(e) => setMinSelections(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="iog-max">Max</Label>
          <Input
            id="iog-max"
            type="number"
            min="1"
            value={maxSelections}
            onChange={(e) => setMaxSelections(e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
          <Label className="text-sm">Required</Label>
          <Switch checked={required} onCheckedChange={setRequired} />
        </div>
      </div>

      {/* Options list */}
      <div className="border-t pt-3">
        <div className="flex items-center justify-between mb-2">
          <Label>Options</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOptions((prev) => [...prev, newDraft()])}
          >
            <Plus className="h-4 w-4 mr-1" /> Add option
          </Button>
        </div>
        {options.length === 0 ? (
          <p className="text-xs text-muted-foreground">Add at least one option.</p>
        ) : (
          <div className="space-y-2">
            {options.map((opt) => (
              <div key={opt.tempId} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                <Input
                  value={opt.name}
                  onChange={(e) => updateOption(opt.tempId, { name: e.target.value })}
                  placeholder="e.g. Cheese"
                />
                <div className="relative w-28">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    value={opt.priceAdjust}
                    onChange={(e) => updateOption(opt.tempId, { priceAdjust: e.target.value })}
                    placeholder="0.00"
                    className="pl-5"
                  />
                </div>
                <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={opt.isDefault}
                    onChange={(e) => updateOption(opt.tempId, { isDefault: e.target.checked })}
                  />
                  Default
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOption(opt)}
                  aria-label="Remove option"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="button" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : group ? 'Save group' : 'Create group'}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
