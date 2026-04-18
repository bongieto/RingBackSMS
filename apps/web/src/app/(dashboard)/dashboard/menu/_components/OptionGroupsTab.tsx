'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { tenantApi } from '@/lib/api';
import { OptionGroupForm } from './OptionGroupForm';
import type { ModifierGroup } from './types';

export function OptionGroupsTab({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ModifierGroup | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: groups = [] } = useQuery<ModifierGroup[]>({
    queryKey: ['option-groups', tenantId],
    queryFn: () => tenantApi.listOptionGroups(tenantId),
    enabled: !!tenantId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tenantApi.deleteOptionGroup(tenantId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['option-groups', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['menu', tenantId] });
      toast.success('Option group deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" /> Create Option Group
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {groups.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No option groups yet. Create one and attach it to a menu item.
            </div>
          ) : (
            groups.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-muted/40"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{g.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {g.optionCount ?? 0} option{g.optionCount === 1 ? '' : 's'} · {g.selectionType === 'SINGLE' ? 'Single' : 'Multiple'}
                    {g.required ? ' · Required' : ''}
                    {g.menuItemName ? ` · on ${g.menuItemName}` : ''}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditing(g)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (confirm(`Delete "${g.name}" and all its options?`)) {
                      deleteMutation.mutate(g.id);
                    }
                  }}
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <OptionGroupForm
          tenantId={tenantId}
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
