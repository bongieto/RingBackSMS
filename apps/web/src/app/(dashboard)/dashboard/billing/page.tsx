'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { CreditCard, Zap, TrendingUp, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { billingApi, tenantApi } from '@/lib/api';
import { PLAN_LIMITS, Plan } from '@ringback/shared-types';

const PLAN_PRICES: Record<string, string> = {
  STARTER: 'Free',
  GROWTH: '$49/mo',
  SCALE: '$149/mo',
  ENTERPRISE: 'Custom',
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

  const { data: tenant } = useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => tenantApi.getMe(),
    enabled: !!tenantId,
  });

  const currentPlan: Plan = (tenant?.plan as Plan) ?? Plan.STARTER;

  const checkoutMutation = useMutation({
    mutationFn: (plan: string) =>
      billingApi.createCheckout(
        tenantId!,
        plan,
        `${window.location.origin}/dashboard/billing?success=true`,
        `${window.location.origin}/dashboard/billing`
      ),
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: () => toast.error('Failed to start checkout'),
  });

  const portalMutation = useMutation({
    mutationFn: () =>
      billingApi.createPortal(tenantId!, `${window.location.origin}/dashboard/billing`),
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
    onError: () => toast.error('Failed to open billing portal'),
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
              <Badge>{PLAN_PRICES[currentPlan]}</Badge>
            </div>
          </div>
          <CreditCard className="h-10 w-10 text-blue-400" />
        </CardContent>
      </Card>

      {/* Plan Cards */}
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
                  {PLAN_PRICES[plan]}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="text-muted-foreground">
                  <div>{limits.smsPerMonth.toLocaleString()} SMS/mo</div>
                  <div>{limits.aiCallsPerMonth.toLocaleString()} AI calls/mo</div>
                  <div>{limits.squareIntegration ? '✓ Square' : '✗ Square'}</div>
                  <div>{limits.calcomIntegration ? '✓ Cal.com' : '✗ Cal.com'}</div>
                </div>
                {!isCurrent && plan !== Plan.ENTERPRISE && (
                  <Button
                    className="w-full mt-3"
                    size="sm"
                    onClick={() => checkoutMutation.mutate(plan)}
                    disabled={checkoutMutation.isPending}
                  >
                    {plan === Plan.STARTER ? 'Downgrade' : 'Upgrade'}
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
    </div>
  );
}
