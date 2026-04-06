import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { posProvider: true, posMerchantId: true, posLocationId: true, posTokenExpiresAt: true },
  });
  return apiSuccess({
    provider: params.provider,
    connected: tenant?.posProvider === params.provider && !!tenant?.posMerchantId,
    merchantId: tenant?.posProvider === params.provider ? tenant?.posMerchantId : null,
    locationId: tenant?.posProvider === params.provider ? tenant?.posLocationId : null,
    tokenExpiresAt: tenant?.posProvider === params.provider ? tenant?.posTokenExpiresAt : null,
  });
}
