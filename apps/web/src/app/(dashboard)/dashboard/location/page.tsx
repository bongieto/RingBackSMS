'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MapPin, Plus, Copy, Trash2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useTenantId } from '@/components/providers/TenantProvider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface Stop {
  id?: string;
  /** YYYY-MM-DD, tenant-local. */
  stopDate: string;
  locationName: string | null;
  address: string;
  openTime: string; // HH:mm
  closeTime: string; // HH:mm
  note: string | null;
  isActive: boolean;
  /** Local-only marker so React keys stay stable for unsaved rows. */
  _key: string;
}

interface ApiStop {
  id: string;
  stopDate: string;
  locationName: string | null;
  address: string;
  openTime: string;
  closeTime: string;
  note: string | null;
  isActive: boolean;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function newStop(stopDate: string, key: string): Stop {
  return {
    stopDate,
    locationName: '',
    address: '',
    openTime: '11:00',
    closeTime: '14:00',
    note: '',
    isActive: true,
    _key: key,
  };
}

function fromApi(s: ApiStop): Stop {
  return {
    id: s.id,
    stopDate: s.stopDate,
    locationName: s.locationName,
    address: s.address,
    openTime: s.openTime,
    closeTime: s.closeTime,
    note: s.note,
    isActive: s.isActive,
    _key: s.id,
  };
}

function formatPrettyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(dt);
}

