'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardList,
  Plug2,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { tenantApi, webApi } from '@/lib/api';
import { useTenantId } from '@/components/providers/TenantProvider';

type ReadinessCategory =
  | 'happy_path'
  | 'after_hours'
  | 'emergency'
  | 'handoff'
  | 'pricing'
  | 'booking'
  | 'cancellation'
  | 'vague'
  | 'impossible';

interface ReadinessResult {
  verticalKey: string;
  verticalLabel: string;
  score: number;
  passed: number;
  total: number;
  recommendedIntegrations: string[];
  valueMetrics: string[];
  intakeFields: Array<{ key: string; label: string; examples: string[] }>;
  categoryBreakdown: Array<{
    category: ReadinessCategory;
    passed: number;
    total: number;
    score: number;
  }>;
  escalationPolicies: Array<{
    id: string;
    label: string;
    severity: string;
    keywords: string[];
    stopAutomation: boolean;
    source: string;
  }>;
  results: Array<{
    id: string;
    label: string;
    category: ReadinessCategory;
    message: string;
    passed: boolean;
    failures: string[];
    suggestedFixes: string[];
    reply: string;
    flowType: string;
    flowStep: string | null;
  }>;
}

const INDUSTRY_OPTIONS = [
  { key: '', label: 'Auto-detect from business type and website' },
  { key: 'restaurant', label: 'Restaurant' },
  { key: 'food_truck', label: 'Food truck' },
  { key: 'home_services', label: 'Home services' },
  { key: 'hvac', label: 'HVAC' },
  { key: 'plumbing', label: 'Plumbing' },
  { key: 'electrical', label: 'Electrical' },
  { key: 'medical', label: 'Medical / dental' },
  { key: 'home_care', label: 'Home care' },
  { key: 'hospice', label: 'Hospice' },
  { key: 'salon', label: 'Salon / spa' },
  { key: 'auto_shop', label: 'Auto shop' },
  { key: 'retail', label: 'Retail' },
  { key: 'consultant', label: 'Consultant' },
  { key: 'generic_service', label: 'Generic service business' },
];

const CATEGORY_LABELS: Record<ReadinessCategory, string> = {
  happy_path: 'Happy path',
  after_hours: 'After-hours',
  emergency: 'Emergency',
  handoff: 'Handoff',
  pricing: 'Pricing',
  booking: 'Booking',
  cancellation: 'Cancellation',
  vague: 'Vague',
  impossible: 'Boundary',
};

