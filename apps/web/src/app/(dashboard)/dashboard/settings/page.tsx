'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBusinessLimitDefinitions,
  getDefaultBusinessLimits,
  type BusinessLimitKey,
  type BusinessLimits,
} from '@ringback/shared-types';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  AlertCircle,
  CalendarOff,
  CheckCircle,
  Copy,
  CreditCard,
  Globe,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabList, TabPanel, TabTrigger } from '@/components/ui/tabs';
import { useTenantId } from '@/components/providers/TenantProvider';
import { tenantApi, phoneApi, notificationApi } from '@/lib/api';
import { getProfile } from '@/lib/businessTypeProfile';
import {
  getDefaultConsentMessage,
  getEditableConsentMessage,
} from '@/lib/consentMessage';

const ReplyTemplatesCard = dynamic(
  () => import('@/components/settings/ReplyTemplatesCard').then((mod) => mod.ReplyTemplatesCard),
  {
    loading: () => (
      <Card>
        <CardHeader>
          <CardTitle>Reply Templates</CardTitle>
          <CardDescription>Loading quick-reply snippets...</CardDescription>
        </CardHeader>
      </Card>
    ),
  },
);

interface DayScheduleEntry {
  open: string;
  close: string;
}

type BusinessSchedule = Record<string, DayScheduleEntry>;

interface TenantConfig {
  id: string;
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
  googleReviewUrl: string | null;
  requirePayment?: boolean;
  dailyDigestEnabled?: boolean;
  dailyDigestHour?: number;
  spamFilterEnabled?: boolean;
  followupOpener?: string | null;
  consentMessage?: string | null;
  customAiInstructions?: string | null;
  businessLimits?: Partial<BusinessLimits> | null;
}

