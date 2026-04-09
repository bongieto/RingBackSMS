'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';

export default function BecomeAPartnerPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const [form, setForm] = useState({ companyName: '', website: '', pitch: '' });

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-up?redirect=/become-a-partner');
    }
  }, [isLoaded, isSignedIn, router]);

  const { data: existing } = useQuery<any>({
    queryKey: ['agency-apply', 'me'],
    queryFn: () => api.get('/agency/apply').then((r) => r.data.data),
    enabled: Boolean(isSignedIn),
  });

  const submit = useMutation({
    mutationFn: () => api.post('/agency/apply', form).then((r) => r.data.data),
    onSuccess: () => toast.success('Application submitted — we\'ll be in touch.'),
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to submit'),
  });

  if (!isLoaded) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Become a RingbackSMS Partner</h1>
        <p className="text-slate-400 mb-8">
          Earn 20%+ recurring revenue share on every client you bring to the
          platform. Apply below and we&apos;ll review within 2 business days.
        </p>

        {existing?.status === 'APPROVED' ? (
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-6 text-center">
              <p className="text-green-400 font-medium mb-3">
                You&apos;re already an approved partner.
              </p>
              <Button onClick={() => router.push('/partner/overview')}>
                Go to your partner dashboard
              </Button>
            </CardContent>
          </Card>
        ) : existing?.status === 'PENDING' ? (
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-6">
              <p className="text-yellow-400 font-medium mb-2">Application pending</p>
              <p className="text-slate-400 text-sm">
                We received your application and will review it within 2 business
                days. You&apos;ll receive an email at the address on your account.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-base">Apply</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (form.pitch.trim().length < 20) {
                    toast.error('Please tell us a bit more (at least 20 characters)');
                    return;
                  }
                  submit.mutate();
                }}
                className="space-y-4"
              >
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Company / agency name (optional)
                  </label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Website (optional)
                  </label>
                  <input
                    type="url"
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    placeholder="https://"
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Tell us about your business and the clients you&apos;d bring *
                  </label>
                  <textarea
                    value={form.pitch}
                    onChange={(e) => setForm({ ...form, pitch: e.target.value })}
                    rows={6}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white"
                    placeholder="Who are your clients? How many do you manage? Why do you want to partner with RingbackSMS?"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submit.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {submit.isPending ? 'Submitting…' : 'Submit application'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
