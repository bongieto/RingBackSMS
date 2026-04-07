'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization, useUser } from '@clerk/nextjs';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Phone, MessageSquare, Check, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { getProfile } from '@/lib/businessTypeProfile';
import type { BusinessType } from '@ringback/shared-types';

const BUSINESS_TYPES = [
  { value: 'RESTAURANT', label: 'Restaurant / Food', emoji: '🍜' },
  { value: 'SERVICE', label: 'Service Business', emoji: '🔧' },
  { value: 'CONSULTANT', label: 'Consultant', emoji: '💼' },
  { value: 'MEDICAL', label: 'Medical / Health', emoji: '🏥' },
  { value: 'RETAIL', label: 'Retail', emoji: '🛍️' },
  { value: 'OTHER', label: 'Other', emoji: '✨' },
];

const STEPS = [
  { id: 1, title: 'Business Info', icon: Building2 },
  { id: 2, title: 'Your Greeting', icon: MessageSquare },
  { id: 3, title: "You're All Set", icon: Check },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const { organization } = useOrganization();
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    name: organization?.name ?? '',
    businessType: '',
    ownerEmail: user?.emailAddresses[0]?.emailAddress ?? '',
    ownerPhone: '',
    greeting: '',
    timezone: 'America/Chicago',
  });

  const createTenantMutation = useMutation({
    mutationFn: () =>
      api.post('/tenants', {
        name: form.name,
        businessType: form.businessType,
        ownerEmail: form.ownerEmail,
        ownerPhone: form.ownerPhone,
        timezone: form.timezone,
        clerkOrgId: organization?.id,
      }).then(r => r.data.data),
    onSuccess: async (tenant) => {
      // Update greeting if customized
      if (form.greeting) {
        await api.patch(`/tenants/${tenant.id}/config`, { greeting: form.greeting });
      }
      toast.success('Account created! Welcome to RingBackSMS 🎉');
      setStep(3);
    },
    onError: () => toast.error('Setup failed. Please try again.'),
  });

  const profile = getProfile(form.businessType as BusinessType);
  const defaultGreeting = form.name ? profile.defaultGreeting(form.name) : '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold">
            RingBack<span className="text-blue-500">SMS</span>
          </h1>
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
                  {BUSINESS_TYPES.map(bt => (
                    <button
                      key={bt.value}
                      onClick={() => setForm(f => ({ ...f, businessType: bt.value }))}
                      className={cn(
                        'flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-sm transition-colors',
                        form.businessType === bt.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-border hover:border-blue-200 hover:bg-muted/50'
                      )}
                    >
                      <span className="text-xl">{bt.emoji}</span>
                      <span className="font-medium text-xs text-center">{bt.label}</span>
                    </button>
                  ))}
                </div>
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

        {/* Step 2: Greeting */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Set your missed-call greeting</CardTitle>
              <CardDescription>This SMS is sent automatically when a call is missed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Preview</p>
                <p>{form.greeting || defaultGreeting || 'Your greeting will appear here...'}</p>
              </div>

              <div className="space-y-1.5">
                <Label>Custom Greeting (optional)</Label>
                <textarea
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[100px] resize-y"
                  value={form.greeting}
                  onChange={e => setForm(f => ({ ...f, greeting: e.target.value }))}
                  placeholder={defaultGreeting}
                />
                <p className="text-xs text-muted-foreground">Leave blank to use the suggested greeting above</p>
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
