import { NextRequest } from 'next/server';
import { z } from 'zod';
import { TenantMemberRole } from '@prisma/client';
import { requireTenantRole, isNextResponse } from '@/lib/server/auth';
import { posRegistry } from '@/lib/server/pos/registry';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';
import { SquareMenuScopeError } from '@/lib/server/pos/adapters/squareMenuScope';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  menuId: z.string().min(1),
});

/** Persist the provider menu that all future catalog pulls must use. */
export async function POST(
  request: NextRequest,
  { params }: { params: { provider: string } },
) {
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  const authResult = await requireTenantRole(tenantId, [
    TenantMemberRole.OWNER,
    TenantMemberRole.MANAGER,
  ]);
  if (isNextResponse(authResult)) return authResult;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (err: any) {
    return apiError(err?.message ?? 'Invalid body', 400);
  }

  try {
    const menu = await posRegistry.get(params.provider).configureMenu(tenantId, body.menuId);
    return apiSuccess({ menuId: menu.id, name: menu.name });
  } catch (err: any) {
    logger.warn('[POST /integrations/:provider/configure-menu] failed', {
      tenantId,
      provider: params.provider,
      menuId: body.menuId,
      err: err?.message,
    });
    return apiError(
      err?.message ?? 'Failed to select menu',
      err instanceof SquareMenuScopeError ? 422 : 500,
    );
  }
}
