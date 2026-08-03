'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardList,
  Plug2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Trash2,
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
  evaluationMode?: 'deterministic' | 'live';
  verticalKey: string;
  verticalLabel: string;
  score: number;
  passed: number;
  total: number;
  recommendedIntegrations: string[];
  valueMetrics: string[];
  intakeFields: Array<{ key: string; label: string; examples: string[]; requiredFor: string[] }>;
  defaultIntakeFields: Array<{ key: string; label: string; examples: string[]; requiredFor: string[] }>;
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
    customerReply: string;
    ownerSubject: string;
    ownerMessage?: string;
    taskTitle?: string;
    taskPriority?: string;
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

interface AutopilotResult {
  plan: {
    version: string;
    verticalKey: string;
    verticalLabel: string;
    enabledFlows: string[];
    flowsToEnable: string[];
    automaticCapabilities: string[];
    ownerQuestions: Array<{
      key: string;
      category: string;
      question: string;
      aliases: string[];
      why: string;
    }>;
    setupWarnings: string[];
    completionRate: number;
    needsApply: boolean;
  };
  state: {
    enabled: boolean;
    version: string | null;
    lastAppliedAt: string | null;
  };
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

const REQUIRED_FOR_LABELS: Record<string, string> = {
  booking: 'Ask before booking',
  quote: 'Ask before quoting',
  handoff: 'Include for staff follow-up',
};

interface IntakeDraftField {
  key: string;
  label: string;
  examples: string;
  requiredFor: string[];
  enabled: boolean;
}

interface EscalationDraftRule {
  id: string;
  label: string;
  severity: string;
  keywords: string;
  customerReply: string;
  ownerSubject: string;
  ownerMessage: string;
  taskTitle: string;
  taskPriority: string;
  stopAutomation: boolean;
  enabled: boolean;
}

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

function intakeToDraft(fields: ReadinessResult['intakeFields']): IntakeDraftField[] {
  return fields.map((field) => ({
    key: field.key,
    label: field.label,
    examples: field.examples.join(', '),
    requiredFor: field.requiredFor ?? [],
    enabled: true,
  }));
}

function intakeOverrideToDraft(value: unknown, fallback: ReadinessResult['intakeFields']): IntakeDraftField[] {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { fields?: unknown }).fields)
      ? (value as { fields: unknown[] }).fields
      : null;
  if (!raw) return intakeToDraft(fallback);
  return raw
    .filter((field): field is Record<string, unknown> => typeof field === 'object' && field !== null)
    .map((field) => ({
      key: typeof field.key === 'string' ? field.key : '',
      label: typeof field.label === 'string' ? field.label : '',
      examples: Array.isArray(field.examples) ? field.examples.filter((x): x is string => typeof x === 'string').join(', ') : '',
      requiredFor: Array.isArray(field.requiredFor) ? field.requiredFor.filter((x): x is string => typeof x === 'string') : [],
      enabled: field.enabled !== false,
    }))
    .filter((field) => field.key);
}

function escalationToDraft(rules: ReadinessResult['escalationPolicies']): EscalationDraftRule[] {
  return rules.map((rule) => ({
    id: rule.id,
    label: rule.label,
    severity: rule.severity,
    keywords: rule.keywords.join(', '),
    customerReply: rule.customerReply,
    ownerSubject: rule.ownerSubject,
    ownerMessage: rule.ownerMessage ?? '',
    taskTitle: rule.taskTitle ?? '',
    taskPriority: rule.taskPriority ?? (rule.severity === 'EMERGENCY' ? 'URGENT' : rule.severity === 'HIGH' ? 'HIGH' : 'NORMAL'),
    stopAutomation: rule.stopAutomation,
    enabled: true,
  }));
}

