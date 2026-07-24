import { NextRequest } from 'next/server';
import { z } from 'zod';
import { TenantMemberRole } from '@prisma/client';
import { requireTenantRole, verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiError, apiSuccess } from '@/lib/server/response';

const FactInputSchema = z.object({
  key: z.string().trim().min(2).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/i),
  category: z.string().trim().min(2).max(50),
  question: z.string().trim().min(3).max(300),
  answer: z.string().trim().min(1).max(2000),
  aliases: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  source: z.enum(['OWNER', 'IMPORT', 'WEBSITE']).default('OWNER'),
  sourceUrl: z.string().url().nullable().optional(),
  isVerified: z.boolean().default(false),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await verifyTenantAccess(params.id);
  if (isNextResponse(auth)) return auth;
  const facts = await prisma.knowledgeFact.findMany({
    where: { tenantId: params.id },
    orderBy: [{ isVerified: 'asc' }, { category: 'asc' }, { updatedAt: 'desc' }],
  });
  return apiSuccess(facts);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireTenantRole(params.id, [
    TenantMemberRole.OWNER,
    TenantMemberRole.MANAGER,
  ]);
  if (isNextResponse(auth)) return auth;
  try {
    const body = FactInputSchema.parse(await req.json());
    const now = body.isVerified ? new Date() : null;
    const fact = await prisma.knowledgeFact.create({
      data: {
        tenantId: params.id,
        ...body,
        sourceUrl: body.sourceUrl ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        verifiedAt: now,
      },
    });
    return apiSuccess(fact, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.errors.map((item) => item.message).join('; '), 400);
    }
    if ((error as { code?: string }).code === 'P2002') {
      return apiError('A knowledge fact with this key already exists', 409);
    }
    return apiError('Unable to create knowledge fact', 500);
  }
}
