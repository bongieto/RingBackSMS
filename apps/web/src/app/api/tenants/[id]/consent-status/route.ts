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

  // Get the latest consent request per caller phone
  const requests = await prisma.smsConsentRequest.findMany({
    where: { tenantId: params.id },
    orderBy: { createdAt: 'desc' },
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
