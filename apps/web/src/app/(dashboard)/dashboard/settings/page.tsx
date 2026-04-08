'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { toast } from 'sonner';
import Link from 'next/link';
import { Phone, Sparkles, Globe, MapPin, CheckCircle, X, Copy, CalendarOff, Plus, CreditCard, Send } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ReplyTemplatesCard } from '@/components/settings/ReplyTemplatesCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { tenantApi, phoneApi, notificationApi } from '@/lib/api';

interface DayScheduleEntry {
  open: string;
  close: string;
}

type BusinessSchedule = Record<string, DayScheduleEntry>;

interface TenantConfig {
  id: string;
  greeting: string;
  timezone: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: number[];
  businessSchedule: BusinessSchedule | null;
  closedDates: string[];
  aiPersonality: string | null;
  calcomLink: string | null;
  slackWebhook: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  businessAddress: string | null;
  websiteUrl: string | null;
  requirePayment?: boolean;
  dailyDigestEnabled?: boolean;
  dailyDigestHour?: number;
}

const TIMEZONES = [
  'America/Chicago',
  'America/New_York',
  'America/Los_Angeles',
  'America/Denver',
  'America/Phoenix',
  'Pacific/Honolulu',
];

const DAYS = [
  { label: 'Sunday', short: 'Sun', value: 0 },
  { label: 'Monday', short: 'Mon', value: 1 },
  { label: 'Tuesday', short: 'Tue', value: 2 },
  { label: 'Wednesday', short: 'Wed', value: 3 },
  { label: 'Thursday', short: 'Thu', value: 4 },
  { label: 'Friday', short: 'Fri', value: 5 },
  { label: 'Saturday', short: 'Sat', value: 6 },
];

function deriveScheduleFromFlat(
  businessDays: number[],
  start: string,
  end: string
): BusinessSchedule {
  const schedule: BusinessSchedule = {};
  for (const day of businessDays) {
    schedule[String(day)] = { open: start, close: end };
  }
  return schedule;
}

function deriveFlatFromSchedule(schedule: BusinessSchedule) {
  const days = Object.keys(schedule).map(Number);
  // Pick the most common open/close times for backward compat
  const times = Object.values(schedule);
  const start = times.length > 0 ? times[0].open : '11:00';
  const end = times.length > 0 ? times[0].close : '20:00';
  return { businessDays: days, businessHoursStart: start, businessHoursEnd: end };
}

