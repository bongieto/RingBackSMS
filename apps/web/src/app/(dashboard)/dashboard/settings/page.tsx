'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { toast } from 'sonner';
import Link from 'next/link';
import { Phone } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { tenantApi, phoneApi } from '@/lib/api';

interface TenantConfig {
  id: string;
  greeting: string;
  timezone: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  businessDays: number[];
  aiPersonality: string | null;
  calcomLink: string | null;
  slackWebhook: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
}

const TIMEZONES = [
  'America/Chicago',
  'America/New_York',
  'America/Los_Angeles',
  'America/Denver',
  'America/Phoenix',
  'Pacific/Honolulu',
];

export default function SettingsPage() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;
  const queryClient = useQueryClient();

  const { data: tenant } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => tenantApi.getMe(),
    enabled: !!tenantId,
  });

  const config: TenantConfig | undefined = tenant?.config;

  const [form, setForm] = useState({
    greeting: '',
    timezone: 'America/Chicago',
    businessHoursStart: '11:00',
    businessHoursEnd: '20:00',
    businessDays: [1, 2, 3, 4, 5] as number[],
    aiPersonality: '',
    calcomLink: '',
    slackWebhook: '',
    ownerEmail: '',
    ownerPhone: '',
  });

  useEffect(() => {
    if (config) {
      setForm({
        greeting: config.greeting ?? '',
        timezone: config.timezone ?? 'America/Chicago',
        businessHoursStart: config.businessHoursStart ?? '11:00',
        businessHoursEnd: config.businessHoursEnd ?? '20:00',
        businessDays: config.businessDays ?? [1, 2, 3, 4, 5],
        aiPersonality: config.aiPersonality ?? '',
        calcomLink: config.calcomLink ?? '',
        slackWebhook: config.slackWebhook ?? '',
        ownerEmail: config.ownerEmail ?? '',
        ownerPhone: config.ownerPhone ?? '',
      });
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: () => tenantApi.updateConfig(tenantId!, {
      ...form,
      aiPersonality: form.aiPersonality || undefined,
      calcomLink: form.calcomLink || undefined,
      slackWebhook: form.slackWebhook || undefined,
      ownerEmail: form.ownerEmail || undefined,
      ownerPhone: form.ownerPhone || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
      toast.success('Settings saved!');
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const field = (key: keyof typeof form) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value })),
  });

  return (
    <div>
      <Header title="Settings" description="Configure your RingBack account" />

      <div className="space-y-6 max-w-2xl">
        {/* Phone Number */}
        <PhoneNumberCard tenantId={tenantId} />

        {/* Greeting */}
        <Card>
          <CardHeader>
            <CardTitle>Missed Call Greeting</CardTitle>
            <CardDescription>This SMS is sent immediately when a call is missed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Greeting Message</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[100px] resize-y"
                {...field('greeting')}
                placeholder="Hi! Sorry we missed your call..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Business Hours */}
        <Card>
          <CardHeader>
            <CardTitle>Business Hours</CardTitle>
            <CardDescription>When your business is open</CardDescription>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Opens</Label>
                <Input type="time" {...field('businessHoursStart')} />
              </div>
              <div className="space-y-1.5">
                <Label>Closes</Label>
                <Input type="time" {...field('businessHoursEnd')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Business Days</Label>
              <div className="flex gap-2">
                {[
                  { label: 'Sun', value: 0 },
                  { label: 'Mon', value: 1 },
                  { label: 'Tue', value: 2 },
                  { label: 'Wed', value: 3 },
                  { label: 'Thu', value: 4 },
                  { label: 'Fri', value: 5 },
                  { label: 'Sat', value: 6 },
                ].map((day) => {
                  const isActive = form.businessDays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          businessDays: isActive
                            ? f.businessDays.filter((d) => d !== day.value)
                            : [...f.businessDays, day.value],
                        }))
                      }
                      className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-input hover:bg-accent'
                      }`}
                    >
                      {day.label.charAt(0)}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Select the days your business is open</p>
            </div>
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
              <Input {...field('slackWebhook')} placeholder="https://hooks.slack.com/services/..." />
              <p className="text-xs text-muted-foreground">Receive notifications in your Slack channel</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Owner Email</Label>
                <Input type="email" {...field('ownerEmail')} placeholder="you@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Owner Phone (for SMS alerts)</Label>
                <Input {...field('ownerPhone')} placeholder="+12175551234" />
              </div>
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
