import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess } from '@/lib/server/response';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tenants/:id/consent-status
 *
 * Returns the latest consent status for each caller phone that has
 * a consent request record. Used by the conversations page to show
 * consent badges.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;

  // Optional phone filter (conversations page sends specific phones it needs)
  const phonesParam = new URL(req.url).searchParams.get('phones');
  const phoneFilter = phonesParam
    ? phonesParam.split(',').map(p => p.trim()).filter(Boolean)
    : null;

  // Get the latest consent request per caller phone.
  // Capped at 2000 rows for safety; filter to actionable statuses only.
  const requests = await prisma.smsConsentRequest.findMany({
    where: {
      tenantId: params.id,
      status: { in: ['PENDING', 'CONSENTED', 'DECLINED'] },
      ...(phoneFilter ? { callerPhone: { in: phoneFilter } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 2000,
    select: {
      callerPhone: true,
      status: true,
    },
  });

  // Deduplicate: keep only the latest per phone
  const statusByPhone: Record<string, string> = {};
  for (const r of requests) {
    if (!statusByPhone[r.callerPhone]) {
      statusByPhone[r.callerPhone] = r.status;
    }
  }

  return apiSuccess(statusByPhone);
}
