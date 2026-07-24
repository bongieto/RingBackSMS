import { NextRequest } from 'next/server';
import { z } from 'zod';
import { TenantMemberRole } from '@prisma/client';
import {
  formatFactsForPrompt,
  parseGroundedResponse,
  validateGroundedResponse,
  type VerifiedKnowledgeFact,
} from '@ringback/flow-engine';
import { requireTenantRole, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiError, apiSuccess } from '@/lib/server/response';
import { chatCompletion } from '@/lib/server/services/aiClient';

const RequestSchema = z.object({
  provider: z.enum(['claude', 'minimax']).default('claude'),
  limit: z.number().int().min(1).max(50).default(25),
});

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireTenantRole(params.id, [
    TenantMemberRole.OWNER,
    TenantMemberRole.MANAGER,
  ]);
  if (isNextResponse(auth)) return auth;

  try {
    const body = RequestSchema.parse(await req.json());
    const rows = await prisma.knowledgeFact.findMany({
      where: {
        tenantId: params.id,
        isActive: true,
        isVerified: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: body.limit,
    });
    if (rows.length === 0) {
      return apiError('Add and verify at least one knowledge fact before evaluating', 400);
    }

    const results: Array<{
      factId: string;
      key: string;
      question: string;
      answer: string;
      passed: boolean;
      reason: string | null;
    }> = [];

    for (const row of rows) {
      const fact: VerifiedKnowledgeFact = {
        id: row.id,
        key: row.key,
        category: row.category,
        question: row.question,
        answer: row.answer,
        aliases: row.aliases,
        source: row.source,
        verifiedAt: row.verifiedAt?.toISOString() ?? null,
      };
      const systemPrompt = `You write one concise SMS answer using ONLY the verified facts below.
Return strict JSON only with exactly these keys:
{"answer":"...","supportedFactIds":["..."],"confidence":0.0,"needsHuman":false}
Every factual claim must be supported by a cited fact ID. Preserve exact numbers and policy wording.

Verified facts:
${formatFactsForPrompt([fact])}`;
      try {
        const raw = await chatCompletion({
          systemPrompt,
          userMessage: row.question,
          maxTokens: 180,
          temperature: 0.1,
          riskLevel: 'low',
          providerMode: body.provider,
          tenantId: params.id,
          purpose: 'accuracy_evaluation',
          metadata: { factId: row.id, providerUnderTest: body.provider },
        });
        const parsed = parseGroundedResponse(raw);
        if (!parsed) {
          results.push({
            factId: row.id,
            key: row.key,
            question: row.question,
            answer: '',
            passed: false,
            reason: 'invalid_grounded_response_contract',
          });
          continue;
        }
        const validation = validateGroundedResponse({
          response: parsed,
          retrievedFacts: [fact],
          userMessage: row.question,
        });
        results.push({
          factId: row.id,
          key: row.key,
          question: row.question,
          answer: parsed.answer,
          passed: validation.valid,
          reason: validation.valid ? null : validation.reason,
        });
      } catch (error) {
        results.push({
          factId: row.id,
          key: row.key,
          question: row.question,
          answer: '',
          passed: false,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const passed = results.filter((result) => result.passed).length;
    const score = results.length ? passed / results.length : 0;
    return apiSuccess({
      provider: body.provider,
      passed,
      total: results.length,
      score,
      highRiskEligible: score >= 0.9,
      enablement:
        body.provider === 'minimax' && score >= 0.9
          ? 'Set MINIMAX_HIGH_RISK_ENABLED=1 to permit this provider for high-risk fallback.'
          : null,
      results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return apiError(error.message, 400);
    return apiError('Accuracy evaluation failed', 500);
  }
}
