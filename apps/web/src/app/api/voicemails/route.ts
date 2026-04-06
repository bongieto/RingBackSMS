import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiPaginated, apiError } from '@/lib/server/response';

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId required', 400);

  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(req.nextUrl.searchParams.get('pageSize') ?? '20', 10);

  const where = {
    tenantId,
    voicemailUrl: { not: null },
  };

  const [data, total] = await Promise.all([
    prisma.missedCall.findMany({
      where,
      select: {
        id: true,
        callerPhone: true,
        voicemailDuration: true,
        voicemailReceivedAt: true,
        occurredAt: true,
        smsSent: true,
      },
      orderBy: { voicemailReceivedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.missedCall.count({ where }),
  ]);

  return apiPaginated(data, total, page, pageSize);
}
