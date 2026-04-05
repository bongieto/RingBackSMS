import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
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
