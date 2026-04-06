import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { posRegistry } from '@/lib/server/pos/registry';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  try {
    const adapter = posRegistry.get(params.provider);
    const url = adapter.getOAuthUrl(tenantId);
    return apiSuccess({ url, provider: params.provider });
  } catch (err: any) {
    return apiError('Internal server error', 500);
  }
}
