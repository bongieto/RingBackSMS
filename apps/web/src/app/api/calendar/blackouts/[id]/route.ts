import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  // Look up the blackout's tenant first so we can authorize properly. A
  // direct `delete where id` would let any signed-in user delete any
  // blackout if they guessed the id.
  const blackout = await prisma.calendarBlackout.findUnique({
    where: { id: params.id },
    select: { tenantId: true },
  });
  if (!blackout) return apiError('Blackout not found', 404);

  const authResult = await verifyTenantAccess(blackout.tenantId);
  if (isNextResponse(authResult)) return authResult;

  await prisma.calendarBlackout.delete({ where: { id: params.id } });
  return apiSuccess({ ok: true });
}
