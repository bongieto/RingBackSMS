import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess } from '@/lib/server/response';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await verifyTenantAccess(params.id);
  if (isNextResponse(auth)) return auth;
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get('days') ?? 30)));
  const since = new Date(Date.now() - days * 86_400_000);
  const [audits, factCount, unverifiedCount] = await Promise.all([
    prisma.aiResponseAudit.findMany({
      where: { tenantId: params.id, createdAt: { gte: since } },
      select: {
        validationStatus: true,
        riskLevel: true,
        needsHuman: true,
        providerFallbackUsed: true,
        customerCorrection: true,
        provider: true,
        model: true,
        createdAt: true,
      },
    }),
    prisma.knowledgeFact.count({
      where: { tenantId: params.id, isActive: true, isVerified: true },
    }),
    prisma.knowledgeFact.count({
      where: { tenantId: params.id, isActive: true, isVerified: false },
    }),
  ]);

  const factual = audits.filter((audit) => audit.riskLevel === 'high');
  const grounded = factual.filter((audit) => audit.validationStatus === 'grounded').length;
  const deflected = factual.length - grounded;
  const corrections = audits.filter((audit) => audit.customerCorrection).length;
  const fallbackCalls = audits.filter((audit) => audit.providerFallbackUsed).length;
  const daily = new Map<string, { grounded: number; deflected: number; total: number }>();
  for (const audit of factual) {
    const key = audit.createdAt.toISOString().slice(0, 10);
    const bucket = daily.get(key) ?? { grounded: 0, deflected: 0, total: 0 };
    bucket.total += 1;
    if (audit.validationStatus === 'grounded') bucket.grounded += 1;
    else bucket.deflected += 1;
    daily.set(key, bucket);
  }

  return apiSuccess({
    days,
    knowledge: { verified: factCount, awaitingReview: unverifiedCount },
    totals: {
      audited: audits.length,
      factual: factual.length,
      grounded,
      deflected,
      corrections,
      providerFallbackCalls: fallbackCalls,
      groundedRate: factual.length ? grounded / factual.length : null,
    },
    daily: [...daily.entries()].map(([date, values]) => ({ date, ...values })),
  });
}
