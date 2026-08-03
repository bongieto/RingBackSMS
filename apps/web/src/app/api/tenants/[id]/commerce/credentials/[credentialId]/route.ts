import { NextRequest } from 'next/server';
import { requireTenantRole, isNextResponse } from '@/lib/server/auth';
import { apiError } from '@/lib/server/response';
import { prisma } from '@/lib/server/db';
import { TenantMemberRole } from '@prisma/client';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; credentialId: string } }
) {
  const auth = await requireTenantRole(params.id, [TenantMemberRole.OWNER]);
  if (isNextResponse(auth)) return auth;
  const result = await prisma.apiCredential.updateMany({
    where: { id: params.credentialId, tenantId: params.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) return apiError('Credential not found', 404);
  return new Response(null, { status: 204 });
}