function normalizeBusinessLimits(
  limits: Partial<BusinessLimits> | null | undefined,
  businessType: string | null | undefined,
): BusinessLimits {
  return {
    ...getDefaultBusinessLimits(businessType),
    ...(limits ?? {}),
    notes: Array.isArray(limits?.notes) ? limits.notes : [],
  };
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
  const { tenantId } = useTenantId();
  const queryClient = useQueryClient();

  // Always use TenantProvider's /tenants/me result as the source of truth.
  // Clerk publicMetadata can be stale during org switching and should not
  // drive settings or phone-number lookups.
  const { data: tenant } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => tenantApi.getMe(),
    enabled: !!tenantId,
  });

  const config: TenantConfig | undefined = tenant?.config;
  const businessType = (tenant as { businessType?: string } | undefined)?.businessType;
  const tenantName = (tenant as { name?: string } | undefined)?.name;
  const tenantPhoneNumber = (tenant as { twilioPhoneNumber?: string | null } | undefined)
    ?.twilioPhoneNumber ?? null;
  const profile = getProfile(businessType);

  const [form, setForm] = useState({
    voiceGreeting: '',
    voiceGreetingAfterHours: '',
    voiceGreetingRapidRedial: '',
    voiceGreetingReturning: '',
    voiceType: 'nova' as string,
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
    googleReviewUrl: '',
    requirePayment: false,
    dailyDigestEnabled: true,
    dailyDigestHour: 8,
    spamFilterEnabled: true,
    defaultPrepTimeMinutes: null as number | null,
    largeOrderThresholdItems: null as number | null,
    largeOrderExtraMinutes: null as number | null,
    prepTimeOverrides: [] as Array<{
      dayOfWeek: number;
      start: string;
      end: string;
      extraMinutes: number;
      label?: string;
    }>,
    ordersAcceptingEnabled: true,
    customAiInstructions: '' as string | null,
    followupOpener: '' as string | null,
    consentMessage: '' as string | null,
    salesTaxRate: null as number | null,
    passStripeFeesToCustomer: false,
  });

  const [newClosedDate, setNewClosedDate] = useState('');
  const [showSaved, setShowSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('basics');

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
        voiceGreeting: (config as TenantConfig & { voiceGreeting?: string | null }).voiceGreeting ?? '',
        voiceGreetingAfterHours: (config as any).voiceGreetingAfterHours ?? '',
        voiceGreetingRapidRedial: (config as any).voiceGreetingRapidRedial ?? '',
        voiceGreetingReturning: (config as any).voiceGreetingReturning ?? '',
        voiceType: (() => {
          return (config as TenantConfig & { voiceType?: string }).voiceType ?? 'nova';
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
        googleReviewUrl: (config as any).googleReviewUrl ?? '',
        requirePayment: config.requirePayment ?? false,
        dailyDigestEnabled: (config as any).dailyDigestEnabled ?? true,
        dailyDigestHour: (config as any).dailyDigestHour ?? 8,
        spamFilterEnabled: (config as any).spamFilterEnabled ?? true,
        defaultPrepTimeMinutes: (config as any).defaultPrepTimeMinutes ?? null,
        largeOrderThresholdItems: (config as any).largeOrderThresholdItems ?? null,
        largeOrderExtraMinutes: (config as any).largeOrderExtraMinutes ?? null,
        prepTimeOverrides: ((config as any).prepTimeOverrides as any[] | null) ?? [],
        ordersAcceptingEnabled: (config as any).ordersAcceptingEnabled ?? true,
        customAiInstructions: (config as any).customAiInstructions ?? '',
        followupOpener: (config as any).followupOpener ?? '',
        consentMessage: getEditableConsentMessage(
          config.consentMessage,
          tenantName ?? '',
          businessType,
        ),
        salesTaxRate:
          (config as any).salesTaxRate != null ? Number((config as any).salesTaxRate) : null,
        passStripeFeesToCustomer: (config as any).passStripeFeesToCustomer ?? false,
      });
    }
  }, [businessType, config, tenantName]);

  const generateAllGreetingsMutation = useMutation({
    mutationFn: () => tenantApi.generateAllGreetings(tenantId!),
    onSuccess: (data: { generated: Record<string, string>; filled?: number; total?: number }) => {
      const g = data.generated ?? {};
      setForm(f => ({
        ...f,
        voiceGreeting: g.voiceGreeting || f.voiceGreeting,
        voiceGreetingAfterHours: g.voiceGreetingAfterHours || f.voiceGreetingAfterHours,
        voiceGreetingRapidRedial: g.voiceGreetingRapidRedial || f.voiceGreetingRapidRedial,
        voiceGreetingReturning: g.voiceGreetingReturning || f.voiceGreetingReturning,
      }));
      const filled = data.filled ?? Object.values(g).filter(Boolean).length;
      const total = data.total ?? 4;
      if (filled < total) {
        toast.warning(`Generated ${filled} of ${total}. Some slots failed — try again.`);
      } else {
        toast.success('All voice greetings generated! Review each one and save when ready.');
      }
    },
    onError: (err: any) =>
      toast.error(
        err?.response?.data?.error ?? 'Failed to generate greetings (rate-limited or service error)',
      ),
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
        googleReviewUrl: form.googleReviewUrl?.trim() ? form.googleReviewUrl.trim() : null,
        requirePayment: form.requirePayment,
        dailyDigestEnabled: form.dailyDigestEnabled,
        dailyDigestHour: form.dailyDigestHour,
        spamFilterEnabled: form.spamFilterEnabled,
        defaultPrepTimeMinutes: form.defaultPrepTimeMinutes,
        largeOrderThresholdItems: form.largeOrderThresholdItems,
        largeOrderExtraMinutes: form.largeOrderExtraMinutes,
        prepTimeOverrides: form.prepTimeOverrides,
        ordersAcceptingEnabled: form.ordersAcceptingEnabled,
        customAiInstructions: form.customAiInstructions || null,
        followupOpener: form.followupOpener || null,
        consentMessage: form.consentMessage?.trim() || null,
        salesTaxRate: form.salesTaxRate,
        passStripeFeesToCustomer: form.passStripeFeesToCustomer,
      } as any);
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
      <Header
        title="Settings"
        description="Simple controls for how RingBackSMS answers, texts, and alerts your team."
      />

      <div className="space-y-6 max-w-5xl">
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

        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium">{profile.emoji} {profile.label}</p>
              <p className="text-sm text-muted-foreground">
                These settings control what customers hear, what they receive by text, and when your team gets alerted.
              </p>
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} size="lg">
              {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onChange={setActiveTab}>
          <TabList className="flex-wrap gap-4">
            <TabTrigger value="basics">Basics</TabTrigger>
            <TabTrigger value="ai">AI Response</TabTrigger>
            <TabTrigger value="notifications">Notifications</TabTrigger>
            {(profile.nav.showOrders || profile.nav.showPrepTime) && (
              <TabTrigger value="operations">Orders</TabTrigger>
            )}
            <TabTrigger value="advanced">Advanced</TabTrigger>
            <TabTrigger value="team">Team</TabTrigger>
          </TabList>

          <TabPanel value="basics" className="space-y-6 max-w-3xl">
            <PhoneNumberCard
              tenantId={tenantId}
              tenantName={tenantName}
              tenantPhoneNumber={tenantPhoneNumber}
            />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Business basics
                </CardTitle>
                <CardDescription>
                  The AI uses this information to answer location, hours, and service questions more accurately.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    Business address
                  </Label>
                  <Input {...field('businessAddress')} placeholder="123 Main St, Springfield, IL 62701" />
                  <p className="text-xs text-muted-foreground">
                    Used when customers ask where you are or whether they are nearby.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    Website URL
                  </Label>
                  <Input {...field('websiteUrl')} placeholder="https://yourbusiness.com" />
                  <p className="text-xs text-muted-foreground">
                    RingBackSMS can read public website content so replies match your actual services, menu, and policies.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5" />
                    Google Business Profile review link
                  </Label>
                  <Input
                    {...field('googleReviewUrl')}
                    placeholder="https://g.page/r/CXXXXXXXXXXX/review"
                    type="url"
                  />
                  <p className="text-xs text-muted-foreground">
                    Optional. Happy customers who rate you 4 or 5 stars can receive this link; lower ratings stay private for follow-up.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Business hours</CardTitle>
                    <CardDescription>
                      Controls after-hours replies, voice greetings, and when customers are told you reopen.
                    </CardDescription>
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
                <p className="text-xs text-muted-foreground">Click a day name to toggle open/closed.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarOff className="h-5 w-5" />
                  Holiday and closed dates
                </CardTitle>
                <CardDescription>
                  Add one-off closures so callers are not promised same-day help when you are closed.
                </CardDescription>
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
                  <p className="text-sm text-muted-foreground">No closed dates set.</p>
                )}
              </CardContent>
            </Card>
          </TabPanel>

          <TabPanel value="ai" className="space-y-6 max-w-3xl">
            <AiMessagingCard
              tenantId={tenantId!}
              businessName={(tenant as any)?.name ?? ''}
              businessType={businessType}
              form={form}
              setForm={setForm}
              initialBusinessLimits={config?.businessLimits ?? null}
            />

            <Card>
              <CardHeader>
                <CardTitle>Booking and AI tone</CardTitle>
                <CardDescription>
                  Tell the assistant how to sound and where to send customers who want an appointment.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>AI personality</Label>
                  <Input {...field('aiPersonality')} placeholder={profile.aiPersonalityHint} />
                  <p className="text-xs text-muted-foreground">
                    Plain language is best. Example: friendly, brief, and professional.
                  </p>
                </div>
                {profile.nav.showMeetings && (
                  <div className="space-y-1.5">
                    <Label>Booking link</Label>
                    <Input {...field('calcomLink')} placeholder="https://cal.com/yourname" />
                    <p className="text-xs text-muted-foreground">
                      Optional. The AI can share this when customers ask to book or schedule.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabPanel>

          <TabPanel value="notifications" className="space-y-6 max-w-3xl">
            <Card>
              <CardHeader>
                <CardTitle>Owner alerts</CardTitle>
                <CardDescription>
                  Where RingBackSMS sends urgent handoffs, action items, and daily summaries.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Owner email</Label>
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
                    <p className="text-xs text-muted-foreground">Used for recaps, summaries, and backup alerts.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Owner phone for urgent SMS alerts</Label>
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
                    <p className="text-xs text-muted-foreground">Used when a conversation needs a human quickly.</p>
                  </div>
                </div>

                <div className="pt-4 border-t space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label>Daily summary email</Label>
                      <p className="text-xs text-muted-foreground">
                        Sends open action items and, when there was activity, a daily performance recap.
                      </p>
                    </div>
                    <Switch
                      checked={form.dailyDigestEnabled}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, dailyDigestEnabled: v }))}
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
                      <p className="text-xs text-muted-foreground">In your business timezone ({form.timezone}).</p>
                    </div>
                  )}
                  <RecapPreviewButton tenantId={tenantId} ownerEmail={form.ownerEmail} />
                </div>
              </CardContent>
            </Card>
          </TabPanel>

          <TabPanel value="operations" className="space-y-6 max-w-3xl">
            {profile.nav.showOrders && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Orders and payments
                  </CardTitle>
                  <CardDescription>
                    Controls customers placing orders by SMS. Leave payment off if you only collect at pickup.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label>Require upfront payment for orders</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Customers receive a Stripe payment link after placing an order.
                      </p>
                    </div>
                    <Switch
                      checked={form.requirePayment}
                      onCheckedChange={(v) => setForm(f => ({ ...f, requirePayment: v }))}
                    />
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <Label htmlFor="salesTaxRate">Sales tax rate (%)</Label>
                    <p className="text-xs text-muted-foreground">
                      Optional. Applied to every order as a separate sales tax line item.
                    </p>
                    <Input
                      id="salesTaxRate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="50"
                      placeholder="e.g. 9.75"
                      className="max-w-xs"
                      value={form.salesTaxRate != null ? (form.salesTaxRate * 100).toFixed(2) : ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setForm((f) => ({ ...f, salesTaxRate: null }));
                          return;
                        }
                        const pct = Number(raw);
                        if (!Number.isFinite(pct) || pct < 0 || pct > 50) return;
                        setForm((f) => ({ ...f, salesTaxRate: Math.round(pct * 10000) / 1000000 }));
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 border-t pt-4">
                    <div className="pr-4">
                      <Label>Pass Stripe processing fees to customer</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Advanced. Adds a processing fee line item so your net is closer to subtotal plus tax.
                      </p>
                    </div>
                    <Switch
                      checked={form.passStripeFeesToCustomer}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, passStripeFeesToCustomer: v }))}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {profile.nav.showPrepTime && (
              <PrepTimeCard form={form} setForm={setForm} timezone={form.timezone} />
            )}

          </TabPanel>

          <TabPanel value="advanced" className="space-y-6 max-w-3xl">
            <ReplyTemplatesCard tenantId={tenantId} />

            <Card>
              <CardHeader>
                <CardTitle>Voice greetings</CardTitle>
                <CardDescription>
                  Optional call audio controls. The defaults work for most businesses.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex items-start gap-3">
                  <Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium">Let AI write voice greetings for you</p>
                    <p className="text-xs text-blue-800 mt-0.5">
                      AI creates a normal greeting, an after-hours greeting, and shorter returning-caller versions.
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

                <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  Use <span className="font-mono">{'{business_name}'}</span>,{' '}
                  <span className="font-mono">{'{next_open}'}</span>,{' '}
                  <span className="font-mono">{'{today_hours}'}</span>, or{' '}
                  <span className="font-mono">{'{closes_at}'}</span> if you want the greeting to update automatically.
                </div>

                <div className="space-y-1.5">
                  <Label>Main voice greeting</Label>
                  <textarea
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
                    value={form.voiceGreeting}
                    maxLength={500}
                    onChange={(e) => setForm(f => ({ ...f, voiceGreeting: e.target.value }))}
                    placeholder="Hi, thanks for calling. We can help you faster by text..."
                  />
                  <p className="text-xs text-muted-foreground">
                    What callers hear before voicemail. Leave blank to use the default.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>Voice</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={form.voiceType}
                    onChange={(e) => setForm(f => ({ ...f, voiceType: e.target.value }))}
                  >
                    <optgroup label="OpenAI TTS">
                      <option value="nova">Nova (warm)</option>
                      <option value="alloy">Alloy (neutral)</option>
                      <option value="shimmer">Shimmer (bright)</option>
                      <option value="echo">Echo (warm)</option>
                      <option value="fable">Fable (British)</option>
                      <option value="onyx">Onyx (deep)</option>
                    </optgroup>
                    <optgroup label="Legacy">
                      <option value="Polly.Joanna-Neural">Joanna</option>
                      <option value="Polly.Matthew-Neural">Matthew</option>
                      <option value="Polly.Salli-Neural">Salli</option>
                      <option value="Polly.Ivy-Neural">Ivy</option>
                    </optgroup>
                  </select>
                </div>

                <div className="space-y-1.5 border-t pt-4">
                  <Label>After-hours voice greeting</Label>
                  <textarea
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px] resize-y"
                    value={form.voiceGreetingAfterHours}
                    maxLength={500}
                    onChange={(e) => setForm(f => ({ ...f, voiceGreetingAfterHours: e.target.value }))}
                    placeholder="Hi, you've reached {business_name}! We're closed right now..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                  <div className="space-y-1.5">
                    <Label>Rapid-redial greeting</Label>
                    <textarea
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[72px] resize-y"
                      value={form.voiceGreetingRapidRedial}
                      maxLength={500}
                      onChange={(e) => setForm(f => ({ ...f, voiceGreetingRapidRedial: e.target.value }))}
                      placeholder="Still here — check your texts."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Returning-caller greeting</Label>
                    <textarea
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[72px] resize-y"
                      value={form.voiceGreetingReturning}
                      maxLength={500}
                      onChange={(e) => setForm(f => ({ ...f, voiceGreetingReturning: e.target.value }))}
                      placeholder="Welcome back! We just texted you."
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Advanced alerts and filtering</CardTitle>
                <CardDescription>
                  Usually safe to leave alone unless you use Slack or need to tune call filtering.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-1.5">
                  <Label>Slack webhook URL</Label>
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
                  <p className="text-xs text-muted-foreground">
                    Optional. Sends team alerts to a Slack channel.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 border-t pt-4">
                  <div>
                    <Label>Spam and robocall filter</Label>
                    <p className="text-xs text-muted-foreground">
                      Blocks obvious bad numbers before they consume SMS quota. Turn off only if legitimate callers are being blocked.
                    </p>
                  </div>
                  <Switch
                    checked={form.spamFilterEnabled}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, spamFilterEnabled: v }))}
                  />
                </div>
              </CardContent>
            </Card>
          </TabPanel>

          <TabPanel value="team" className="space-y-6 max-w-3xl">
            {tenantId && <TeamCard tenantId={tenantId} />}
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
}