function escalationOverrideToDraft(value: unknown, fallback: ReadinessResult['escalationPolicies']): EscalationDraftRule[] {
  const raw = value && typeof value === 'object' && Array.isArray((value as { rules?: unknown }).rules)
    ? (value as { rules: unknown[] }).rules
    : null;
  if (!raw) return escalationToDraft(fallback);
  return raw
    .filter((rule): rule is Record<string, unknown> => typeof rule === 'object' && rule !== null)
    .map((rule) => ({
      id: typeof rule.id === 'string' ? rule.id : '',
      label: typeof rule.label === 'string' ? rule.label : '',
      severity: typeof rule.severity === 'string' ? rule.severity : 'HIGH',
      keywords: Array.isArray(rule.keywords) ? rule.keywords.filter((x): x is string => typeof x === 'string').join(', ') : '',
      customerReply: typeof rule.customerReply === 'string' ? rule.customerReply : "I'm connecting you with a team member who can help. Someone will follow up with you shortly!",
      ownerSubject: typeof rule.ownerSubject === 'string' ? rule.ownerSubject : 'Customer needs follow-up',
      ownerMessage: typeof rule.ownerMessage === 'string' ? rule.ownerMessage : '',
      taskTitle: typeof rule.taskTitle === 'string' ? rule.taskTitle : '',
      taskPriority: typeof rule.taskPriority === 'string' ? rule.taskPriority : 'HIGH',
      stopAutomation: typeof rule.stopAutomation === 'boolean' ? rule.stopAutomation : true,
      enabled: rule.enabled !== false,
    }))
    .filter((rule) => rule.id);
}

function toIntakeOverride(fields: IntakeDraftField[]) {
  return {
    fields: fields
      .filter((field) => field.key.trim())
      .map((field) => ({
        key: field.key.trim(),
        enabled: field.enabled,
        label: field.label.trim() || field.key.trim(),
        examples: splitKeywords(field.examples),
        requiredFor: field.requiredFor,
      })),
  };
}

function toEscalationOverride(rules: EscalationDraftRule[]) {
  return {
    rules: rules
      .filter((rule) => rule.id.trim())
      .map((rule) => ({
        id: rule.id.trim(),
        enabled: rule.enabled,
        label: rule.label.trim() || rule.id.trim(),
        severity: rule.severity,
        keywords: splitKeywords(rule.keywords),
        customerReply: rule.customerReply.trim(),
        ownerSubject: rule.ownerSubject.trim() || 'Customer needs follow-up',
        ownerMessage: rule.ownerMessage.trim() || undefined,
        taskTitle: rule.taskTitle.trim() || undefined,
        taskPriority: rule.taskPriority,
        stopAutomation: rule.stopAutomation,
      })),
  };
}

