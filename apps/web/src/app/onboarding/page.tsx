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
      // Update voice greeting if customized
      if (form.voiceGreeting) {
        await webApi.patch(`/tenants/${tenant.id}/config`, { voiceGreeting: form.voiceGreeting });
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
        {step === 2 && (
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
                <Label>Voice Greeting (optional)</Label>
                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[100px] resize-y"
                  value={form.voiceGreeting}
                  onChange={e => setForm(f => ({ ...f, voiceGreeting: e.target.value }))}
                  placeholder={`Hi, you've reached ${form.name || 'us'}! We'll text you back in just a moment, or feel free to leave a voicemail and we'll get right back to you.`}
                />
                <p className="text-xs text-muted-foreground">Spoken aloud via text-to-speech. Leave blank for a default greeting.</p>
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
        )}

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
                  {form.name} is now on RingBackSMS. Your AI assistant is ready to handle missed calls.
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4 text-left space-y-2 text-sm">
                <p className="font-medium">Next steps:</p>
                {profile.onboardingNextSteps.map((s) => (
                  <p key={s.title}>
                    {s.emoji} <strong>{s.title}</strong> — {s.description}
                  </p>
                ))}
              </div>
              <Button className="w-full" size="lg" onClick={() => router.push('/dashboard')}>
                Go to Dashboard →
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
