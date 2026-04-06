'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@clerk/nextjs';
import { Zap, ShoppingBag, Calendar, MessageSquare, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
          {flows.map(flow => (
            <FlowCard
              key={flow.id}
              flow={flow}
              tenantId={tenantId!}
              onToggle={(checked) => toggleMutation.mutate({ flowId: flow.id, isEnabled: checked })}
              isToggling={toggleMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FlowCard({ flow, tenantId, onToggle, isToggling }: {
  flow: Flow;
  tenantId: string;
  onToggle: (checked: boolean) => void;
  isToggling: boolean;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const meta = FLOW_META[flow.type] ?? FLOW_META.CUSTOM;
  const Icon = meta.icon;
  const hasConfig = flow.type === 'CUSTOM' || flow.type === 'ORDER' || flow.type === 'MEETING';

  const configMutation = useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      tenantApi.updateFlow(tenantId, flow.id, { config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows', tenantId] });
      toast.success('Flow configuration saved');
    },
    onError: () => toast.error('Failed to save flow configuration'),
  });

  return (
    <Card className={!flow.isEnabled ? 'opacity-60' : ''}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-4 flex-1">
            <div className="p-2.5 rounded-lg bg-muted shrink-0">
              <Icon className={`h-5 w-5 ${meta.color}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold">{meta.title}</h3>
                <Badge variant={flow.isEnabled ? 'success' : 'secondary'}>
                  {flow.isEnabled ? 'Active' : 'Disabled'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{meta.description}</p>
              {hasConfig && flow.isEnabled && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="mt-2 text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {expanded ? 'Hide' : 'Configure'}
                </button>
              )}
            </div>
          </div>
          <Switch
            checked={flow.isEnabled}
            onCheckedChange={onToggle}
            disabled={isToggling}
          />
        </div>

        {expanded && flow.isEnabled && (
          <FlowConfigPanel
            flow={flow}
            onSave={(config) => configMutation.mutate(config)}
            isSaving={configMutation.isPending}
          />
        )}
      </CardContent>
    </Card>
  );
}

function FlowConfigPanel({ flow, onSave, isSaving }: {
  flow: Flow;
  onSave: (config: Record<string, unknown>) => void;
  isSaving: boolean;
}) {
  const config = (flow.config ?? {}) as Record<string, string>;
  const [values, setValues] = useState<Record<string, string>>({
    autoReplyMessage: config.autoReplyMessage ?? '',
    keywords: config.keywords ?? '',
    ...(flow.type === 'ORDER' ? {
      orderConfirmMessage: config.orderConfirmMessage ?? '',
      pickupInstructions: config.pickupInstructions ?? '',
    } : {}),
    ...(flow.type === 'MEETING' ? {
      meetingIntro: config.meetingIntro ?? '',
      availabilityMessage: config.availabilityMessage ?? '',
    } : {}),
    ...(flow.type === 'CUSTOM' ? {
      customName: config.customName ?? '',
      triggerKeywords: config.triggerKeywords ?? '',
      responseTemplate: config.responseTemplate ?? '',
    } : {}),
  });

  const update = (key: string, value: string) => setValues(v => ({ ...v, [key]: value }));

  return (
    <div className="mt-4 pt-4 border-t space-y-4">
      {flow.type === 'ORDER' && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Order Confirmation Message</Label>
            <Input
              value={values.orderConfirmMessage}
              onChange={(e) => update('orderConfirmMessage', e.target.value)}
              placeholder="Thanks for your order! We'll have it ready for pickup."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Pickup Instructions</Label>
            <Input
              value={values.pickupInstructions}
              onChange={(e) => update('pickupInstructions', e.target.value)}
              placeholder="Please come to the front counter when you arrive."
            />
          </div>
        </>
      )}
      {flow.type === 'MEETING' && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Meeting Introduction</Label>
            <Input
              value={values.meetingIntro}
              onChange={(e) => update('meetingIntro', e.target.value)}
              placeholder="I'd be happy to schedule a meeting with you!"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Availability Message</Label>
            <Input
              value={values.availabilityMessage}
              onChange={(e) => update('availabilityMessage', e.target.value)}
              placeholder="I'm generally available weekdays between 9am and 5pm."
            />
          </div>
        </>
      )}
      {flow.type === 'CUSTOM' && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Flow Name</Label>
            <Input
              value={values.customName}
              onChange={(e) => update('customName', e.target.value)}
              placeholder="e.g., Warranty Support"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Trigger Keywords (comma-separated)</Label>
            <Input
              value={values.triggerKeywords}
              onChange={(e) => update('triggerKeywords', e.target.value)}
              placeholder="warranty, return, exchange"
            />
            <p className="text-xs text-muted-foreground">Messages containing these keywords will trigger this flow</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Auto-Reply Template</Label>
            <textarea
              value={values.responseTemplate}
              onChange={(e) => update('responseTemplate', e.target.value)}
              placeholder="Thanks for reaching out about your warranty. A team member will follow up within 24 hours."
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </>
      )}
      <Button
        size="sm"
        onClick={() => onSave(values)}
        disabled={isSaving}
      >
        <Save className="h-3.5 w-3.5 mr-1.5" />
        {isSaving ? 'Saving...' : 'Save Configuration'}
      </Button>
    </div>
  );
}