// ── Recap preview button ────────────────────────────────────────────────────
// Sends a one-off "what tomorrow's recap would look like" email so the
// operator doesn't have to wait until 8am to see the format. Reuses the
// same aggregator + template as the cron.

function RecapPreviewButton({
  tenantId,
  ownerEmail,
}: {
  tenantId: string | undefined;
  ownerEmail: string | null | undefined;
}) {
  const [sending, setSending] = useState(false);
  const send = async () => {
    if (!tenantId) return;
    setSending(true);
    try {
      const r = await fetch(`/api/tenants/${tenantId}/recap-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await r.json();
      if (!r.ok) {
        toast.error(body?.error ?? 'Preview failed');
      } else {
        toast.success(`Preview sent to ${body?.data?.sentTo ?? ownerEmail}`);
      }
    } catch (err) {
      toast.error((err as Error).message ?? 'Preview failed');
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="pt-3 border-t">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={send}
        disabled={sending || !tenantId || !ownerEmail}
      >
        {sending ? 'Sending…' : '📧 Send recap preview'}
      </Button>
      <p className="text-xs text-muted-foreground mt-1.5">
        Sends today's recap email immediately to{' '}
        {ownerEmail ?? 'your owner email'} so you can see what shows up
        every morning at your configured digest hour.
      </p>
    </div>
  );
}

// ── AI & Messaging card ─────────────────────────────────────────────────────

function AiMessagingCard({
  tenantId,
  businessName,
  businessType,
  form,
  setForm,
  initialBusinessLimits,
}: {
  tenantId: string;
  businessName: string;
  businessType: string | undefined;
  form: {
    followupOpener: string | null;
    consentMessage: string | null;
    customAiInstructions: string | null;
  };
  setForm: (fn: (f: any) => any) => void;
  initialBusinessLimits: Partial<BusinessLimits> | null;
}) {
  const queryClient = useQueryClient();
  const defaultConsentMessage = getDefaultConsentMessage(
    businessName || '{business_name}',
    businessType,
  );
  const consentPreview = form.consentMessage?.trim() || defaultConsentMessage;

  const [customAiInstructions, setCustomAiInstructions] = useState(form.customAiInstructions ?? '');
  const [businessLimits, setBusinessLimits] = useState<BusinessLimits>(
    normalizeBusinessLimits(initialBusinessLimits, businessType),
  );
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (form.customAiInstructions != null) {
      setCustomAiInstructions(form.customAiInstructions);
      setDirty(false); // Reset dirty flag when external data syncs in
    }
  }, [form.customAiInstructions]);

  useEffect(() => {
    setBusinessLimits(normalizeBusinessLimits(initialBusinessLimits, businessType));
    setDirty(false);
  }, [businessType, initialBusinessLimits]);

  const saveMutation = useMutation({
    mutationFn: () =>
      tenantApi.updateConfig(tenantId, {
        customAiInstructions,
        businessLimits,
        consentMessage: form.consentMessage?.trim() || null,
      }),
    onSuccess: () => {
      toast.success('AI settings saved');
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      setDirty(false);
    },
    onError: () => toast.error('Failed to save'),
  });

  const setLimit = (key: BusinessLimitKey, value: boolean) => {
    setBusinessLimits((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const limitRows = getBusinessLimitDefinitions(businessType);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          AI text messages
        </CardTitle>
        <CardDescription>
          New callers consent before AI texting starts. Returning consented callers can continue without repeating YES.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Consent request message</Label>
          <textarea
            value={form.consentMessage ?? ''}
            onChange={(e) => {
              setForm((current) => ({
                ...current,
                consentMessage: e.target.value.slice(0, 500),
              }));
              setDirty(true);
            }}
            rows={4}
            maxLength={500}
            className="w-full mt-2 p-3 border rounded-lg text-sm bg-background"
            placeholder={defaultConsentMessage}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {consentPreview.length} characters (500 maximum). Sent to new callers before the AI starts
            texting. Longer messages may use multiple SMS segments. Keep YES, STOP, and the
            message-and-data-rates disclosure.
          </p>
        </div>

        <div>
          <Label>Follow-up opener</Label>
          <textarea
            value={form.followupOpener ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, followupOpener: e.target.value.slice(0, 500) }))}
            rows={2}
            maxLength={500}
            className="w-full mt-1 p-2 border rounded-lg text-sm bg-background"
            placeholder={`Thanks! How can ${businessName || 'we'} help you today?`}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {(form.followupOpener ?? '').length} / 500 characters. Sent after a new caller replies YES, or when a returning consented caller reconnects.
          </p>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <Label>Business limits</Label>
          </div>
          <div className="mt-2 divide-y rounded-lg border">
            {limitRows.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-4 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="text-xs text-muted-foreground">{row.description}</p>
                </div>
                <Switch
                  checked={Boolean(businessLimits[row.key])}
                  onCheckedChange={(value) => setLimit(row.key, value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label>Custom AI instructions</Label>
          <textarea
            value={customAiInstructions}
            onChange={(e) => {
              setCustomAiInstructions(e.target.value.slice(0, 500));
              setForm((f) => ({ ...f, customAiInstructions: e.target.value.slice(0, 500) }));
              setDirty(true);
            }}
            rows={3}
            maxLength={500}
            className="w-full mt-1 p-2 border rounded-lg text-sm bg-background"
            placeholder={`e.g. "We close early on Sundays at 3pm"\n"Always mention our loyalty program after an order"\n"Never quote prices — always say 'prices vary, ask us'"`}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {customAiInstructions.length} / 500 characters. Use plain-language rules the assistant should always follow.
          </p>
          {dirty && (
            <Button
              size="sm"
              className="mt-2"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save AI Settings'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Team & Invite card ──────────────────────────────────────────────────────

function TeamCard({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('org:admin');

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-team', tenantId],
    queryFn: () => tenantApi.getTeam(tenantId),
  });

  const inviteMutation = useMutation({
    mutationFn: () => tenantApi.sendInvite(tenantId, inviteEmail.trim(), inviteRole),
    onSuccess: () => {
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: ['tenant-team', tenantId] });
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error ?? 'Failed to send invitation'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Team
        </CardTitle>
        <CardDescription>
          Invite the business owner or team members to manage this account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Invite form */}
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="owner@business.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="flex-1"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="org:admin">Admin</option>
            <option value="org:member">Member</option>
          </select>
          <Button
            onClick={() => inviteMutation.mutate()}
            disabled={inviteMutation.isPending || !inviteEmail.trim() || !inviteEmail.includes('@')}
            size="sm"
          >
            {inviteMutation.isPending ? 'Sending…' : 'Send Invite'}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading team…</p>
        ) : (
          <>
            {/* Current members */}
            {(data?.members?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Members</p>
                <div className="space-y-2">
                  {data?.members.map((m, i) => (
                    <div key={m.userId ?? i} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
                      <div>
                        <span className="font-medium">{m.name ?? m.email ?? 'Unknown'}</span>
                        {m.email && m.name && (
                          <span className="text-muted-foreground ml-2">{m.email}</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground capitalize">
                        {m.role?.replace('org:', '')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pending invitations */}
            {(data?.invitations?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Pending Invitations</p>
                <div className="space-y-2">
                  {data?.invitations
                    .filter((inv) => inv.status === 'pending')
                    .map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between text-sm border border-dashed rounded-lg px-3 py-2">
                        <span className="text-muted-foreground">{inv.email}</span>
                        <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                          Pending
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Prep time card ──────────────────────────────────────────────────────────

interface PrepTimeOverride {
  dayOfWeek: number;
  start: string;
  end: string;
  extraMinutes: number;
  label?: string;
}

function isOverrideActive(
  overrides: PrepTimeOverride[],
  timezone: string,
  now: Date = new Date(),
): PrepTimeOverride | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const currentDay = dayMap[wd] ?? 0;
    const currentMin = parseInt(hh, 10) * 60 + parseInt(mm, 10);
    for (const o of overrides) {
      if (o.dayOfWeek !== currentDay) continue;
      const [sH, sM] = o.start.split(':').map(Number);
      const [eH, eM] = o.end.split(':').map(Number);
      const sMin = sH * 60 + sM;
      const eMin = eH * 60 + eM;
      if (currentMin >= sMin && currentMin < eMin) return o;
    }
  } catch {}
  return null;
}

function PrepTimeCard({
  form,
  setForm,
  timezone,
}: {
  form: {
    defaultPrepTimeMinutes: number | null;
    largeOrderThresholdItems: number | null;
    largeOrderExtraMinutes: number | null;
    prepTimeOverrides: PrepTimeOverride[];
    ordersAcceptingEnabled: boolean;
  };
  setForm: (fn: (f: any) => any) => void;
  timezone: string;
}) {
  const overrides = form.prepTimeOverrides;
  const activeOverride = isOverrideActive(overrides, timezone);
  const base = form.defaultPrepTimeMinutes ?? 0;
  const extra = activeOverride?.extraMinutes ?? 0;

  const statusPill = !form.ordersAcceptingEnabled
    ? { label: 'Orders paused', cls: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200' }
    : activeOverride
      ? { label: `Override active · ${base + extra} min`, cls: 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/40 dark:text-amber-100' }
      : { label: `Normal prep time · ${base} min`, cls: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-200' };

  const addOverride = () => {
    setForm((f) => ({
      ...f,
      prepTimeOverrides: [
        ...f.prepTimeOverrides,
        { dayOfWeek: 1, start: '17:00', end: '20:00', extraMinutes: 15 },
      ],
    }));
  };
  const updateOverride = (idx: number, patch: Partial<PrepTimeOverride>) => {
    setForm((f) => ({
      ...f,
      prepTimeOverrides: f.prepTimeOverrides.map((o: PrepTimeOverride, i: number) =>
        i === idx ? { ...o, ...patch } : o,
      ),
    }));
  };
  const removeOverride = (idx: number) => {
    setForm((f) => ({
      ...f,
      prepTimeOverrides: f.prepTimeOverrides.filter((_: PrepTimeOverride, i: number) => i !== idx),
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Prep time
        </CardTitle>
        <CardDescription>
          How long it takes to prepare a typical order. Used for SMS ready-time estimates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${statusPill.cls}`}>
          {statusPill.label}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Default prep time</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={0}
                max={720}
                value={form.defaultPrepTimeMinutes ?? ''}
                placeholder="15"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    defaultPrepTimeMinutes:
                      e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                  }))
                }
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
          </div>

          <div>
            <Label>Large order extra time</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={0}
                max={720}
                value={form.largeOrderExtraMinutes ?? ''}
                placeholder="30"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    largeOrderExtraMinutes:
                      e.target.value === '' ? null : Math.max(0, Number(e.target.value)),
                  }))
                }
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
          </div>

          <div>
            <Label>Large order threshold</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={1}
                max={10000}
                value={form.largeOrderThresholdItems ?? ''}
                placeholder="50"
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    largeOrderThresholdItems:
                      e.target.value === '' ? null : Math.max(1, Number(e.target.value)),
                  }))
                }
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">items</span>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <Label>Prep time overrides</Label>
              <p className="text-xs text-muted-foreground">
                Add extra time during busy windows (e.g. Friday dinner rush).
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addOverride}>
              <Plus className="h-4 w-4 mr-1" /> Add window
            </Button>
          </div>
          {overrides.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No overrides set.</p>
          ) : (
            <div className="space-y-2">
              {overrides.map((o, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-2 rounded-lg border p-3 bg-muted/40"
                >
                  <select
                    value={o.dayOfWeek}
                    onChange={(e) => updateOverride(idx, { dayOfWeek: Number(e.target.value) })}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    {DAYS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.short}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="time"
                    value={o.start}
                    onChange={(e) => updateOverride(idx, { start: e.target.value })}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input
                    type="time"
                    value={o.end}
                    onChange={(e) => updateOverride(idx, { end: e.target.value })}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">+</span>
                  <Input
                    type="number"
                    min={0}
                    max={720}
                    value={o.extraMinutes}
                    onChange={(e) =>
                      updateOverride(idx, { extraMinutes: Math.max(0, Number(e.target.value)) })
                    }
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">min</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOverride(idx)}
                    className="ml-auto text-red-600 hover:text-red-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div>
            <Label>Accept SMS orders</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Turn this off to pause ordering. Customers will receive a &quot;we&apos;re not accepting orders right now&quot; reply.
            </p>
          </div>
          <Switch
            checked={form.ordersAcceptingEnabled}
            onCheckedChange={(v) => setForm((f) => ({ ...f, ordersAcceptingEnabled: v }))}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function PhoneNumberCard({
  tenantId,
  tenantName,
  tenantPhoneNumber,
}: {
  tenantId: string | undefined;
  tenantName?: string;
  tenantPhoneNumber?: string | null;
}) {
  const {
    data: phoneStatus,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['phone-status', tenantId],
    queryFn: () => phoneApi.getStatus(tenantId!),
    enabled: !!tenantId,
  });

  const knownPhoneNumber = tenantPhoneNumber?.trim() || null;
  const activePhoneNumber = phoneStatus?.phoneNumber ?? knownPhoneNumber;
  const hasPhoneNumber = Boolean(phoneStatus?.hasPhoneNumber || activePhoneNumber);
  const statusMismatch =
    !!knownPhoneNumber &&
    phoneStatus !== undefined &&
    phoneStatus.hasPhoneNumber === false;

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
        {isLoading && !knownPhoneNumber ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking phone number...
          </div>
        ) : isError && !knownPhoneNumber ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-sm text-amber-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="font-medium">Couldn&apos;t verify phone number.</p>
                <p className="text-muted-foreground">
                  Refresh this page or contact support before setting up a new number.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? 'Checking...' : 'Retry'}
            </Button>
          </div>
        ) : hasPhoneNumber ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-lg font-mono font-semibold">{activePhoneNumber}</span>
              <Badge variant="success">Active</Badge>
            </div>
            <Link href="/dashboard/settings/phone">
              <Button size="sm">
                <Phone className="h-4 w-4 mr-1.5" />
                Forward your number
              </Button>
            </Link>
            {(isError || statusMismatch) && (
              <p className="basis-full text-xs text-amber-700">
                {isError
                  ? 'Showing the number saved on the tenant record because live status could not refresh.'
                  : `The tenant record for ${tenantName ?? 'this business'} has a phone number, but live status did not confirm it.`}
              </p>
            )}
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
