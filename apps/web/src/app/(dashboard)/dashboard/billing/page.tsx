'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { CreditCard, Zap, TrendingUp, Building2, MessageSquare, Bot, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { billingApi, tenantApi, analyticsApi } from '@/lib/api';
import { PLAN_LIMITS, Plan } from '@ringback/shared-types';

const PLAN_PRICES: Record<string, { monthly: string; annual: string }> = {
  STARTER: { monthly: 'Free', annual: 'Free' },
  GROWTH: { monthly: '$79/mo', annual: '$790/yr' },
  SCALE: { monthly: '$199/mo', annual: '$1,990/yr' },
  ENTERPRISE: { monthly: 'Custom', annual: 'Custom' },
};

const ANNUAL_SAVINGS: Record<string, string> = {
  GROWTH: '$158',
  SCALE: '$398',
};

const PLAN_ICONS: Record<string, React.ElementType> = {
  STARTER: Zap,
  GROWTH: TrendingUp,
  SCALE: Building2,
  ENTERPRISE: Building2,
};

export default function BillingPage() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');

  const { data: tenant, isLoading: tenantLoading } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => tenantApi.getMe(),
    enabled: !!tenantId,
  });

  const currentPlan: Plan = (tenant?.plan as Plan) ?? Plan.STARTER;
  const limits = PLAN_LIMITS[currentPlan];

  const { data: analytics } = useQuery({
    queryKey: ['analytics', tenantId, 30],
    queryFn: () => analyticsApi.get(tenantId!, 30),
    enabled: !!tenantId,
  });

  const smsUsed = (analytics?.monthUsage?.SMS_SENT as number) ?? 0;
  const aiUsed = (analytics?.monthUsage?.AI_CALL as number) ?? 0;
  const contactCount = (analytics?.contactCount as number) ?? 0;

  // Track which specific plan is currently being upgraded so only that
  // card shows the loading state. Shared mutation.isPending would
  // disable every Upgrade button at once.
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const checkoutMutation = useMutation({
    mutationFn: ({ plan, interval }: { plan: string; interval: 'monthly' | 'annual' }) =>
      billingApi.createCheckout(
        tenantId!,
        plan,
        `${window.location.origin}/dashboard/billing?success=true`,
        `${window.location.origin}/dashboard/billing`,
        interval
      ),
    onMutate: ({ plan }) => {
      setPendingPlan(plan);
    },
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: (err: any) => {
      setPendingPlan(null);
      toast.error(err?.response?.data?.error ?? 'Failed to start checkout');
    },
  });

  const portalMutation = useMutation({
    mutationFn: () =>
      billingApi.createPortal(tenantId!, `${window.location.origin}/dashboard/billing`),
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to open billing portal'),
  });

  return (
    <div>
      <Header
        title="Billing"
        description="Manage your plan and usage"
        action={
          currentPlan !== Plan.STARTER && (
            <Button variant="outline" onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending}>
              <CreditCard className="h-4 w-4 mr-2" />
              Manage Billing
            </Button>
          )
        }
      />

      {/* Current Plan */}
      <Card className="mb-8 border-blue-200 bg-blue-50/50">
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Current Plan</p>
            <div className="flex items-center gap-2 mt-1">
              <h2 className="text-2xl font-bold">{currentPlan}</h2>
              <Badge>{PLAN_PRICES[currentPlan].monthly}</Badge>
            </div>
          </div>
          <CreditCard className="h-10 w-10 text-blue-400" />
        </CardContent>
      </Card>

      {/* Current Month Usage */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">This Month&apos;s Usage</CardTitle>
          <CardDescription>Your usage resets at the start of each billing cycle</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <UsageMeter
              icon={MessageSquare}
              label="SMS Sent"
              used={smsUsed}
              limit={limits.smsPerMonth}
            />
            <UsageMeter
              icon={Bot}
              label="AI Calls"
              used={aiUsed}
              limit={limits.aiCallsPerMonth}
            />
            <UsageMeter
              icon={Users}
              label="Contacts"
              used={contactCount}
              limit={null}
            />
          </div>
        </CardContent>
      </Card>

      {/* Billing Interval Toggle */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <span className={`text-sm font-medium ${billingInterval === 'monthly' ? 'text-foreground' : 'text-muted-foreground'}`}>
          Monthly
        </span>
        <button
          onClick={() => setBillingInterval(billingInterval === 'monthly' ? 'annual' : 'monthly')}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            billingInterval === 'annual' ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            billingInterval === 'annual' ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
        <span className={`text-sm font-medium ${billingInterval === 'annual' ? 'text-foreground' : 'text-muted-foreground'}`}>
          Annual
        </span>
        <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">2 months free</Badge>
      </div>

      {/* Plan Cards */}
      {tenantLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-3"><div className="h-20 bg-muted rounded" /></CardHeader>
              <CardContent><div className="h-24 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.values(Plan) as Plan[]).map(plan => {
          const limits = PLAN_LIMITS[plan];
          const Icon = PLAN_ICONS[plan] ?? Zap;
          const isCurrent = plan === currentPlan;

          return (
            <Card key={plan} className={isCurrent ? 'ring-2 ring-blue-500' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-blue-500" />
                  {isCurrent && <Badge variant="secondary">Current</Badge>}
                </div>
                <CardTitle className="text-lg">{plan}</CardTitle>
                <CardDescription className="text-xl font-bold text-foreground">
                  {PLAN_PRICES[plan][billingInterval]}
                  {billingInterval === 'annual' && ANNUAL_SAVINGS[plan] && (
                    <span className="text-xs font-medium text-green-600 ml-2">Save {ANNUAL_SAVINGS[plan]}</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="text-muted-foreground">
                  <div>{limits.smsPerMonth.toLocaleString()} SMS/mo</div>
                  <div>{limits.aiCallsPerMonth.toLocaleString()} AI calls/mo</div>
                  <div>{limits.squareIntegration ? '✓ POS Integration' : '✗ POS Integration'}</div>
                  <div>{limits.calcomIntegration ? '✓ Cal.com' : '✗ Cal.com'}</div>
                </div>
                {!isCurrent && plan !== Plan.ENTERPRISE && plan !== Plan.STARTER && (
                  <Button
                    className="w-full mt-3"
                    size="sm"
                    onClick={() => checkoutMutation.mutate({ plan, interval: billingInterval })}
                    disabled={checkoutMutation.isPending}
                  >
                    {pendingPlan === plan ? 'Opening checkout…' : 'Upgrade'}
                  </Button>
                )}
                {!isCurrent && plan === Plan.STARTER && currentPlan !== Plan.STARTER && (
                  <Button
                    variant="outline"
                    className="w-full mt-3"
                    size="sm"
                    onClick={() => portalMutation.mutate()}
                    disabled={portalMutation.isPending}
                  >
                    Downgrade via Portal
                  </Button>
                )}
                {plan === Plan.ENTERPRISE && !isCurrent && (
                  <Button variant="outline" className="w-full mt-3" size="sm" asChild>
                    <a href="mailto:sales@ringback.app">Contact Sales</a>
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      )}
    </div>
  );
}

function UsageMeter({ icon: Icon, label, used, limit }: {
  icon: React.ElementType;
  label: string;
  used: number;
  limit: number | null;
}) {
  const percentage = limit ? Math.min((used / limit) * 100, 100) : 0;
  const isWarning = limit ? percentage >= 80 : false;
  const isOver = limit ? percentage >= 100 : false;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
        </div>
        <span className={`text-sm font-mono ${isOver ? 'text-red-600' : isWarning ? 'text-orange-500' : 'text-muted-foreground'}`}>
          {used.toLocaleString()}{limit ? ` / ${limit.toLocaleString()}` : ''}
        </span>
      </div>
      {limit && (
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : isWarning ? 'bg-orange-400' : 'bg-blue-500'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}
