'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOrganization, useUser } from '@clerk/nextjs';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Phone, MessageSquare, Check, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { webApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/Logo';
import { getProfile } from '@/lib/businessTypeProfile';
import type { BusinessType } from '@ringback/shared-types';

const BUSINESS_TYPES = [
  { value: 'RESTAURANT', label: 'Restaurant / Food', emoji: '🍜', templateKey: 'restaurant' },
  { value: 'FOOD_TRUCK', label: 'Food Truck', emoji: '🚚', templateKey: 'food_truck' },
  { value: 'SERVICE', label: 'Service Business', emoji: '🔧', templateKey: 'salon' },
  { value: 'CONSULTANT', label: 'Consultant', emoji: '💼', templateKey: 'consultant' },
  { value: 'MEDICAL', label: 'Medical / Health', emoji: '🏥', templateKey: 'medical' },
  { value: 'RETAIL', label: 'Retail', emoji: '🛍️', templateKey: 'retail' },
  { value: 'OTHER', label: 'Other', emoji: '✨', templateKey: null },
];

interface IndustryTemplate {
  industryKey: string;
  industryLabel: string;
  capabilityList: string[];
  followupOpenerDefault: string;
  voiceGreetingDefault: string | null;
}

const STEPS = [
  { id: 1, title: 'Business Info', icon: Building2 },
  { id: 2, title: 'Your Greeting', icon: MessageSquare },
  { id: 3, title: "You're All Set", icon: Check },
];

