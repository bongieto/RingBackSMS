import { NextRequest } from 'next/server';
import { TenantMemberRole } from '@prisma/client';
import { requireTenantRole, isNextResponse } from '@/lib/server/auth';
import { posRegistry } from '@/lib/server/pos/registry';
import { apiSuccess } from '@/lib/server/response';

export async function POST(request: NextRequest, { params }: { params: { provider: string } }) {
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  const authResult = await requireTenantRole(tenantId, [
    TenantMemberRole.OWNER,
    TenantMemberRole.MANAGER,
  ]);
  if (isNextResponse(authResult)) return authResult;

  await posRegistry.get(params.provider).refreshToken(tenantId);
  return apiSuccess({ refreshed: true });
}
