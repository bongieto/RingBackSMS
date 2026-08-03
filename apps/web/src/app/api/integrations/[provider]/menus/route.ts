import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { posRegistry } from '@/lib/server/pos/registry';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';
import { SquareMenuScopeError } from '@/lib/server/pos/adapters/squareMenuScope';

export const dynamic = 'force-dynamic';

/** GET the provider menus available at the tenant's configured POS location. */
export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } },
) {
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  try {
    const selection = await posRegistry.get(params.provider).listMenus(tenantId);
    return apiSuccess(selection);
  } catch (err: any) {
    logger.warn('[GET /integrations/:provider/menus] failed', {
      tenantId,
      provider: params.provider,
      err: err?.message,
    });
    return apiError(
      err?.message ?? 'Failed to load menus',
      err instanceof SquareMenuScopeError ? 422 : 500,
    );
  }
}
