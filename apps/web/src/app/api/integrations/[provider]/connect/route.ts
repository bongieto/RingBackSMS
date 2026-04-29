import { NextRequest } from 'next/server';
import { TenantMemberRole } from '@prisma/client';
import { requireTenantRole, isNextResponse } from '@/lib/server/auth';
import { posRegistry } from '@/lib/server/pos/registry';
import { signPosOAuthState } from '@/lib/server/pos/oauthState';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  const authResult = await requireTenantRole(tenantId, [
    TenantMemberRole.OWNER,
    TenantMemberRole.MANAGER,
  ]);
  if (isNextResponse(authResult)) return authResult;

  try {
    const adapter = posRegistry.get(params.provider);
    const state = signPosOAuthState(tenantId, params.provider);
    const url = adapter.getOAuthUrl(tenantId, state);
    return apiSuccess({ url, provider: params.provider });
  } catch (err: any) {
    return apiError('Internal server error', 500);
  }
}
