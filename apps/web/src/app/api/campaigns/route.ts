import { NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { apiSuccess, apiError } from '@/lib/server/response';
import { prisma } from '@/lib/server/db';

const CreateBody = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1).max(80),
  body: z.string().min(1).max(1600),
  scheduledFor: z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId required', 400);
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;
  const campaigns = await prisma.smsCampaign.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return apiSuccess(campaigns);
}

export async function POST(req: NextRequest) {
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return apiError('Invalid body', 400);
  const authResult = await verifyTenantAccess(parsed.data.tenantId);
  if (isNextResponse(authResult)) return authResult;
  const campaign = await prisma.smsCampaign.create({
    data: {
      tenantId: parsed.data.tenantId,
      name: parsed.data.name,
      body: parsed.data.body,
      status: 'DRAFT',
      scheduledFor: parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : null,
      createdBy: authResult.userId,
    },
  });
  return apiSuccess(campaign);
}
