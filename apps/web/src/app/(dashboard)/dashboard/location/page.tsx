'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MapPin } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { useTenantId } from '@/components/providers/TenantProvider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface DayRow {
  dayOfWeek: number;
  locationName: string | null;
  address: string;
  openTime: string;
  closeTime: string;
  note: string | null;
  isActive: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function emptyRow(dow: number): DayRow {
  return {
    dayOfWeek: dow,
    locationName: '',
    address: '',
    openTime: '11:00',
    closeTime: '14:00',
    note: '',
    isActive: false,
  };
}

export default function LocationPage() {
  const { tenantId } = useTenantId();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<DayRow[]>(() => DAYS.map((_, i) => emptyRow(i)));

  const { data, isLoading } = useQuery<DayRow[]>({
    queryKey: ['food-truck-schedule', tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/food-truck-schedule`);
      if (!res.ok) throw new Error('Failed to load schedule');
      const json = await res.json();
      return json.data ?? json;
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (!data) return;
    const byDow = new Map(data.map((r) => [r.dayOfWeek, r]));
    setRows(DAYS.map((_, i) => byDow.get(i) ?? emptyRow(i)));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tenants/${tenantId}/food-truck-schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: rows.filter((r) => r.address.trim().length > 0) }),
      });
      if (!res.ok) throw new Error('Save failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food-truck-schedule', tenantId] });
      toast.success('Schedule saved!');
    },
    onError: () => toast.error('Failed to save schedule'),
  });

  const update = (dow: number, patch: Partial<DayRow>) => {
    setRows((rs) => rs.map((r) => (r.dayOfWeek === dow ? { ...r, ...patch } : r)));
  };

  const today = new Date().getDay();

  return (
    <div>
      <Header
        title="Weekly Location Schedule"
        description="Where you'll be each day. Customers texting 'where' will get today's spot automatically."
        action={
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving...' : 'Save Schedule'}
          </Button>
        }
      />

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.dayOfWeek} className={r.dayOfWeek === today ? 'border-primary' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{DAYS[r.dayOfWeek]}</span>
                    {r.dayOfWeek === today && <span className="text-xs text-primary font-medium">(Today)</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Active</Label>
                    <Switch checked={r.isActive} onCheckedChange={(v) => update(r.dayOfWeek, { isActive: v })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Location name</Label>
                    <Input
                      value={r.locationName ?? ''}
                      onChange={(e) => update(r.dayOfWeek, { locationName: e.target.value })}
                      placeholder="Downtown Food Park"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Address</Label>
                    <Input
                      value={r.address}
                      onChange={(e) => update(r.dayOfWeek, { address: e.target.value })}
                      placeholder="123 Main St, Austin TX"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Open</Label>
                    <Input
                      type="time"
                      value={r.openTime}
                      onChange={(e) => update(r.dayOfWeek, { openTime: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Close</Label>
                    <Input
                      type="time"
                      value={r.closeTime}
                      onChange={(e) => update(r.dayOfWeek, { closeTime: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Note (optional)</Label>
                    <Input
                      value={r.note ?? ''}
                      onChange={(e) => update(r.dayOfWeek, { note: e.target.value })}
                      placeholder="Look for the yellow truck near the fountain"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
