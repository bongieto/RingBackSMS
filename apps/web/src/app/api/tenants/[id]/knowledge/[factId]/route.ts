import { NextRequest } from 'next/server';
import { z } from 'zod';
import { TenantMemberRole } from '@prisma/client';
import { requireTenantRole, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiError, apiSuccess } from '@/lib/server/response';

const FactPatchSchema = z.object({
  key: z.string().trim().min(2).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/i).optional(),
  category: z.string().trim().min(2).max(50).optional(),
  question: z.string().trim().min(3).max(300).optional(),
  answer: z.string().trim().min(1).max(2000).optional(),
  aliases: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  sourceUrl: z.string().url().nullable().optional(),
  isVerified: z.boolean().optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

async function authorizedFact(tenantId: string, factId: string) {
  return prisma.knowledgeFact.findFirst({ where: { id: factId, tenantId } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; factId: string } },
) {
  const auth = await requireTenantRole(params.id, [
    TenantMemberRole.OWNER,
    TenantMemberRole.MANAGER,
  ]);
  if (isNextResponse(auth)) return auth;
  if (!(await authorizedFact(params.id, params.factId))) return apiError('Fact not found', 404);
  try {
    const body = FactPatchSchema.parse(await req.json());
    const fact = await prisma.knowledgeFact.update({
      where: { id: params.factId },
      data: {
        ...body,
        expiresAt:
          body.expiresAt === undefined
            ? undefined
            : body.expiresAt
              ? new Date(body.expiresAt)
              : null,
        verifiedAt:
          body.isVerified === undefined ? undefined : body.isVerified ? new Date() : null,
      },
    });
    return apiSuccess(fact);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors.map((item) => item.message).join('; '), 400);
    }
    return apiError('Unable to update knowledge fact', 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; factId: string } },
) {
  const auth = await requireTenantRole(params.id, [
    TenantMemberRole.OWNER,
    TenantMemberRole.MANAGER,
  ]);
  if (isNextResponse(auth)) return auth;
  if (!(await authorizedFact(params.id, params.factId))) return apiError('Fact not found', 404);
  await prisma.knowledgeFact.delete({ where: { id: params.factId } });
  return apiSuccess({ deleted: true });
}
