import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess } from '@/lib/server/response';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenantId = new URL(req.url).searchParams.get('tenantId') ?? '';
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const cfg = await prisma.tenantConfig.findUnique({
    where: { tenantId },
    select: {
      calcomAccessToken: true,
      calcomUserEmail: true,
      calcomEventTypeId: true,
      calcomEventTypeSlug: true,
    },
  });

  return apiSuccess({
    connected: Boolean(cfg?.calcomAccessToken),
    userEmail: cfg?.calcomUserEmail ?? null,
    eventTypeId: cfg?.calcomEventTypeId ?? null,
    eventTypeSlug: cfg?.calcomEventTypeSlug ?? null,
  });
}
