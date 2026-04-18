'use client';

import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export function BulkActionBar({
  count,
  onEnable,
  onDisable,
  onClear,
  busy,
}: {
  count: number;
  onEnable: () => void;
  onDisable: () => void;
  onClear: () => void;
  busy?: boolean;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-md border bg-primary/5 px-4 py-2 mb-4">
      <span className="text-sm font-medium">{count} selected</span>
      <div className="flex-1" />
      <Button size="sm" variant="outline" onClick={onEnable} disabled={busy}>
        Enable
      </Button>
      <Button size="sm" variant="outline" onClick={onDisable} disabled={busy}>
        Disable
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear} disabled={busy} aria-label="Clear selection">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
