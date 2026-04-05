'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { Zap, ShoppingBag, Calendar, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { tenantApi } from '@/lib/api';

interface Flow {
  id: string;
  type: string;
  isEnabled: boolean;
  config: Record<string, unknown> | null;
}

const FLOW_META: Record<string, { icon: React.ElementType; title: string; description: string; color: string }> = {
  ORDER: {
    icon: ShoppingBag,
    title: 'Order Flow',
    description: 'Customers can browse your menu, select items, confirm an order, and set a pickup time — all via SMS.',
    color: 'text-green-500',
  },
  MEETING: {
    icon: Calendar,
    title: 'Meeting Flow',
    description: 'Customers can request a meeting or get your cal.com booking link to schedule a call with you.',
    color: 'text-blue-500',
  },
  FALLBACK: {
    icon: MessageSquare,
    title: 'AI Fallback',
    description: 'When no specific flow matches, Claude AI responds conversationally on your behalf.',
    color: 'text-purple-500',
  },
  CUSTOM: {
    icon: Zap,
    title: 'Custom Flow',
    description: 'A custom-configured flow for specialized business needs.',
    color: 'text-orange-500',
  },
};

export default function FlowsPage() {
  const { organization } = useOrganization();
  const tenantId = organization?.publicMetadata?.tenantId as string | undefined;
  const queryClient = useQueryClient();

  const { data: flows = [], isLoading } = useQuery<Flow[]>({
    queryKey: ['flows', tenantId],
    queryFn: () => tenantApi.getFlows(tenantId!),
    enabled: !!tenantId,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ flowId, isEnabled }: { flowId: string; isEnabled: boolean }) =>
      tenantApi.updateFlow(tenantId!, flowId, { isEnabled }),
    onSuccess: (_, { isEnabled }) => {
      queryClient.invalidateQueries({ queryKey: ['flows', tenantId] });
      toast.success(isEnabled ? 'Flow enabled' : 'Flow disabled');
    },
    onError: () => toast.error('Failed to update flow'),
  });

  return (
    <div>
      <Header
        title="Flows"
        description="Control which automated SMS flows are active for your business"
      />

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading flows...</div>
      ) : (
        <div className="space-y-4">
          {flows.map(flow => {
            const meta = FLOW_META[flow.type] ?? FLOW_META.CUSTOM;
            const Icon = meta.icon;
            return (
              <Card key={flow.id} className={!flow.isEnabled ? 'opacity-60' : ''}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-4">
                      <div className={`p-2.5 rounded-lg bg-muted shrink-0`}>
                        <Icon className={`h-5 w-5 ${meta.color}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{meta.title}</h3>
                          <Badge variant={flow.isEnabled ? 'success' : 'secondary'}>
                            {flow.isEnabled ? 'Active' : 'Disabled'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{meta.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={flow.isEnabled}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ flowId: flow.id, isEnabled: checked })
                      }
                      disabled={toggleMutation.isPending}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
