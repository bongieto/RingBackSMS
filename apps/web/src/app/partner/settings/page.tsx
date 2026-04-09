'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import api from '@/lib/api';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function PartnerSettingsPage() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const connectStatus = params.get('connect');

  const { data, isLoading } = useQuery<any>({
    queryKey: ['agency-me'],
    queryFn: () => api.get('/agency/me').then((r) => r.data.data),
  });

  const onboardMutation = useMutation({
    mutationFn: () => api.post('/agency/connect/onboard').then((r) => r.data.data),
    onSuccess: (res: { url: string }) => {
      window.location.href = res.url;
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error ?? 'Failed to start onboarding'),
  });

  useEffect(() => {
    if (connectStatus === 'success') {
      toast.success('Stripe Connect onboarding complete');
      qc.invalidateQueries({ queryKey: ['agency-me'] });
    }
  }, [connectStatus, qc]);

  if (isLoading || !data) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white mb-8">Settings</h1>
        <div className="animate-pulse h-48 bg-slate-900 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">
          Manage your agency profile and payout method.
        </p>
      </div>

      <Card className="bg-slate-900 border-slate-800 mb-4">
        <CardHeader>
          <CardTitle className="text-white text-base">Agency profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Name" value={data.name ?? '—'} />
          <Row label="Revenue share" value={`${data.defaultRevSharePct}%`} />
          <p className="text-xs text-slate-500">
            The platform admin controls your revenue-share percentage. Contact
            support@ringbacksms.com to discuss a custom rate.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800 mb-4">
        <CardHeader>
          <CardTitle className="text-white text-base">Payouts (Stripe Connect)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {data.stripeConnectOnboarded ? (
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-white font-medium">Payouts connected</div>
                <div className="text-slate-400 text-xs">
                  {data.bankLast4
                    ? `Bank account ending in •••• ${data.bankLast4}`
                    : 'Connected via Stripe'}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 border-slate-700 text-slate-300"
                  disabled={onboardMutation.isPending}
                  onClick={() => onboardMutation.mutate()}
                >
                  Update bank account
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-white font-medium">
                  Connect your bank account to receive payouts
                </div>
                <div className="text-slate-400 text-xs mb-3">
                  We use Stripe Connect to securely transfer your commissions.
                  This takes about 2 minutes.
                </div>
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={onboardMutation.isPending}
                  onClick={() => onboardMutation.mutate()}
                >
                  {onboardMutation.isPending ? 'Starting…' : 'Set up payouts'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white text-base">Payout schedule</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-400">
          Payouts are issued on the 1st of each month for balances over $10.00.
          Balances under $10.00 carry over to the next month.
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-800 pb-2 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}
