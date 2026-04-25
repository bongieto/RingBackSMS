'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Calendar, Trash2, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { calendarApi, tenantApi } from '@/lib/api';

interface TenantConfigCalendarFields {
  meetingEnabled?: boolean;
  meetingDurationMinutes?: number;
  meetingBufferMinutes?: number;
  meetingLeadTimeMinutes?: number;
  meetingMaxDaysOut?: number;
  calcomEventTypeId?: number | null;
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90];
const BUFFER_OPTIONS = [0, 5, 15, 30];
const LEAD_TIME_OPTIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
  { value: 1440, label: '1 day' },
];

export function CalendarSettingsCard({ tenantId }: { tenantId: string | undefined }) {
  const qc = useQueryClient();

  const { data: tenant } = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: () => tenantApi.getMe(),
    enabled: !!tenantId,
  });

  const config = (tenant?.config ?? {}) as TenantConfigCalendarFields;
  // Built-in calendar is shadowed by cal.com when both are configured. The
  // card stays visible (so the operator can still set duration/buffer that
  // would apply if they disconnect cal.com), but we surface a notice.
  const calcomActive = Boolean(config.calcomEventTypeId);

  const [enabled, setEnabled] = useState<boolean>(true);
  const [duration, setDuration] = useState<number>(30);
  const [buffer, setBuffer] = useState<number>(15);
  const [leadTime, setLeadTime] = useState<number>(60);
  const [maxDaysOut, setMaxDaysOut] = useState<number>(30);

  useEffect(() => {
    if (!tenant) return;
    setEnabled(config.meetingEnabled ?? true);
    setDuration(config.meetingDurationMinutes ?? 30);
    setBuffer(config.meetingBufferMinutes ?? 15);
    setLeadTime(config.meetingLeadTimeMinutes ?? 60);
    setMaxDaysOut(config.meetingMaxDaysOut ?? 30);
  }, [tenant, config.meetingEnabled, config.meetingDurationMinutes, config.meetingBufferMinutes, config.meetingLeadTimeMinutes, config.meetingMaxDaysOut]);

  const saveConfig = useMutation({
    mutationFn: () =>
      tenantApi.updateConfig(tenantId!, {
        meetingEnabled: enabled,
        meetingDurationMinutes: duration,
        meetingBufferMinutes: buffer,
        meetingLeadTimeMinutes: leadTime,
        meetingMaxDaysOut: maxDaysOut,
      }),
    onSuccess: () => {
      toast.success('Calendar settings saved');
      qc.invalidateQueries({ queryKey: ['tenant', 'me'] });
    },
    onError: () => toast.error('Failed to save calendar settings'),
  });

  // ── Blackouts ───────────────────────────────────────────────────────────
  const { data: blackoutData } = useQuery({
    queryKey: ['calendar-blackouts', tenantId],
    queryFn: () => calendarApi.listBlackouts(tenantId!),
    enabled: !!tenantId,
  });
  const blackouts = blackoutData?.blackouts ?? [];

  const [bStart, setBStart] = useState('');
  const [bEnd, setBEnd] = useState('');
  const [bLabel, setBLabel] = useState('');

  const addBlackout = useMutation({
    mutationFn: () =>
      calendarApi.createBlackout(tenantId!, {
        startAt: new Date(bStart).toISOString(),
        endAt: new Date(bEnd).toISOString(),
        label: bLabel.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Blackout added');
      setBStart('');
      setBEnd('');
      setBLabel('');
      qc.invalidateQueries({ queryKey: ['calendar-blackouts', tenantId] });
    },
    onError: () => toast.error('Failed to add blackout'),
  });

  const deleteBlackout = useMutation({
    mutationFn: (id: string) => calendarApi.deleteBlackout(id),
    onSuccess: () => {
      toast.success('Blackout removed');
      qc.invalidateQueries({ queryKey: ['calendar-blackouts', tenantId] });
    },
    onError: () => toast.error('Failed to remove blackout'),
  });

  if (!tenantId) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Calendar settings
        </CardTitle>
        <CardDescription>
          {calcomActive
            ? 'cal.com is connected — these settings only apply if you disconnect cal.com.'
            : 'Controls how the SMS bot proposes and books meeting slots.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="meeting-enabled" className="text-sm font-medium">Built-in calendar</Label>
            <p className="text-xs text-muted-foreground">
              When off, the bot collects meeting requests for you to review manually.
            </p>
          </div>
          <Switch
            id="meeting-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label htmlFor="duration">Meeting length</Label>
            <select
              id="duration"
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm mt-1"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              {DURATION_OPTIONS.map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="buffer">Buffer between</Label>
            <select
              id="buffer"
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm mt-1"
              value={buffer}
              onChange={(e) => setBuffer(Number(e.target.value))}
            >
              {BUFFER_OPTIONS.map((m) => (
                <option key={m} value={m}>{m === 0 ? 'None' : `${m} min`}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="lead-time">Earliest slot</Label>
            <select
              id="lead-time"
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm mt-1"
              value={leadTime}
              onChange={(e) => setLeadTime(Number(e.target.value))}
            >
              {LEAD_TIME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label} from now</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="max-days-out">Max days out</Label>
            <Input
              id="max-days-out"
              type="number"
              min={1}
              max={365}
              value={maxDaysOut}
              onChange={(e) => setMaxDaysOut(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending} size="sm">
            {saveConfig.isPending ? 'Saving…' : 'Save settings'}
          </Button>
        </div>

        {/* Blackouts */}
        <div className="border-t pt-6">
          <Label className="text-sm font-medium">Blackout windows</Label>
          <p className="text-xs text-muted-foreground mb-3">
            Block off specific dates or time ranges (holidays, off-sites). The bot won't offer these slots.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-3">
            <div className="md:col-span-3">
              <Input
                type="datetime-local"
                value={bStart}
                onChange={(e) => setBStart(e.target.value)}
                placeholder="Start"
              />
            </div>
            <div className="md:col-span-3">
              <Input
                type="datetime-local"
                value={bEnd}
                onChange={(e) => setBEnd(e.target.value)}
                placeholder="End"
              />
            </div>
            <div className="md:col-span-4">
              <Input
                placeholder="Label (optional)"
                value={bLabel}
                onChange={(e) => setBLabel(e.target.value)}
                maxLength={120}
              />
            </div>
            <div className="md:col-span-2">
              <Button
                size="sm"
                className="w-full"
                onClick={() => addBlackout.mutate()}
                disabled={!bStart || !bEnd || addBlackout.isPending}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </div>

          {blackouts.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No blackouts.</p>
          ) : (
            <ul className="space-y-1">
              {blackouts.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between text-sm py-1.5 px-3 rounded border bg-muted/30"
                >
                  <span>
                    <span className="font-medium">{formatRange(b.startAt, b.endAt)}</span>
                    {b.label ? <span className="text-muted-foreground"> — {b.label}</span> : null}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteBlackout.mutate(b.id)}
                    disabled={deleteBlackout.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${dateFmt.format(start)} → ${dateFmt.format(end)}`;
}