export default function AiReadinessPage() {
  const { tenantId } = useTenantId();
  const queryClient = useQueryClient();
  const [industryTemplateKey, setIndustryTemplateKey] = useState('');
  const [customKeywords, setCustomKeywords] = useState('');
  const [customAiInstructions, setCustomAiInstructions] = useState('');
  const [intakeFields, setIntakeFields] = useState<IntakeDraftField[]>([]);
  const [escalationRules, setEscalationRules] = useState<EscalationDraftRule[]>([]);
  const [autopilotAnswers, setAutopilotAnswers] = useState<Record<string, string>>({});

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

  const { data: autopilot, isFetching: autopilotLoading } = useQuery<AutopilotResult>({
    queryKey: ['tenant-autopilot', tenantId],
    queryFn: () => tenantApi.getAutopilot(tenantId!),
    enabled: !!tenantId,
  });

  const config = tenant?.config as {
    industryTemplateKey?: string | null;
    customEscalationKeywords?: string[] | null;
    customAiInstructions?: string | null;
    escalationPolicyOverrides?: unknown;
    intakeFieldOverrides?: unknown;
  } | undefined;

  useEffect(() => {
    if (!config) return;
    setIndustryTemplateKey(config.industryTemplateKey ?? '');
    setCustomKeywords(joinKeywords(config.customEscalationKeywords));
    setCustomAiInstructions(config.customAiInstructions ?? '');
  }, [config]);

  useEffect(() => {
    if (!readiness) return;
    setIntakeFields(intakeOverrideToDraft(config?.intakeFieldOverrides, readiness.intakeFields));
    setEscalationRules(escalationOverrideToDraft(config?.escalationPolicyOverrides, readiness.escalationPolicies));
  }, [readiness, config?.intakeFieldOverrides, config?.escalationPolicyOverrides]);

  const failedResults = useMemo(
    () => readiness?.results.filter((result) => !result.passed) ?? [],
    [readiness],
  );
  const suggestedFixes = useMemo(
    () => [...new Set(failedResults.flatMap((result) => result.suggestedFixes))],
    [failedResults],
  );
  const status = readinessStatus(readiness?.score ?? 0);
  const savedIndustryOverride = config?.industryTemplateKey ?? '';
  const hasIndustryOverride = savedIndustryOverride.length > 0;
  const hasPendingIndustryChange = industryTemplateKey !== savedIndustryOverride;
  const selectedIndustryLabel =
    INDUSTRY_OPTIONS.find((option) => option.key === industryTemplateKey)?.label ??
    'Auto-detect from business type and website';

  const saveMutation = useMutation({
    mutationFn: () =>
      tenantApi.updateConfig(tenantId!, {
        industryTemplateKey: industryTemplateKey || null,
        customEscalationKeywords: splitKeywords(customKeywords),
        customAiInstructions: customAiInstructions.trim() || null,
        intakeFieldOverrides: toIntakeOverride(intakeFields),
        escalationPolicyOverrides: toEscalationOverride(escalationRules),
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

  const refreshAutopilotData = () => {
    queryClient.invalidateQueries({ queryKey: ['tenant-autopilot', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['tenant-readiness', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['tenant-me'] });
  };

  const autopilotMutation = useMutation({
    mutationFn: (enabled: boolean) => tenantApi.applyAutopilot(tenantId!, enabled),
    onSuccess: (_result, enabled) => {
      refreshAutopilotData();
      toast.success(enabled ? 'Autopilot configured' : 'Autopilot auto-updates turned off');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? 'Unable to update Autopilot');
    },
  });

  const answerMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      tenantApi.answerAutopilotQuestion(tenantId!, key, value),
    onSuccess: (_result, variables) => {
      setAutopilotAnswers((answers) => ({ ...answers, [variables.key]: '' }));
      queryClient.invalidateQueries({ queryKey: ['knowledge', tenantId] });
      refreshAutopilotData();
      toast.success('Verified business answer saved');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? 'Unable to save this answer');
    },
  });

  const liveReadinessMutation = useMutation({
    mutationFn: () =>
      webApi
        .get(`/tenants/${tenantId!}/readiness`, { params: { mode: 'live' } })
        .then((res) => res.data.data as ReadinessResult),
    onSuccess: (result) => {
      queryClient.setQueryData(['tenant-readiness', tenantId], result);
      toast.success('Live AI readiness check complete');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? 'Live AI readiness check failed');
    },
  });

  return (
    <div>
      <Header
        title="AI Readiness"
        description="Choose what the AI should collect, when it should notify staff, and check that common customer conversations work."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => liveReadinessMutation.mutate()}
              disabled={!tenantId || liveReadinessMutation.isPending}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {liveReadinessMutation.isPending ? 'Testing live AI...' : 'Test live AI'}
            </Button>
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

      <Card className="mb-6 border-blue-200 bg-gradient-to-br from-blue-50/70 to-background">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
                Autopilot setup
                {autopilot?.state.enabled && (
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                    On
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="mt-2 max-w-3xl">
                We choose the right customer flows, safety rules, and details to collect for this business. You only answer policies the system cannot safely know on its own.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {autopilot?.state.enabled && (
                <Button
                  variant="ghost"
                  onClick={() => autopilotMutation.mutate(false)}
                  disabled={autopilotMutation.isPending}
                >
                  Stop auto-updates
                </Button>
              )}
              <Button
                onClick={() => autopilotMutation.mutate(true)}
                disabled={!tenantId || autopilotLoading || autopilotMutation.isPending}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {autopilot?.state.enabled
                  ? autopilot.plan.needsApply ? 'Refresh Autopilot' : 'Autopilot is current'
                  : 'Set it up for me'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!autopilot ? (
            <div className="text-sm text-muted-foreground">
              {autopilotLoading ? 'Preparing your business setup...' : 'Autopilot setup is unavailable.'}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border bg-background p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Business profile</div>
                  <div className="mt-1 text-lg font-semibold">{autopilot.plan.verticalLabel}</div>
                </div>
                <div className="rounded-lg border bg-background p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Configured automatically</div>
                  <div className="mt-1 text-lg font-semibold">{autopilot.plan.automaticCapabilities.length} capabilities</div>
                </div>
                <div className="rounded-lg border bg-background p-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Needs your answer</div>
                  <div className="mt-1 text-lg font-semibold">{autopilot.plan.ownerQuestions.length} polic{autopilot.plan.ownerQuestions.length === 1 ? 'y' : 'ies'}</div>
                </div>
              </div>

              {autopilot.plan.ownerQuestions.length > 0 ? (
                <div className="space-y-3">
                  <div>
                    <div className="font-medium">A few answers only you can verify</div>
                    <div className="text-sm text-muted-foreground">These answers become approved facts. The AI can quote them but cannot invent a different policy.</div>
                  </div>
                  {autopilot.plan.ownerQuestions.map((question) => {
                    const answer = autopilotAnswers[question.key] ?? '';
                    const saving = answerMutation.isPending && answerMutation.variables?.key === question.key;
                    return (
                      <div key={question.key} className="rounded-lg border bg-background p-4">
                        <Label htmlFor={`autopilot-${question.key}`}>{question.question}</Label>
                        <p className="mt-1 text-xs text-muted-foreground">{question.why}</p>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <Input
                            id={`autopilot-${question.key}`}
                            value={answer}
                            onChange={(event) => setAutopilotAnswers((answers) => ({
                              ...answers,
                              [question.key]: event.target.value,
                            }))}
                            placeholder="Type the policy in your own words"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            disabled={!answer.trim() || answerMutation.isPending}
                            onClick={() => answerMutation.mutate({ key: question.key, value: answer.trim() })}
                          >
                            {saving ? 'Saving...' : 'Save answer'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  All required owner policies are verified. Autopilot can answer from saved business data and these approved facts.
                </div>
              )}

              {autopilot.plan.setupWarnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="font-medium">Recommended next</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {autopilot.plan.setupWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-500" />
              Readiness Summary
            </CardTitle>
            <CardDescription>
              We test sample customer conversations for this kind of business so you can see whether the AI is ready to answer safely.
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
                    <div className="text-sm text-muted-foreground">Active industry profile</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-2xl font-bold">{readiness.verticalLabel}</div>
                      <Badge variant="outline" className="text-xs">
                        {hasIndustryOverride ? 'Manual override' : 'Auto-selected'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {readiness.evaluationMode === 'live' ? 'Live AI' : 'Fast check'}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {hasIndustryOverride
                        ? 'Using the profile saved below.'
                        : 'Selected automatically from the tenant business type, name, and website context.'}
                    </div>
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
              Business Type & AI Behavior
            </CardTitle>
            <CardDescription>
              This controls the AI's default wording, safety rules, details to collect, and readiness tests.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="industryTemplateKey">Profile override</Label>
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
              <p className="text-xs text-muted-foreground">
                {industryTemplateKey
                  ? `Override selected: ${selectedIndustryLabel}. Save settings to apply it to prompts, safety rules, intake fields, and readiness tests.`
                  : 'No override selected. The app will keep choosing the best profile automatically.'}
                {hasPendingIndustryChange ? ' Unsaved change.' : ''}
              </p>
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                Most businesses can leave this on auto-detect. Use the dropdown only when the active profile above does not match the business.
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customKeywords">Always hand off when customer mentions</Label>
              <Input
                id="customKeywords"
                value={customKeywords}
                onChange={(event) => setCustomKeywords(event.target.value)}
                placeholder="refund, angry, manager, urgent"
              />
              <p className="text-xs text-muted-foreground">
                Example: refund, complaint, manager, chargeback. If a customer uses one of these words, the AI stops and creates a staff follow-up task.
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
              Special Instructions for the AI
            </CardTitle>
            <CardDescription>
              Optional rules for this business, written in plain English. Use this for preferences that are not covered by the fields below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <textarea
              value={customAiInstructions}
              onChange={(event) => setCustomAiInstructions(event.target.value)}
              maxLength={500}
              rows={7}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder={'Example: If someone asks about catering, collect the date, guest count, allergies, and pickup time. Never promise same-day service unless staff confirms.'}
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
              Emergency & Safety Rules
            </CardTitle>
            <CardDescription>
              These rules run before normal AI replies, so urgent or risky messages are handled consistently.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
              If a customer describes immediate danger, the AI tells them this business is not an emergency service and instructs them to call 911.
            </div>
            <div className="text-muted-foreground">
              Built-in safety rules cover medical emergencies, home-service hazards, severe food allergy concerns, and legal or financial boundaries.
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
                Details the AI Should Collect
              </CardTitle>
              <CardDescription>
                These are the customer details the AI watches for in normal text messages. Captured details show up on the conversation for staff.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                Example: an HVAC business may collect issue, urgency, address, preferred time, gate code, and pets on site.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIntakeFields((fields) => [
                    ...fields,
                    { key: `custom_${fields.length + 1}`, label: 'Custom field', examples: '', requiredFor: [], enabled: true },
                  ])}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add detail
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIntakeFields(intakeToDraft(readiness.defaultIntakeFields))}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Restore defaults
                </Button>
              </div>
              {intakeFields.length === 0 ? (
                <p className="text-sm text-muted-foreground">No intake fields configured.</p>
              ) : (
                <div className="space-y-3">
                  {intakeFields.map((field, index) => (
                    <div key={`${field.key}-${index}`} className="rounded-lg border p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={field.enabled}
                            onChange={(event) => setIntakeFields((fields) => fields.map((f, i) => i === index ? { ...f, enabled: event.target.checked } : f))}
                          />
                          Enabled
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setIntakeFields((fields) => fields.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>System key</Label>
                          <Input value={field.key} onChange={(event) => setIntakeFields((fields) => fields.map((f, i) => i === index ? { ...f, key: event.target.value } : f))} />
                          <p className="text-xs text-muted-foreground">
                            Short internal name, like gate_code or preferred_time.
                          </p>
                        </div>
                        <div className="space-y-1">
                          <Label>Staff label</Label>
                          <Input value={field.label} onChange={(event) => setIntakeFields((fields) => fields.map((f, i) => i === index ? { ...f, label: event.target.value } : f))} />
                          <p className="text-xs text-muted-foreground">
                            Friendly name shown in conversations and tasks.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>Example customer wording</Label>
                        <Input
                          value={field.examples}
                          onChange={(event) => setIntakeFields((fields) => fields.map((f, i) => i === index ? { ...f, examples: event.target.value } : f))}
                          placeholder="gate code is 4451, two dogs inside"
                        />
                        <p className="text-xs text-muted-foreground">
                          A few examples help the AI understand what this detail looks like in a text message.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm">
                        {['booking', 'quote', 'handoff'].map((requiredFor) => (
                          <label key={requiredFor} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={field.requiredFor.includes(requiredFor)}
                              onChange={(event) => setIntakeFields((fields) => fields.map((f, i) => {
                                if (i !== index) return f;
                                const next = event.target.checked
                                  ? [...new Set([...f.requiredFor, requiredFor])]
                                  : f.requiredFor.filter((item) => item !== requiredFor);
                                return { ...f, requiredFor: next };
                              }))}
                            />
                            {REQUIRED_FOR_LABELS[requiredFor]}
                          </label>
                        ))}
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
                Suggested Connections
              </CardTitle>
              <CardDescription>
                Optional tools that can make this business easier to run, based on the active profile.
              </CardDescription>
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
              <CardTitle>Advanced: When the AI Should Stop and Notify Staff</CardTitle>
              <CardDescription>
                Most businesses can leave these defaults alone. Open this only when you need custom staff handoff rules.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <details className="space-y-3">
                <summary className="cursor-pointer rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">
                  Show advanced handoff rules
                </summary>
                <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  These rules decide when the AI should stop replying, send a safe holding message, and create a staff follow-up task.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEscalationRules((rules) => [
                      ...rules,
                      {
                        id: `custom_rule_${rules.length + 1}`,
                        label: 'Custom escalation',
                        severity: 'HIGH',
                        keywords: '',
                        customerReply: "I'm connecting you with a team member who can help. Someone will follow up with you shortly!",
                        ownerSubject: 'Customer needs follow-up',
                        ownerMessage: '',
                        taskTitle: '',
                        taskPriority: 'HIGH',
                        stopAutomation: true,
                        enabled: true,
                      },
                    ])}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add rule
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEscalationRules(escalationToDraft(readiness.escalationPolicies))}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Restore defaults
                  </Button>
                </div>
                <div className="space-y-3">
                  {escalationRules.map((rule, index) => (
                    <div key={`${rule.id}-${index}`} className="rounded-lg border p-3 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={(event) => setEscalationRules((rules) => rules.map((r, i) => i === index ? { ...r, enabled: event.target.checked } : r))}
                          />
                          Enabled
                        </label>
                        <Badge variant="outline">{rule.severity}</Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>Rule ID</Label>
                          <Input value={rule.id} onChange={(event) => setEscalationRules((rules) => rules.map((r, i) => i === index ? { ...r, id: event.target.value } : r))} />
                          <p className="text-xs text-muted-foreground">Internal name for this rule.</p>
                        </div>
                        <div className="space-y-1">
                          <Label>Rule name</Label>
                          <Input value={rule.label} onChange={(event) => setEscalationRules((rules) => rules.map((r, i) => i === index ? { ...r, label: event.target.value } : r))} />
                          <p className="text-xs text-muted-foreground">Friendly name shown to staff.</p>
                        </div>
                        <div className="space-y-1">
                          <Label>How serious is this?</Label>
                          <select
                            value={rule.severity}
                            onChange={(event) => setEscalationRules((rules) => rules.map((r, i) => i === index ? { ...r, severity: event.target.value } : r))}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            {['LOW', 'NORMAL', 'HIGH', 'EMERGENCY'].map((severity) => (
                              <option key={severity} value={severity}>{severity}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label>Staff task priority</Label>
                          <select
                            value={rule.taskPriority}
                            onChange={(event) => setEscalationRules((rules) => rules.map((r, i) => i === index ? { ...r, taskPriority: event.target.value } : r))}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            {['NORMAL', 'HIGH', 'URGENT'].map((priority) => (
                              <option key={priority} value={priority}>{priority}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>Customer words that trigger this rule</Label>
                        <Input
                          value={rule.keywords}
                          onChange={(event) => setEscalationRules((rules) => rules.map((r, i) => i === index ? { ...r, keywords: event.target.value } : r))}
                          placeholder="refund, manager, urgent"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>What the AI says to the customer</Label>
                        <textarea
                          value={rule.customerReply}
                          onChange={(event) => setEscalationRules((rules) => rules.map((r, i) => i === index ? { ...r, customerReply: event.target.value } : r))}
                          rows={3}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Staff notification subject</Label>
                        <Input value={rule.ownerSubject} onChange={(event) => setEscalationRules((rules) => rules.map((r, i) => i === index ? { ...r, ownerSubject: event.target.value } : r))} />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={rule.stopAutomation}
                          onChange={(event) => setEscalationRules((rules) => rules.map((r, i) => i === index ? { ...r, stopAutomation: event.target.checked } : r))}
                        />
                        Stop AI replies and hand off to staff
                      </label>
                    </div>
                  ))}
                </div>
              </details>
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