function readinessStatus(score: number) {
  if (score >= 1) return { label: 'Ready', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (score >= 0.8) return { label: 'Needs review', className: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { label: 'Not ready', className: 'bg-red-50 text-red-700 border-red-200' };
}

function splitKeywords(value: string): string[] {
  return [...new Set(
    value
      .split(',')
      .map((keyword) => keyword.trim())
      .filter(Boolean),
  )];
}

function joinKeywords(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((keyword): keyword is string => typeof keyword === 'string').join(', ')
    : '';
}

export default function AiReadinessPage() {
  const { tenantId } = useTenantId();
  const queryClient = useQueryClient();
  const [industryTemplateKey, setIndustryTemplateKey] = useState('');
  const [customKeywords, setCustomKeywords] = useState('');
  const [customAiInstructions, setCustomAiInstructions] = useState('');

  const { data: tenant } = useQuery({
    queryKey: ['tenant-me'],
    queryFn: () => tenantApi.getMe(),
  });

  const { data: readiness, isFetching: readinessLoading, refetch: refetchReadiness } = useQuery({
    queryKey: ['tenant-readiness', tenantId],
    queryFn: () =>
      webApi
        .get(`/tenants/${tenantId!}/readiness`)
        .then((res) => res.data.data as ReadinessResult),
    enabled: !!tenantId,
  });

  const config = tenant?.config as {
    industryTemplateKey?: string | null;
    customEscalationKeywords?: string[] | null;
    customAiInstructions?: string | null;
  } | undefined;

  useEffect(() => {
    if (!config) return;
    setIndustryTemplateKey(config.industryTemplateKey ?? '');
    setCustomKeywords(joinKeywords(config.customEscalationKeywords));
    setCustomAiInstructions(config.customAiInstructions ?? '');
  }, [config]);

  const failedResults = useMemo(
    () => readiness?.results.filter((result) => !result.passed) ?? [],
    [readiness],
  );
  const suggestedFixes = useMemo(
    () => [...new Set(failedResults.flatMap((result) => result.suggestedFixes))],
    [failedResults],
  );
  const status = readinessStatus(readiness?.score ?? 0);

  const saveMutation = useMutation({
    mutationFn: () =>
      tenantApi.updateConfig(tenantId!, {
        industryTemplateKey: industryTemplateKey || null,
        customEscalationKeywords: splitKeywords(customKeywords),
        customAiInstructions: customAiInstructions.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-me'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-readiness', tenantId] });
      toast.success('AI readiness settings saved');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? 'Failed to save readiness settings');
    },
  });

  return (
    <div>
      <Header
        title="AI Readiness"
        description="Tune the tenant's industry profile, safety handoff rules, and readiness gaps."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => refetchReadiness()}
              disabled={!tenantId || readinessLoading}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Re-run readiness
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!tenantId || saveMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              Save settings
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-500" />
              Readiness Summary
            </CardTitle>
            <CardDescription>
              This uses the same industry scenario pack as the admin Bot Tester.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!readiness ? (
              <div className="text-sm text-muted-foreground">
                {readinessLoading ? 'Running readiness checks...' : 'No readiness result yet.'}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Detected industry</div>
                    <div className="text-2xl font-bold">{readiness.verticalLabel}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-3xl font-bold">{Math.round(readiness.score * 100)}%</div>
                      <div className="text-sm text-muted-foreground">{readiness.passed}/{readiness.total} scenarios</div>
                    </div>
                    <Badge variant="outline" className={status.className}>{status.label}</Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {readiness.categoryBreakdown.map((area) => (
                    <div key={area.category} className="rounded-lg border p-3">
                      <div className="text-sm font-medium">{CATEGORY_LABELS[area.category]}</div>
                      <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
                        <span>{area.passed}/{area.total}</span>
                        <span>{Math.round(area.score * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>

                {suggestedFixes.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div className="font-medium text-amber-900">Suggested fixes</div>
                    <ul className="mt-2 list-disc pl-5 text-sm text-amber-900 space-y-1">
                      {suggestedFixes.map((fix) => (
                        <li key={fix}>{fix}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-slate-500" />
              Industry Settings
            </CardTitle>
            <CardDescription>
              Choose the closest vertical so prompts, safety rules, and tests match the business.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="industryTemplateKey">Industry profile</Label>
              <select
                id="industryTemplateKey"
                value={industryTemplateKey}
                onChange={(event) => setIndustryTemplateKey(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {INDUSTRY_OPTIONS.map((option) => (
                  <option key={option.key || 'auto'} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customKeywords">Custom escalation keywords</Label>
              <Input
                id="customKeywords"
                value={customKeywords}
                onChange={(event) => setCustomKeywords(event.target.value)}
                placeholder="refund, angry, manager, urgent"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated words that should stop automation and create a follow-up task.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-500" />
              AI Instructions
            </CardTitle>
            <CardDescription>
              Tenant-specific behavior that is appended to the AI system prompt.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <textarea
              value={customAiInstructions}
              onChange={(event) => setCustomAiInstructions(event.target.value)}
              maxLength={500}
              rows={7}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={'Example: Always ask HVAC callers whether the issue is heating, cooling, or maintenance. Never promise same-day service unless the owner confirms.'}
            />
            <div className="text-xs text-muted-foreground">
              {customAiInstructions.length} / 500 characters
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Safety Boundary
            </CardTitle>
            <CardDescription>
              Emergency handling is policy-driven and runs before normal intent routing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
              Emergency cases should tell customers that this business is not an emergency service and that they should call 911 for immediate danger.
            </div>
            <div className="text-muted-foreground">
              Industry policies cover medical emergencies, home-service hazards, food allergy safety, and legal/financial boundaries. Custom escalation keywords are for tenant-specific handoffs.
            </div>
          </CardContent>
        </Card>
      </div>

      {readiness && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-blue-500" />
                Intake Fields
              </CardTitle>
            </CardHeader>
            <CardContent>
              {readiness.intakeFields.length === 0 ? (
                <p className="text-sm text-muted-foreground">No industry intake fields configured.</p>
              ) : (
                <div className="space-y-3">
                  {readiness.intakeFields.map((field) => (
                    <div key={field.key} className="rounded-lg border p-3">
                      <div className="font-medium">{field.label}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Examples: {field.examples.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plug2 className="h-5 w-5 text-emerald-500" />
                Recommended Integrations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {readiness.recommendedIntegrations.map((integration) => (
                  <Badge key={integration} variant="secondary">{integration}</Badge>
                ))}
                {readiness.recommendedIntegrations.length === 0 && (
                  <span className="text-sm text-muted-foreground">No recommendations for this profile.</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Escalation Policies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {readiness.escalationPolicies.slice(0, 6).map((policy) => (
                  <div key={policy.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{policy.label}</div>
                      <Badge variant="outline">{policy.severity}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {policy.keywords.slice(0, 6).join(', ')}
                      {policy.keywords.length > 6 ? ', ...' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {failedResults.length > 0 && (
            <Card className="xl:col-span-3">
              <CardHeader>
                <CardTitle>Failed Readiness Scenarios</CardTitle>
                <CardDescription>
                  These are the conversations most likely to need config or prompt work.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {failedResults.map((result) => (
                    <div key={result.id} className="rounded-lg border border-red-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{result.label}</div>
                        <Badge variant="destructive">{CATEGORY_LABELS[result.category]}</Badge>
                      </div>
                      <div className="mt-3 text-sm text-muted-foreground">Customer: {result.message}</div>
                      <div className="mt-3 rounded-md bg-muted p-3 text-sm">{result.reply || '(no reply)'}</div>
                      <div className="mt-3 space-y-1 text-sm">
                        {result.failures.map((failure) => (
                          <div key={failure} className="flex gap-2 text-red-700">
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{failure}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {failedResults.length === 0 && readiness.results.length > 0 && (
            <Card className="xl:col-span-3">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
                All readiness scenarios are passing for this industry profile.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