const INDUSTRY_TO_BUSINESS_TYPE: Record<string, string> = {
  restaurants: 'RESTAURANT',
  'service-businesses': 'SERVICE',
  retail: 'RETAIL',
};

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const { organization } = useOrganization();
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    name: organization?.name ?? '',
    businessType: '',
    ownerEmail: user?.emailAddresses[0]?.emailAddress ?? '',
    ownerPhone: '',
    websiteUrl: '',
    hoursPreset: '' as '' | 'weekday-9-5' | 'daily-11-9' | 'custom',
    voiceGreeting: '',
    timezone: 'America/Chicago',
  });

  // Fetch industry templates for capability pills on business type cards
  const { data: templates } = useQuery<IndustryTemplate[]>({
    queryKey: ['industry-templates'],
    queryFn: () => webApi.get('/industry-templates').then(r => r.data.data),
    staleTime: Infinity,
  });

  // Build a lookup map: templateKey → template
  const templateMap = new Map(
    (templates ?? []).map(t => [t.industryKey, t])
  );

  // Preselect business type from ?industry= query param (set by industry landing pages).
  useEffect(() => {
    const industry = searchParams?.get('industry');
    if (!industry) return;
    const bt = INDUSTRY_TO_BUSINESS_TYPE[industry];
    if (bt) setForm((f) => (f.businessType ? f : { ...f, businessType: bt }));
  }, [searchParams]);

  const createTenantMutation = useMutation({
    mutationFn: () =>
      webApi.post('/tenants', {
        name: form.name,
        businessType: form.businessType,
        ownerEmail: form.ownerEmail,
        ownerPhone: form.ownerPhone,
        timezone: form.timezone,
        clerkOrgId: organization?.id,
      }).then(r => r.data.data),
    onSuccess: async (tenant) => {
      // PATCH any optional config the user filled in. Each field is
      // independent — failures here don't block onboarding, the user
      // can always finish in Settings. Setting websiteUrl triggers
      // background context extraction (see updateTenantConfig).
      const configPatch: Record<string, unknown> = {};
      if (form.voiceGreeting) configPatch.voiceGreeting = form.voiceGreeting;
      if (form.websiteUrl) configPatch.websiteUrl = form.websiteUrl;
      if (form.hoursPreset === 'weekday-9-5') {
        configPatch.businessDays = [1, 2, 3, 4, 5];
        configPatch.businessHoursStart = '09:00';
        configPatch.businessHoursEnd = '17:00';
      } else if (form.hoursPreset === 'daily-11-9') {
        configPatch.businessDays = [0, 1, 2, 3, 4, 5, 6];
        configPatch.businessHoursStart = '11:00';
        configPatch.businessHoursEnd = '21:00';
      }
      if (Object.keys(configPatch).length > 0) {
        try {
          await webApi.patch(`/tenants/${tenant.id}/config`, configPatch);
        } catch {
          // Silently continue — tenant was created, config can be set in Settings
        }
      }
      toast.success('Account created! Welcome to RingBackSMS 🎉');
      setStep(3);
    },
    onError: () => toast.error('Setup failed. Please try again.'),
  });

  const profile = getProfile(form.businessType as BusinessType);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <Logo size="lg" variant="light" href={null} />
          <p className="text-muted-foreground mt-1">Let's get you set up in 2 minutes</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className={cn(
                'h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
                step > s.id ? 'bg-green-500 text-white' : step === s.id ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground'
              )}>
                {step > s.id ? <Check className="h-4 w-4" /> : s.id}
              </div>
              <span className={cn('text-sm hidden sm:block', step === s.id ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                {s.title}
              </span>
              {i < STEPS.length - 1 && <div className="h-px w-8 bg-border" />}
            </div>
          ))}
        </div>

        {/* Step 1: Business Info */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Tell us about your business</CardTitle>
              <CardDescription>This helps us personalize your AI responses</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Business Name *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="The Lumpia House & Truck"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Business Type *</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {BUSINESS_TYPES.map(bt => {
                    const tpl = bt.templateKey ? templateMap.get(bt.templateKey) : null;
                    const caps = tpl?.capabilityList?.slice(0, 3) ?? [];
                    const isSelected = form.businessType === bt.value;
                    return (
                      <button
                        key={bt.value}
                        onClick={() => setForm(f => ({ ...f, businessType: bt.value }))}
                        className={cn(
                          'flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-sm transition-colors text-left',
                          isSelected
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-border hover:border-blue-200 hover:bg-muted/50'
                        )}
                      >
                        <span className="text-2xl">{bt.emoji}</span>
                        <span className="font-medium text-xs text-center">{bt.label}</span>
                        {caps.length > 0 && (
                          <div className="flex flex-wrap justify-center gap-1 mt-0.5">
                            {caps.map(c => (
                              <span key={c} className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded-full',
                                isSelected ? 'bg-blue-100 text-blue-600' : 'bg-muted text-muted-foreground'
                              )}>{c}</span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* Follow-up opener preview when a type with a template is selected */}
                {form.businessType && (() => {
                  const selectedBt = BUSINESS_TYPES.find(b => b.value === form.businessType);
                  const tpl = selectedBt?.templateKey ? templateMap.get(selectedBt.templateKey) : null;
                  if (!tpl) return null;
                  const opener = form.name
                    ? tpl.followupOpenerDefault.replace(/\{business_name\}/gi, form.name)
                    : tpl.followupOpenerDefault;
                  return (
                    <div className="mt-2 p-2.5 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                      <span className="font-medium">AI follow-up opener:</span>{' '}
                      <span className="italic">&ldquo;{opener}&rdquo;</span>
                    </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Your Email</Label>
                  <Input
                    type="email"
                    value={form.ownerEmail}
                    onChange={e => setForm(f => ({ ...f, ownerEmail: e.target.value }))}
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Your Phone</Label>
                  <Input
                    value={form.ownerPhone}
                    onChange={e => setForm(f => ({ ...f, ownerPhone: e.target.value }))}
                    placeholder="+12175551234"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Website URL <span className="text-muted-foreground font-normal">(optional, recommended)</span></Label>
                <Input
                  value={form.websiteUrl}
                  onChange={e => setForm(f => ({ ...f, websiteUrl: e.target.value }))}
                  placeholder="https://yourbusiness.com"
                />
                <p className="text-xs text-muted-foreground">We'll read your homepage to ground the bot's replies in your actual services and pricing.</p>
              </div>

              <Button
                className="w-full"
                onClick={() => setStep(2)}
                disabled={!form.name || !form.businessType}
              >
                Continue →
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Voice Greeting */}
        {step === 2 && (() => {
          const selectedBt = BUSINESS_TYPES.find(b => b.value === form.businessType);
          const tpl = selectedBt?.templateKey ? templateMap.get(selectedBt.templateKey) : null;
          const defaultVoiceGreeting = tpl?.voiceGreetingDefault
            ? tpl.voiceGreetingDefault.replace(/\{business_name\}/gi, form.name || '{business name}')
            : `Hi, you've reached ${form.name || 'us'}! We'll text you back in just a moment, or feel free to leave a voicemail and we'll get right back to you.`;

          return (
          <Card>
            <CardHeader>
              <CardTitle>Set your voice greeting</CardTitle>
              <CardDescription>This is what callers hear via text-to-speech before voicemail</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Consent SMS preview (read-only) */}
              <div className="p-3 bg-green-50 border border-green-100 rounded-lg text-sm">
                <p className="font-medium text-green-800 mb-1">📱 Your first SMS to callers (automatic)</p>
                <p className="text-green-700 text-xs">
                  {`Hey! ${form.name || '{business name}'} here — we just missed your call and we're sorry about that! I can help you via text if you want. Reply YES to go ahead or STOP to opt out. Msg & data rates may apply.`}
                </p>
                <p className="text-[10px] text-green-600 mt-1">This message is standardized for TCPA compliance and cannot be edited.</p>
              </div>

              <div className="space-y-1.5">
                <Label>Business hours</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'weekday-9-5', label: 'Mon–Fri 9–5', sub: 'Service businesses' },
                    { key: 'daily-11-9', label: 'Daily 11–9', sub: 'Restaurants' },
                    { key: 'custom', label: 'Set later', sub: 'I’ll configure in Settings' },
                  ].map((p) => {
                    const selected = form.hoursPreset === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, hoursPreset: p.key as typeof f.hoursPreset }))}
                        className={cn(
                          'flex flex-col items-center gap-0.5 p-2.5 rounded-lg border-2 text-xs transition-colors text-center',
                          selected
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-border hover:border-blue-200 hover:bg-muted/50'
                        )}
                      >
                        <span className="font-medium">{p.label}</span>
                        <span className="text-[10px] text-muted-foreground">{p.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Voice Greeting</Label>
                <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">🔊 Preview</p>
                  <p>{form.voiceGreeting || defaultVoiceGreeting}</p>
                </div>
                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[100px] resize-y"
                  value={form.voiceGreeting}
                  onChange={e => setForm(f => ({ ...f, voiceGreeting: e.target.value }))}
                  placeholder={defaultVoiceGreeting}
                />
                <p className="text-xs text-muted-foreground">Edit to customize, or leave blank to use the suggested greeting above.</p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                  ← Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => createTenantMutation.mutate()}
                  disabled={createTenantMutation.isPending}
                >
                  {createTenantMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Setting up...</>
                  ) : (
                    'Finish Setup →'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
          );
        })()}

        {/* Step 3: Done */}
        {step === 3 && (
          <Card>
            <CardContent className="p-8 text-center space-y-6">
              <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <Check className="h-10 w-10 text-green-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">You're all set! 🎉</h2>
                <p className="text-muted-foreground mt-2">
                  {form.name} is now on RingBackSMS. One more step before the bot starts working.
                </p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left space-y-2">
                <p className="font-semibold text-amber-900 text-sm">⚠️ Forward your calls to start receiving SMS</p>
                <p className="text-xs text-amber-800">
                  Until you forward your phone number to RingBackSMS, missed calls won't trigger an SMS reply.
                  This takes about 60 seconds — we'll guide you through your carrier's setup.
                </p>
                <Button
                  className="w-full mt-2 bg-amber-600 hover:bg-amber-700"
                  onClick={() => router.push('/dashboard/settings/phone')}
                >
                  Set up call forwarding →
                </Button>
              </div>
              <div className="bg-muted/50 rounded-lg p-4 text-left space-y-2 text-sm">
                <p className="font-medium">Then:</p>
                {profile.onboardingNextSteps.map((s) => (
                  <p key={s.title}>
                    {s.emoji} <strong>{s.title}</strong> — {s.description}
                  </p>
                ))}
              </div>
              <Button variant="outline" className="w-full" onClick={() => router.push('/dashboard')}>
                Skip for now — go to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