export default function LocationPage() {
  const { tenantId } = useTenantId();
  const queryClient = useQueryClient();
  const [stops, setStops] = useState<Stop[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const hasHydrated = useRef(false);
  // Stable counter for new-row keys.
  const nextKey = useRef(0);
  const newKey = () => `new-${++nextKey.current}`;

  const { data, isLoading } = useQuery<{ stops: ApiStop[] }>({
    queryKey: ['food-truck-schedule', tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/food-truck-schedule`);
      if (!res.ok) throw new Error('Failed to load schedule');
      const json = await res.json();
      return json.data ?? json;
    },
    enabled: !!tenantId,
  });

  // One-shot hydration: seed local state from server only on first load.
  // Subsequent refetches won't clobber in-progress edits.
  useEffect(() => {
    if (hasHydrated.current || !data) return;
    setStops((data.stops ?? []).map(fromApi));
    hasHydrated.current = true;
  }, [data]);

  // Sort + group: past vs upcoming. Past is collapsed by default.
  const today = todayIso();
  const sorted = useMemo(
    () =>
      [...stops].sort((a, b) =>
        a.stopDate === b.stopDate
          ? a.openTime.localeCompare(b.openTime)
          : a.stopDate.localeCompare(b.stopDate),
      ),
    [stops],
  );
  const past = sorted.filter((s) => s.stopDate < today);
  const upcoming = sorted.filter((s) => s.stopDate >= today);

  const isDirty = useMemo(() => {
    if (!data) return false;
    const current = data.stops ?? [];
    if (current.length !== stops.length) return true;
    const byId = new Map(current.map((c) => [c.id, c]));
    return stops.some((s) => {
      if (!s.id) return true;
      const orig = byId.get(s.id);
      if (!orig) return true;
      return (
        orig.stopDate !== s.stopDate ||
        (orig.locationName ?? '') !== (s.locationName ?? '') ||
        orig.address !== s.address ||
        orig.openTime !== s.openTime ||
        orig.closeTime !== s.closeTime ||
        (orig.note ?? '') !== (s.note ?? '') ||
        orig.isActive !== s.isActive
      );
    });
  }, [stops, data]);

  // Warn before navigating away with unsaved edits.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('Tenant not loaded');
      const res = await fetch(`/api/tenants/${tenantId}/food-truck-schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stops: stops.map(({ _key, ...s }) => s),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? 'Save failed');
      }
      return json.data as { stops: ApiStop[] };
    },
    onSuccess: (data) => {
      // Reseed local state from the server response so new rows pick up
      // their persisted ids. The query cache is also updated so a later
      // remount won't drop edits.
      const next = data.stops.map(fromApi);
      setStops(next);
      queryClient.setQueryData(['food-truck-schedule', tenantId], { stops: data.stops });
      toast.success(`Saved ${data.stops.length} stop${data.stops.length === 1 ? '' : 's'}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const validateAndSave = () => {
    const errs: Record<string, string> = {};
    for (const s of stops) {
      if (!s.address.trim()) errs[s._key] = 'Address required';
      else if (!/^\d{2}:\d{2}$/.test(s.openTime)) errs[s._key] = 'Open time must be HH:mm';
      else if (!/^\d{2}:\d{2}$/.test(s.closeTime)) errs[s._key] = 'Close time must be HH:mm';
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error('Fix the highlighted rows before saving');
      return;
    }
    saveMutation.mutate();
  };

  const update = (key: string, patch: Partial<Stop>) => {
    setStops((rs) => rs.map((r) => (r._key === key ? { ...r, ...patch } : r)));
    if (errors[key]) {
      setErrors((e) => {
        const next = { ...e };
        delete next[key];
        return next;
      });
    }
  };

  const remove = (key: string) =>
    setStops((rs) => rs.filter((r) => r._key !== key));

  const addStop = () => {
    // Pick the next empty date — the latest existing date + 1, or today.
    const latest = sorted[sorted.length - 1];
    const startDate = latest && latest.stopDate >= today ? addDaysIso(latest.stopDate, 1) : today;
    setStops((rs) => [...rs, newStop(startDate, newKey())]);
  };

  const duplicateWeek = () => {
    // Take the last 7 days of upcoming stops and duplicate them +7 days.
    const window = upcoming.filter((s) => s.stopDate <= addDaysIso(today, 6));
    if (window.length === 0) {
      toast.error('Add at least one upcoming stop in the next 7 days first');
      return;
    }
    const copies = window.map((s) =>
      newStop(addDaysIso(s.stopDate, 7), newKey()),
    );
    // Pre-populate copies with existing values (other than dates and ids).
    const filled = copies.map((c, i) => ({
      ...c,
      locationName: window[i].locationName,
      address: window[i].address,
      openTime: window[i].openTime,
      closeTime: window[i].closeTime,
      note: window[i].note,
      isActive: window[i].isActive,
    }));
    setStops((rs) => [...rs, ...filled]);
    toast.success(`Added ${filled.length} stop${filled.length === 1 ? '' : 's'} for next week — review and save`);
  };

  const renderCard = (s: Stop) => {
    const isToday = s.stopDate === today;
    const err = errors[s._key];
    return (
      <Card key={s._key} className={isToday ? 'border-primary' : ''}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">{formatPrettyDate(s.stopDate)}</span>
              {isToday && <span className="text-xs text-primary font-medium">(Today)</span>}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Active</Label>
                <Switch checked={s.isActive} onCheckedChange={(v) => update(s._key, { isActive: v })} />
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(s._key)} aria-label="Delete stop">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={s.stopDate}
                onChange={(e) => update(s._key, { stopDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Location name</Label>
              <Input
                value={s.locationName ?? ''}
                onChange={(e) => update(s._key, { locationName: e.target.value })}
                placeholder="Downtown Food Park"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address {err && <span className="text-destructive ml-1">— {err}</span>}</Label>
              <Input
                value={s.address}
                onChange={(e) => update(s._key, { address: e.target.value })}
                placeholder="123 Main St, Austin TX"
                className={err ? 'border-destructive' : ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Open</Label>
              <Input
                type="time"
                value={s.openTime}
                onChange={(e) => update(s._key, { openTime: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Close</Label>
              <Input
                type="time"
                value={s.closeTime}
                onChange={(e) => update(s._key, { closeTime: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Note (optional)</Label>
              <Input
                value={s.note ?? ''}
                onChange={(e) => update(s._key, { note: e.target.value })}
                placeholder="Look for the yellow truck near the fountain"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div>
      <Header
        title="Food Truck Schedule"
        description="Where you'll be each day. Customers texting 'where are you tomorrow?' or 'where are you this Friday?' get the right stop automatically."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={duplicateWeek}>
              <Copy className="h-4 w-4 mr-1" /> Duplicate week
            </Button>
            <Button variant="outline" onClick={addStop}>
              <Plus className="h-4 w-4 mr-1" /> Add stop
            </Button>
            <Button onClick={validateAndSave} disabled={saveMutation.isPending || !tenantId}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="space-y-3 pb-24">
            {upcoming.length === 0 && past.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No stops scheduled yet. Click <strong>Add stop</strong> to get started.
                </CardContent>
              </Card>
            )}

            {upcoming.map(renderCard)}

            {past.length > 0 && (
              <div className="pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPast((v) => !v)}
                  className="text-muted-foreground"
                >
                  {showPast ? 'Hide' : 'Show'} past ({past.length})
                </Button>
                {showPast && <div className="mt-2 space-y-3 opacity-70">{past.map(renderCard)}</div>}
              </div>
            )}
          </div>

          {/* Sticky save bar — keeps the action reachable as the user scrolls. */}
          {(isDirty || stops.length === 0) && (
            <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-background border-t shadow-md z-10 p-3 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {isDirty ? `${stops.length} stop${stops.length === 1 ? '' : 's'} unsaved` : 'No stops yet'}
              </div>
              <div className="flex gap-2">
                {isDirty && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStops((data?.stops ?? []).map(fromApi));
                      setErrors({});
                    }}
                    disabled={saveMutation.isPending}
                  >
                    Discard
                  </Button>
                )}
                <Button onClick={validateAndSave} disabled={saveMutation.isPending || !tenantId || !isDirty}>
                  {saveMutation.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
