'use client';

import { useQuery } from '@tanstack/react-query';
import { Phone, MessageSquare, ShoppingBag, Calendar, TrendingUp, Clock } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { PosStatusCard } from '@/components/dashboard/PosStatusCard';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { analyticsApi, conversationApi, tenantApi } from '@/lib/api';
import { formatRelativeTime, maskPhone } from '@/lib/utils';
import { useOrganization } from '@clerk/nextjs';

export default function DashboardPage() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;

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

  return (
    <div>
      <Header
        title="Overview"
        description="Your RingBack activity for the last 30 days"
      />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Missed Calls"
          value={analytics?.missedCalls ?? 0}
          icon={Phone}
          iconColor="text-blue-500"
          change="Last 30 days"
          changeType="neutral"
        />
        <StatCard
          title="Conversations"
          value={analytics?.conversations ?? 0}
          icon={MessageSquare}
          iconColor="text-purple-500"
          change="Auto-replied"
          changeType="positive"
        />
        <StatCard
          title="Orders"
          value={analytics?.orders ?? 0}
          icon={ShoppingBag}
          iconColor="text-green-500"
          change="Via SMS"
          changeType="positive"
        />
        <StatCard
          title="Meetings"
          value={analytics?.meetings ?? 0}
          icon={Calendar}
          iconColor="text-orange-500"
          change="Scheduled"
          changeType="positive"
        />
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
