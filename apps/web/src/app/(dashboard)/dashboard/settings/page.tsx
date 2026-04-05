'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { tenantApi } from '@/lib/api';

interface TenantConfig {
  id: string;
  greeting: string;
  timezone: string;
  businessHoursStart: string;
  businessHoursEnd: string;
  aiPersonality: string | null;
  calcomLink: string | null;
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
    aiPersonality: '',
    calcomLink: '',
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
        aiPersonality: config.aiPersonality ?? '',
        calcomLink: config.calcomLink ?? '',
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
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value })),
  });

  return (
    <div>
      <Header title="Settings" description="Configure your RingBack account" />

      <div className="space-y-6 max-w-2xl">
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
