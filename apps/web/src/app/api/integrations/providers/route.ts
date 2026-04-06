import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { posRegistry } from '@/lib/server/pos/registry';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  const tenantId = new URL(request.url).searchParams.get('tenantId');
  const tenant = tenantId ? await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { posProvider: true, posMerchantId: true, posLocationId: true, posTokenExpiresAt: true, plan: true },
  }) : null;
  const providers = posRegistry.getAll().map((a) => ({
    provider: a.provider, displayName: a.displayName, authType: a.authType,
    connected: tenant?.posProvider === a.provider && !!tenant?.posMerchantId,
    merchantId: tenant?.posProvider === a.provider ? tenant?.posMerchantId : null,
    locationId: tenant?.posProvider === a.provider ? tenant?.posLocationId : null,
    tokenExpiresAt: tenant?.posProvider === a.provider ? tenant?.posTokenExpiresAt : null,
    planGated: tenant?.plan === 'STARTER',
  }));
  return apiSuccess(providers);
}
