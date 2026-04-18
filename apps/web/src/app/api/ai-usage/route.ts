import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { apiSuccess, apiError } from '@/lib/server/response';
import { prisma } from '@/lib/server/db';

/**
 * Per-day AI token usage + estimated cost for a tenant over a rolling
 * window. Pricing table lives here — conservative published rates as of
 * ship date; treat estimates as ±10%.
 *
 * Query:  /api/ai-usage?tenantId=...&days=30
 */
const MODEL_COSTS: Record<string, { inPer1k: number; outPer1k: number }> = {
  // Anthropic public pricing, USD per 1k tokens.
  'claude-sonnet-4-20250514': { inPer1k: 0.003, outPer1k: 0.015 },
  'claude-3-5-sonnet-20241022': { inPer1k: 0.003, outPer1k: 0.015 },
  'claude-3-5-haiku-20241022': { inPer1k: 0.0008, outPer1k: 0.004 },
  'claude-3-haiku-20240307': { inPer1k: 0.00025, outPer1k: 0.00125 },
  // MiniMax pricing.
  'abab6.5s-chat': { inPer1k: 0.001, outPer1k: 0.001 },
};

function estimateCostCents(model: string, inTokens: number, outTokens: number): number {
  const rate = MODEL_COSTS[model];
  if (!rate) return 0;
  const dollars = (inTokens / 1000) * rate.inPer1k + (outTokens / 1000) * rate.outPer1k;
  return Math.round(dollars * 100);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId required', 400);
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const days = Math.min(365, Math.max(1, parseInt(searchParams.get('days') ?? '30', 10) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.aiUsageLog.findMany({
    where: { tenantId, createdAt: { gte: since } },
    select: {
      model: true,
      purpose: true,
      inputTokens: true,
      outputTokens: true,
      success: true,
      createdAt: true,
    },
  });

  let totalIn = 0;
  let totalOut = 0;
  let totalCostCents = 0;
  const byPurpose = new Map<string, { calls: number; inTokens: number; outTokens: number; costCents: number }>();
  const byModel = new Map<string, { calls: number; costCents: number }>();
  const dayBuckets = new Map<string, { costCents: number; calls: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    dayBuckets.set(d.toISOString().slice(0, 10), { costCents: 0, calls: 0 });
  }

  for (const r of rows) {
    totalIn += r.inputTokens;
    totalOut += r.outputTokens;
    const cost = estimateCostCents(r.model, r.inputTokens, r.outputTokens);
    totalCostCents += cost;

    const pBucket = byPurpose.get(r.purpose) ?? { calls: 0, inTokens: 0, outTokens: 0, costCents: 0 };
    pBucket.calls += 1;
    pBucket.inTokens += r.inputTokens;
    pBucket.outTokens += r.outputTokens;
    pBucket.costCents += cost;
    byPurpose.set(r.purpose, pBucket);

    const mBucket = byModel.get(r.model) ?? { calls: 0, costCents: 0 };
    mBucket.calls += 1;
    mBucket.costCents += cost;
    byModel.set(r.model, mBucket);

    const key = r.createdAt.toISOString().slice(0, 10);
    const dBucket = dayBuckets.get(key);
    if (dBucket) {
      dBucket.costCents += cost;
      dBucket.calls += 1;
    }
  }

  return apiSuccess({
    totals: {
      calls: rows.length,
      inputTokens: totalIn,
      outputTokens: totalOut,
      costCents: totalCostCents,
    },
    dailySeries: Array.from(dayBuckets.entries()).map(([date, v]) => ({
      date,
      costCents: v.costCents,
      calls: v.calls,
    })),
    byPurpose: Array.from(byPurpose.entries())
      .map(([purpose, v]) => ({ purpose, ...v }))
      .sort((a, b) => b.costCents - a.costCents),
    byModel: Array.from(byModel.entries())
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.costCents - a.costCents),
  });
}
