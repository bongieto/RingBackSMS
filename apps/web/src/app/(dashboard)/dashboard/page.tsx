'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calendar,
  Clock,
  DollarSign,
  HelpCircle,
  MessageSquare,
  Phone,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { PosStatusCard } from '@/components/dashboard/PosStatusCard';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ActionItemsCard } from '@/components/dashboard/ActionItemsCard';
import { Badge } from '@/components/ui/badge';
import { analyticsApi, conversationApi, tenantApi } from '@/lib/api';
import { formatRelativeTime, maskPhone } from '@/lib/utils';
import { getProfile } from '@/lib/businessTypeProfile';
import { useTenantId } from '@/components/providers/TenantProvider';

interface ValueMetrics {
  missedCallsRecovered: number;
  appointmentsBooked: number;
  quoteRequestsCaptured: number;
  emergenciesEscalated: number;
  ordersPlaced: number;
  estimatedRevenueDollars: number;
  avgResponseTimeSeconds: number;
  unresolvedUrgentLeads: number;
}

interface ValueMetricCard {
  key: string;
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor: string;
  change: string;
  changeType?: 'positive' | 'negative' | 'neutral';
}

function formatDollars(value: number): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatResponseTime(seconds: number): string {
  if (seconds <= 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

export default function DashboardPage() {
  const { tenantId } = useTenantId();

  const { data: analytics } = useQuery({
    queryKey: ['analytics', tenantId],
    queryFn: () => analyticsApi.get(tenantId!, 30),
    enabled: !!tenantId,
  });

  const { data: conversationsData } = useQuery({
    queryKey: ['conversations', tenantId, 'recent'],
    queryFn: () => conversationApi.list(tenantId!, { pageSize: 5, isActive: true }),
    enabled: !!tenantId,
  });

  const { data: tenant } = useQuery({
    queryKey: ['tenant-me'],
    queryFn: () => tenantApi.getMe(),
  });

  const recentConversations = conversationsData?.data ?? [];
  const profile = getProfile((tenant as { businessType?: string } | undefined)?.businessType);
  const showCard = (key: string) => profile.dashboardCards.includes(key as never);
  const valueMetrics = analytics?.valueMetrics as ValueMetrics | undefined;
  const revenueDollars =
    valueMetrics?.estimatedRevenueDollars ?? ((analytics?.revenue as number | undefined) ?? 0);
  const valueCards: ValueMetricCard[] = [
    {
      key: 'missedCallsRecovered',
      title: 'Missed Calls Recovered',
      value: valueMetrics?.missedCallsRecovered ?? analytics?.missedCalls ?? 0,
      icon: Phone,
      iconColor: 'text-blue-500',
      change: 'Auto-texted after missed calls',
      changeType: 'positive',
    },
    {
      key: 'conversations',
      title: 'Customers Engaged',
      value: analytics?.conversations ?? 0,
      icon: MessageSquare,
      iconColor: 'text-purple-500',
      change: 'Active SMS conversations',
      changeType: 'positive',
    },
    ...(showCard('orders')
      ? [{
          key: 'ordersPlaced',
          title: profile.catalogNoun === 'products' ? 'Product Holds' : 'Orders Placed',
          value: valueMetrics?.ordersPlaced ?? analytics?.orders ?? 0,
          icon: ShoppingBag,
          iconColor: 'text-green-500',
          change: 'Captured via SMS',
          changeType: 'positive' as const,
        }]
      : []),
    ...(showCard('meetings')
      ? [{
          key: 'appointmentsBooked',
          title: 'Appointments Booked',
          value: valueMetrics?.appointmentsBooked ?? analytics?.meetings ?? 0,
          icon: Calendar,
          iconColor: 'text-orange-500',
          change: 'Scheduled or requested',
          changeType: 'positive' as const,
        }]
      : []),
    ...(showCard('revenue')
      ? [{
          key: 'estimatedRevenue',
          title: 'Estimated Revenue',
          value: formatDollars(revenueDollars),
          icon: DollarSign,
          iconColor: 'text-emerald-500',
          change: 'Non-cancelled order value',
          changeType: 'positive' as const,
        }]
      : []),
    ...(profile.catalogNoun !== 'menu'
      ? [{
          key: 'quoteRequestsCaptured',
          title: 'Quote Requests',
          value: valueMetrics?.quoteRequestsCaptured ?? 0,
          icon: HelpCircle,
          iconColor: 'text-cyan-500',
          change: 'Pricing and estimate leads',
          changeType: 'positive' as const,
        }]
      : []),
    {
      key: 'emergenciesEscalated',
      title: 'Urgent Escalations',
      value: valueMetrics?.emergenciesEscalated ?? 0,
      icon: AlertTriangle,
      iconColor: 'text-red-500',
      change: 'Safety or urgent requests',
      changeType: (valueMetrics?.emergenciesEscalated ?? 0) > 0 ? 'negative' : 'neutral',
    },
    {
      key: 'avgResponseTime',
      title: 'Avg Response Time',
      value: formatResponseTime(valueMetrics?.avgResponseTimeSeconds ?? 0),
      icon: Clock,
      iconColor: 'text-slate-500',
      change: 'Owner response to missed calls',
      changeType: 'neutral',
    },
    {
      key: 'unresolvedUrgentLeads',
      title: 'Urgent Leads Open',
      value: valueMetrics?.unresolvedUrgentLeads ?? 0,
      icon: AlertTriangle,
      iconColor: 'text-amber-500',
      change: 'Needs follow-up',
      changeType: (valueMetrics?.unresolvedUrgentLeads ?? 0) > 0 ? 'negative' : 'positive',
    },
  ];

  return (
    <div>
      <Header
        title="Overview"
        description="Your RingBack activity for the last 30 days"
      />

      <div className="mb-6">
        <ActionItemsCard />
      </div>

      {/* Value Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {valueCards.map((card) => (
          <StatCard
            key={card.key}
            title={card.title}
            value={card.value}
            icon={card.icon}
            iconColor={card.iconColor}
            change={card.change}
            changeType={card.changeType}
          />
        ))}
      </div>

      {/* POS Status */}
      {tenant && (
        <div className="mb-6">
          <PosStatusCard
            posProvider={tenant.posProvider}
            posMerchantId={tenant.posMerchantId}
            posTokenExpiresAt={tenant.posTokenExpiresAt}
            plan={tenant.plan}
          />
        </div>
      )}

      {/* Recent Conversations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-purple-500" />
              Active Conversations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentConversations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No active conversations</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentConversations.map((conv: { id: string; callerPhone: string; flowType: string | null; updatedAt: string }) => (
                  <div key={conv.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                        <Phone className="h-4 w-4 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{maskPhone(conv.callerPhone)}</p>
                        <p className="text-xs text-muted-foreground">{formatRelativeTime(conv.updatedAt)}</p>
                      </div>
                    </div>
                    {conv.flowType && (
                      <Badge variant={conv.flowType === 'ORDER' ? 'success' : conv.flowType === 'MEETING' ? 'secondary' : 'outline'}>
                        {conv.flowType}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Usage This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(analytics?.usage ?? {}).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm capitalize">{type.replace('_', ' ').toLowerCase()}</span>
                  </div>
                  <span className="font-semibold">{count as number}</span>
                </div>
              ))}
              {(!analytics?.usage || Object.keys(analytics.usage).length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">No usage data yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