export default function SettingsPage() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  // Always fetch the live tenant via /tenants/me instead of relying on
  // potentially stale Clerk publicMetadata (e.g. left over from a seed).
  const { data: tenant } = useQuery({
    queryKey: ['tenant', organization?.id],
    queryFn: () => tenantApi.getMe(),
    enabled: !!organization?.id,
  });

  const tenantId = (tenant?.id as string | undefined)
    ?? (organization?.publicMetadata?.tenantId as string | undefined);
  const config: TenantConfig | undefined = tenant?.config;

  const [form, setForm] = useState({
    greeting: '',
    greetingAfterHours: '',
    greetingRapidRedial: '',
    greetingReturning: '',
    voiceGreeting: '',
    voiceGreetingAfterHours: '',
    voiceGreetingRapidRedial: '',
    voiceGreetingReturning: '',
    voiceType: 'Polly.Joanna-Neural' as 'Polly.Joanna-Neural' | 'Polly.Matthew-Neural' | 'Polly.Salli-Neural' | 'Polly.Ivy-Neural',
    timezone: 'America/Chicago',
    businessSchedule: deriveScheduleFromFlat([1, 2, 3, 4, 5], '11:00', '20:00'),
    closedDates: [] as string[],
    aiPersonality: '',
    calcomLink: '',
    slackWebhook: '',
    ownerEmail: '',
    ownerPhone: '',
    businessAddress: '',
    websiteUrl: '',
    requirePayment: false,
    dailyDigestEnabled: true,
    dailyDigestHour: 8,
  });

  const [newClosedDate, setNewClosedDate] = useState('');
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (config) {
      const schedule = config.businessSchedule
        ? (config.businessSchedule as BusinessSchedule)
        : deriveScheduleFromFlat(
            config.businessDays ?? [1, 2, 3, 4, 5],
            config.businessHoursStart ?? '11:00',
            config.businessHoursEnd ?? '20:00'
          );

      setForm({
        greeting: config.greeting ?? '',
        greetingAfterHours: (config as any).greetingAfterHours ?? '',
        greetingRapidRedial: (config as any).greetingRapidRedial ?? '',
        greetingReturning: (config as any).greetingReturning ?? '',
        voiceGreeting: (config as TenantConfig & { voiceGreeting?: string | null }).voiceGreeting ?? '',
        voiceGreetingAfterHours: (config as any).voiceGreetingAfterHours ?? '',
        voiceGreetingRapidRedial: (config as any).voiceGreetingRapidRedial ?? '',
        voiceGreetingReturning: (config as any).voiceGreetingReturning ?? '',
        voiceType: (() => {
          const raw = (config as TenantConfig & { voiceType?: string }).voiceType ?? 'Polly.Joanna-Neural';
          // Auto-upgrade legacy non-neural voice IDs to their neural variants
          const upgradeMap: Record<string, string> = {
            'Polly.Joanna': 'Polly.Joanna-Neural',
            'Polly.Matthew': 'Polly.Matthew-Neural',
            'Polly.Salli': 'Polly.Salli-Neural',
            'Polly.Ivy': 'Polly.Ivy-Neural',
          };
          return (upgradeMap[raw] ?? raw) as 'Polly.Joanna-Neural' | 'Polly.Matthew-Neural' | 'Polly.Salli-Neural' | 'Polly.Ivy-Neural';
        })(),
        timezone: config.timezone ?? 'America/Chicago',
        businessSchedule: schedule,
        closedDates: config.closedDates ?? [],
        aiPersonality: config.aiPersonality ?? '',
        calcomLink: config.calcomLink ?? '',
        slackWebhook: config.slackWebhook ?? '',
        ownerEmail: config.ownerEmail ?? '',
        ownerPhone: config.ownerPhone ?? '',
        businessAddress: config.businessAddress ?? '',
        websiteUrl: config.websiteUrl ?? '',
        requirePayment: config.requirePayment ?? false,
        dailyDigestEnabled: (config as any).dailyDigestEnabled ?? true,
        dailyDigestHour: (config as any).dailyDigestHour ?? 8,
      });
    }
  }, [config]);

  const generateGreetingMutation = useMutation({
    mutationFn: () => tenantApi.generateGreeting(tenantId!),
    onSuccess: (data: { greeting: string }) => {
      setForm(f => ({ ...f, greeting: data.greeting }));
      toast.success('Greeting generated! Review and save when ready.');
    },
    onError: () => toast.error('Failed to generate greeting'),
  });

  const generateAllGreetingsMutation = useMutation({
    mutationFn: () => tenantApi.generateAllGreetings(tenantId!),
    onSuccess: (data: { generated: Record<string, string> }) => {
      const g = data.generated ?? {};
      setForm(f => ({
        ...f,
        greeting: g.greeting || f.greeting,
        greetingAfterHours: g.greetingAfterHours || f.greetingAfterHours,
        greetingRapidRedial: g.greetingRapidRedial || f.greetingRapidRedial,
        greetingReturning: g.greetingReturning || f.greetingReturning,
        voiceGreeting: g.voiceGreeting || f.voiceGreeting,
        voiceGreetingAfterHours: g.voiceGreetingAfterHours || f.voiceGreetingAfterHours,
        voiceGreetingRapidRedial: g.voiceGreetingRapidRedial || f.voiceGreetingRapidRedial,
        voiceGreetingReturning: g.voiceGreetingReturning || f.voiceGreetingReturning,
      }));
      toast.success('All greetings generated! Review each one and save when ready.');
    },
    onError: () => toast.error('Failed to generate greetings (rate-limited or service error)'),
  });

  const testNotificationMutation = useMutation({
    mutationFn: (channel: 'email' | 'sms' | 'slack') =>
      notificationApi.test(tenantId!, channel),
    onSuccess: (_, channel) => {
      toast.success(`Test ${channel} notification sent! Check your ${channel === 'email' ? 'inbox' : channel === 'sms' ? 'phone' : 'Slack channel'}.`);
    },
    onError: (_, channel) => toast.error(`Failed to send test ${channel} notification`),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const flat = deriveFlatFromSchedule(form.businessSchedule);
      return tenantApi.updateConfig(tenantId!, {
        greeting: form.greeting,
        greetingAfterHours: form.greetingAfterHours || null,
        greetingRapidRedial: form.greetingRapidRedial || null,
        greetingReturning: form.greetingReturning || null,
        voiceGreeting: form.voiceGreeting || null,
        voiceGreetingAfterHours: form.voiceGreetingAfterHours || null,
        voiceGreetingRapidRedial: form.voiceGreetingRapidRedial || null,
        voiceGreetingReturning: form.voiceGreetingReturning || null,
        voiceType: form.voiceType,
        timezone: form.timezone,
        businessSchedule: form.businessSchedule,
        closedDates: form.closedDates,
        // Backward compat flat fields
        businessHoursStart: flat.businessHoursStart,
        businessHoursEnd: flat.businessHoursEnd,
        businessDays: flat.businessDays,
        aiPersonality: form.aiPersonality || undefined,
        calcomLink: form.calcomLink || undefined,
        slackWebhook: form.slackWebhook || undefined,
        ownerEmail: form.ownerEmail || undefined,
        ownerPhone: form.ownerPhone || undefined,
        businessAddress: form.businessAddress || undefined,
        websiteUrl: form.websiteUrl || undefined,
        requirePayment: form.requirePayment,
        dailyDigestEnabled: form.dailyDigestEnabled,
        dailyDigestHour: form.dailyDigestHour,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
      setShowSaved(true);
      toast.success('Settings saved!');
    },
    onError: () => toast.error('Failed to save settings'),
  });

  // Auto-dismiss save banner
  useEffect(() => {
    if (showSaved) {
      const timer = setTimeout(() => setShowSaved(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showSaved]);

  const field = (key: keyof typeof form) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value })),
  });

  const toggleDay = (dayValue: number) => {
    setForm(f => {
      const schedule = { ...f.businessSchedule };
      const key = String(dayValue);
      if (schedule[key]) {
        delete schedule[key];
      } else {
        schedule[key] = { open: '11:00', close: '20:00' };
      }
      return { ...f, businessSchedule: schedule };
    });
  };

  const updateDayTime = (dayValue: number, field: 'open' | 'close', value: string) => {
    setForm(f => {
      const schedule = { ...f.businessSchedule };
      const key = String(dayValue);
      if (schedule[key]) {
        schedule[key] = { ...schedule[key], [field]: value };
      }
      return { ...f, businessSchedule: schedule };
    });
  };

  const copyToAllDays = () => {
    setForm(f => {
      const entries = Object.entries(f.businessSchedule);
      if (entries.length === 0) return f;
      const firstEntry = entries[0][1];
      const schedule: BusinessSchedule = {};
      for (const key of Object.keys(f.businessSchedule)) {
        schedule[key] = { ...firstEntry };
      }
      return { ...f, businessSchedule: schedule };
    });
  };

  const addClosedDate = () => {
    if (!newClosedDate) return;
    setForm(f => ({
      ...f,
      closedDates: f.closedDates.includes(newClosedDate)
        ? f.closedDates
        : [...f.closedDates, newClosedDate].sort(),
    }));
    setNewClosedDate('');
  };

  const removeClosedDate = (date: string) => {
    setForm(f => ({
      ...f,
      closedDates: f.closedDates.filter(d => d !== date),
    }));
  };

  return (
    <div>
      <Header title="Settings" description="Configure your RingBack account" />

      <div className="space-y-6 max-w-2xl">
        {/* Save Confirmation Banner */}
        {showSaved && (
          <div className="rounded-md border border-green-200 bg-green-50 p-4 text-green-800 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
            <span className="font-medium">Settings saved successfully!</span>
            <button onClick={() => setShowSaved(false)} className="ml-auto">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Phone Number */}
        <PhoneNumberCard tenantId={tenantId} />

        {/* Business Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Business Info
            </CardTitle>
            <CardDescription>Your business address and website for AI context</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                Business Address
              </Label>
              <Input {...field('businessAddress')} placeholder="123 Main St, Springfield, IL 62701" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                Website URL
              </Label>
              <Input {...field('websiteUrl')} placeholder="https://yourbusiness.com" />
              <p className="text-xs text-muted-foreground">AI will extract context from your website to improve conversations and greetings</p>
            </div>
          </CardContent>
        </Card>

        {/* Greeting */}
        <Card>
          <CardHeader>
            <CardTitle>Missed Call Greeting</CardTitle>
            <CardDescription>This SMS is sent immediately when a call is missed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex items-start gap-3">
              <Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Let AI write all 8 greetings for you</p>
                <p className="text-xs text-blue-800 mt-0.5">
                  Set your brand voice in <span className="font-medium">AI Personality</span> below, then click Generate. AI optimizes for SMS length and tier-specific tone. You can edit anything before saving.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => generateAllGreetingsMutation.mutate()}
                disabled={generateAllGreetingsMutation.isPending || !tenantId}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                {generateAllGreetingsMutation.isPending ? 'Generating…' : 'Generate all'}
              </Button>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Greeting Message</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => generateGreetingMutation.mutate()}
                  disabled={generateGreetingMutation.isPending || !tenantId}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  {generateGreetingMutation.isPending ? 'Generating...' : 'Auto-Generate'}
                </Button>
              </div>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[100px] resize-y"
                {...field('greeting')}
                placeholder="Hi! Sorry we missed your call..."
              />
            </div>

            <div className="space-y-1.5 border-t pt-4">
              <Label>Voice Greeting (what callers hear)</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
                value={form.voiceGreeting}
                maxLength={500}
                onChange={(e) => setForm(f => ({ ...f, voiceGreeting: e.target.value }))}
                placeholder="Hi, thanks for calling. We can help you faster by text — you'll receive a message in just a moment. If you'd prefer a callback, leave a message after the beep."
              />
              <p className="text-xs text-muted-foreground">
                Spoken via text-to-speech before voicemail. Leave blank to use the default. Max 500 characters.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Voice</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={form.voiceType}
                onChange={(e) => setForm(f => ({ ...f, voiceType: e.target.value as typeof f.voiceType }))}
              >
                <option value="Polly.Joanna-Neural">Joanna (Female, warm)</option>
                <option value="Polly.Matthew-Neural">Matthew (Male, warm)</option>
                <option value="Polly.Salli-Neural">Salli (Female, neutral)</option>
                <option value="Polly.Ivy-Neural">Ivy (Female, youthful)</option>
              </select>
              <p className="text-xs text-muted-foreground">Call your number to preview.</p>
            </div>

            <div className="space-y-1.5 border-t pt-4">
              <Label>After-hours SMS greeting (optional)</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
                value={form.greetingAfterHours}
                onChange={(e) => setForm(f => ({ ...f, greetingAfterHours: e.target.value }))}
                placeholder="Thanks for calling! We're closed right now but we'll get back to you first thing in the morning."
              />
              <p className="text-xs text-muted-foreground">
                Sent when calls arrive outside your business hours. Leave blank to use the regular greeting.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>After-hours voice greeting (optional)</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
                value={form.voiceGreetingAfterHours}
                maxLength={500}
                onChange={(e) => setForm(f => ({ ...f, voiceGreetingAfterHours: e.target.value }))}
                placeholder="Hi, thanks for calling. We're closed right now — leave a message after the beep and we'll text you back as soon as we open."
              />
              <p className="text-xs text-muted-foreground">
                Spoken when calls arrive outside business hours. Max 500 characters.
              </p>
            </div>

            <div className="space-y-1.5 border-t pt-4">
              <Label>Rapid-redial SMS greeting (optional)</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
                value={form.greetingRapidRedial}
                onChange={(e) => setForm(f => ({ ...f, greetingRapidRedial: e.target.value }))}
                placeholder="Hey, we see you called back — we got your first message. Someone will be with you shortly. What do you need help with?"
              />
              <p className="text-xs text-muted-foreground">
                Sent when the same caller rings you 2+ times within 5 minutes. Acknowledges them instead of repeating the standard greeting. Leave blank to use the regular greeting.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Rapid-redial voice greeting (optional)</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[60px] resize-y"
                value={form.voiceGreetingRapidRedial}
                maxLength={500}
                onChange={(e) => setForm(f => ({ ...f, voiceGreetingRapidRedial: e.target.value }))}
                placeholder="Still here — check your texts, we just messaged you."
              />
              <p className="text-xs text-muted-foreground">
                Keep it short — 8 words or less feels responsive. Max 500 characters.
              </p>
            </div>

            <div className="space-y-1.5 border-t pt-4">
              <Label>Returning-customer SMS greeting (optional)</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
                value={form.greetingReturning}
                onChange={(e) => setForm(f => ({ ...f, greetingReturning: e.target.value }))}
                placeholder="Welcome back! Want to reorder your usual, or try something new? Reply ORDER to get started."
              />
              <p className="text-xs text-muted-foreground">
                Sent when the caller has a prior order or is marked Customer/VIP. Leave blank to use the regular greeting.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Returning-customer voice greeting (optional)</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[60px] resize-y"
                value={form.voiceGreetingReturning}
                maxLength={500}
                onChange={(e) => setForm(f => ({ ...f, voiceGreetingReturning: e.target.value }))}
                placeholder="Welcome back! We just texted you — check your messages."
              />
              <p className="text-xs text-muted-foreground">
                Spoken when a known customer calls. Max 500 characters.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Business Hours */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Business Hours</CardTitle>
                <CardDescription>Set hours for each day your business is open</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyToAllDays}
                disabled={Object.keys(form.businessSchedule).length === 0}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy to All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                {...field('timezone')}
              >
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              {DAYS.map((day) => {
                const key = String(day.value);
                const isEnabled = !!form.businessSchedule[key];
                const schedule = form.businessSchedule[key];

                return (
                  <div key={day.value} className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      className={`w-20 sm:w-24 text-left text-sm font-medium py-2 px-3 rounded-md border transition-colors ${
                        isEnabled
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted text-muted-foreground border-input line-through'
                      }`}
                    >
                      {day.short}
                    </button>
                    {isEnabled ? (
                      <>
                        <Input
                          type="time"
                          value={schedule.open}
                          onChange={(e) => updateDayTime(day.value, 'open', e.target.value)}
                          className="w-28 sm:w-32"
                        />
                        <span className="text-muted-foreground text-sm">to</span>
                        <Input
                          type="time"
                          value={schedule.close}
                          onChange={(e) => updateDayTime(day.value, 'close', e.target.value)}
                          className="w-28 sm:w-32"
                        />
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Click a day name to toggle open/closed</p>
          </CardContent>
        </Card>

        {/* Holiday / Closed Dates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarOff className="h-5 w-5" />
              Holiday / Closed Dates
            </CardTitle>
            <CardDescription>Specific dates your business will be closed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="date"
                value={newClosedDate}
                onChange={(e) => setNewClosedDate(e.target.value)}
                className="w-48"
              />
              <Button type="button" variant="outline" size="sm" onClick={addClosedDate} disabled={!newClosedDate}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>
            {form.closedDates.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {form.closedDates.map((date) => (
                  <Badge key={date} variant="secondary" className="flex items-center gap-1 px-3 py-1">
                    {new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    <button type="button" onClick={() => removeClosedDate(date)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No closed dates set</p>
            )}
          </CardContent>
        </Card>

        {/* AI & Contact */}
        <Card>
          <CardHeader>
            <CardTitle>AI & Contact</CardTitle>
            <CardDescription>Notifications and AI personality</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>AI Personality</Label>
              <Input {...field('aiPersonality')} placeholder="warm, friendly, and professional" />
              <p className="text-xs text-muted-foreground">How the AI should present itself in conversations</p>
            </div>
            <div className="space-y-1.5">
              <Label>Cal.com Booking Link</Label>
              <Input {...field('calcomLink')} placeholder="https://cal.com/yourname" />
            </div>
            <div className="space-y-1.5">
              <Label>Slack Webhook URL</Label>
              <div className="flex gap-2">
                <Input {...field('slackWebhook')} placeholder="https://hooks.slack.com/services/..." className="flex-1" />
                {form.slackWebhook && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => testNotificationMutation.mutate('slack')}
                    disabled={testNotificationMutation.isPending}
                  >
                    <Send className="h-3.5 w-3.5 mr-1" />
                    Test
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Receive notifications in your Slack channel</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Owner Email</Label>
                <div className="flex gap-2">
                  <Input type="email" {...field('ownerEmail')} placeholder="you@example.com" className="flex-1" />
                  {form.ownerEmail && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => testNotificationMutation.mutate('email')}
                      disabled={testNotificationMutation.isPending}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Owner Phone (for SMS alerts)</Label>
                <div className="flex gap-2">
                  <Input {...field('ownerPhone')} placeholder="+12175551234" className="flex-1" />
                  {form.ownerPhone && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => testNotificationMutation.mutate('sms')}
                      disabled={testNotificationMutation.isPending}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="pt-4 border-t space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Daily action-items digest</Label>
                  <p className="text-xs text-muted-foreground">Email me a daily summary of open tasks</p>
                </div>
                <input
                  type="checkbox"
                  checked={form.dailyDigestEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, dailyDigestEnabled: e.target.checked }))}
                  className="h-4 w-4"
                />
              </div>
              {form.dailyDigestEnabled && (
                <div className="space-y-1.5 max-w-xs">
                  <Label>Send at</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={form.dailyDigestHour}
                    onChange={(e) => setForm((f) => ({ ...f, dailyDigestHour: parseInt(e.target.value, 10) }))}
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>
                        {h === 0 ? '12:00 AM' : h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">In your business timezone ({form.timezone})</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Reply Templates */}
        <ReplyTemplatesCard tenantId={tenantId} />

        {/* Payments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payments
            </CardTitle>
            <CardDescription>Collect payment from customers during SMS ordering</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Require upfront payment for orders</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Customers will receive a Stripe payment link after placing an order via SMS</p>
              </div>
              <Switch
                checked={form.requirePayment}
                onCheckedChange={(v) => setForm(f => ({ ...f, requirePayment: v }))}
              />
            </div>
          </CardContent>
        </Card>

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} size="lg">
          {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}

function PhoneNumberCard({ tenantId }: { tenantId: string | undefined }) {
  const { data: phoneStatus } = useQuery({
    queryKey: ['phone-status', tenantId],
    queryFn: () => phoneApi.getStatus(tenantId!),
    enabled: !!tenantId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Phone Number
        </CardTitle>
        <CardDescription>Your RingBackSMS phone number for missed-call replies</CardDescription>
      </CardHeader>
      <CardContent>
        {phoneStatus?.hasPhoneNumber ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg font-mono font-semibold">{phoneStatus.phoneNumber}</span>
              <Badge variant="success">Active</Badge>
            </div>
            <Link href="/dashboard/settings/phone">
              <Button variant="ghost" size="sm">Manage</Button>
            </Link>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">No phone number configured yet</p>
            <Link href="/dashboard/settings/phone">
              <Button size="sm">Set Up Phone Number</Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
