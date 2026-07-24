'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenCheck, CheckCircle2, FlaskConical, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { tenantApi } from '@/lib/api';
import { useTenantId } from '@/components/providers/TenantProvider';

type KnowledgeFact = {
  id: string;
  key: string;
  category: string;
  question: string;
  answer: string;
  aliases: string[];
  source: string;
  isVerified: boolean;
  isActive: boolean;
  updatedAt: string;
};

type AccuracyReport = {
  knowledge: { verified: number; awaitingReview: number };
  totals: {
    audited: number;
    factual: number;
    grounded: number;
    deflected: number;
    corrections: number;
    providerFallbackCalls: number;
    groundedRate: number | null;
  };
};

type EvaluationReport = {
  provider: string;
  passed: number;
  total: number;
  score: number;
  highRiskEligible: boolean;
  enablement: string | null;
  results: Array<{ key: string; passed: boolean; reason: string | null }>;
};

const emptyDraft = {
  key: '',
  category: 'POLICY',
  question: '',
  answer: '',
  aliases: '',
};

export default function AiKnowledgePage() {
  const { tenantId } = useTenantId();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(emptyDraft);
  const [evaluation, setEvaluation] = useState<EvaluationReport | null>(null);

  const { data: facts = [], isLoading } = useQuery<KnowledgeFact[]>({
    queryKey: ['knowledge', tenantId],
    queryFn: () => tenantApi.getKnowledge(tenantId!),
    enabled: Boolean(tenantId),
  });
  const { data: accuracy } = useQuery<AccuracyReport>({
    queryKey: ['knowledge-accuracy', tenantId],
    queryFn: () => tenantApi.getAccuracy(tenantId!),
    enabled: Boolean(tenantId),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['knowledge', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['knowledge-accuracy', tenantId] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      tenantApi.createKnowledgeFact(tenantId!, {
        key: draft.key.trim(),
        category: draft.category.trim().toUpperCase(),
        question: draft.question.trim(),
        answer: draft.answer.trim(),
        aliases: draft.aliases.split(',').map((value) => value.trim()).filter(Boolean),
        source: 'OWNER',
        isVerified: true,
      }),
    onSuccess: () => {
      setDraft(emptyDraft);
      refresh();
      toast.success('Verified fact added');
    },
    onError: (error: any) =>
      toast.error(error?.response?.data?.error ?? 'Unable to add fact'),
  });

  const verifyMutation = useMutation({
    mutationFn: (fact: KnowledgeFact) =>
      tenantApi.updateKnowledgeFact(tenantId!, fact.id, {
        isVerified: !fact.isVerified,
      }),
    onSuccess: refresh,
    onError: () => toast.error('Unable to update verification'),
  });

  const deleteMutation = useMutation({
    mutationFn: (factId: string) => tenantApi.deleteKnowledgeFact(tenantId!, factId),
    onSuccess: refresh,
    onError: () => toast.error('Unable to delete fact'),
  });

  const evaluationMutation = useMutation({
    mutationFn: (provider: 'claude' | 'minimax') =>
      tenantApi.evaluateKnowledge(tenantId!, provider) as Promise<EvaluationReport>,
    onSuccess: (result) => {
      setEvaluation(result);
      toast.success(`${result.provider} evaluation complete`);
    },
    onError: (error: any) =>
      toast.error(error?.response?.data?.error ?? 'Evaluation failed'),
  });

  const groundedRate = accuracy?.totals.groundedRate;

  return (
    <div>
      <Header
        title="AI Knowledge & Accuracy"
        description="Approve the exact facts the text bot may use, then test each provider against them."
      />

      <div className="grid gap-4 md:grid-cols-4 mb-6">
        {[
          ['Verified facts', accuracy?.knowledge.verified ?? 0],
          ['Awaiting review', accuracy?.knowledge.awaitingReview ?? 0],
          ['Grounded factual replies', accuracy?.totals.grounded ?? 0],
          ['Grounded rate', groundedRate == null ? 'No data' : `${Math.round(groundedRate * 100)}%`],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">{label}</div>
              <div className="text-2xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add verified fact
            </CardTitle>
            <CardDescription>
              Use one fact per policy, service, fee, coverage area, or common question.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Stable key</Label>
              <Input
                value={draft.key}
                onChange={(event) => setDraft({ ...draft, key: event.target.value })}
                placeholder="policy.cancellation"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                placeholder="POLICY"
              />
            </div>
            <div className="space-y-2">
              <Label>Customer question</Label>
              <Input
                value={draft.question}
                onChange={(event) => setDraft({ ...draft, question: event.target.value })}
                placeholder="What is your cancellation policy?"
              />
            </div>
            <div className="space-y-2">
              <Label>Exact approved answer</Label>
              <textarea
                value={draft.answer}
                onChange={(event) => setDraft({ ...draft, answer: event.target.value })}
                rows={5}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Cancellations require 24 hours notice."
              />
            </div>
            <div className="space-y-2">
              <Label>Matching phrases, comma-separated</Label>
              <Input
                value={draft.aliases}
                onChange={(event) => setDraft({ ...draft, aliases: event.target.value })}
                placeholder="cancel, reschedule, cancellation fee"
              />
            </div>
            <Button
              className="w-full"
              disabled={!draft.key.trim() || !draft.question.trim() || !draft.answer.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Add and verify
            </Button>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpenCheck className="h-5 w-5" />
              Knowledge facts
            </CardTitle>
            <CardDescription>
              Website imports remain blocked until you verify them. System hours, address, phone, and catalog facts are generated automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading facts…</div>
            ) : facts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                No owner-managed facts yet. Add your most common policy or service question.
              </div>
            ) : facts.map((fact) => (
              <div key={fact.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{fact.question}</span>
                      <Badge variant={fact.isVerified ? 'default' : 'outline'}>
                        {fact.isVerified ? 'Verified' : 'Awaiting review'}
                      </Badge>
                      <Badge variant="outline">{fact.category}</Badge>
                      <Badge variant="outline">{fact.source}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">{fact.answer}</p>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {fact.key}{fact.aliases.length ? ` · Matches: ${fact.aliases.join(', ')}` : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => verifyMutation.mutate(fact)}>
                      {fact.isVerified ? 'Unverify' : 'Verify'}
                    </Button>
                    <Button size="icon" variant="outline" onClick={() => deleteMutation.mutate(fact.id)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5" />
            Live provider evaluation
          </CardTitle>
          <CardDescription>
            Runs each verified owner fact through the configured provider. A fallback provider must score at least 90% before high-risk fallback should be enabled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => evaluationMutation.mutate('claude')} disabled={evaluationMutation.isPending}>
              Test Claude
            </Button>
            <Button variant="outline" onClick={() => evaluationMutation.mutate('minimax')} disabled={evaluationMutation.isPending}>
              Test MiniMax
            </Button>
          </div>
          {evaluation && (
            <div className="mt-4 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{evaluation.provider}</strong>
                <Badge variant={evaluation.highRiskEligible ? 'default' : 'destructive'}>
                  {Math.round(evaluation.score * 100)}% · {evaluation.passed}/{evaluation.total}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {evaluation.highRiskEligible ? 'Eligible for high-risk use' : 'Keep high-risk fallback disabled'}
                </span>
              </div>
              {evaluation.enablement && (
                <p className="mt-2 text-sm text-muted-foreground">{evaluation.enablement}</p>
              )}
              {evaluation.results.some((result) => !result.passed) && (
                <ul className="mt-3 list-disc pl-5 text-sm text-red-700">
                  {evaluation.results.filter((result) => !result.passed).map((result) => (
                    <li key={result.key}>{result.key}: {result.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
