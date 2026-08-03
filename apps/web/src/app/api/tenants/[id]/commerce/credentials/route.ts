import { NextRequest } from 'next/server';
import { z } from 'zod';
import { CommerceScopeSchema } from '@ringback/shared-types';
import { requireTenantRole, isNextResponse } from '@/lib/server/auth';
import { generateApiCredential } from '@/lib/server/commerce/apiAuth';
import { apiCreated, apiError, apiSuccess } from '@/lib/server/response';
import { prisma } from '@/lib/server/db';
import { TenantMemberRole } from '@prisma/client';

const CreateCredentialSchema = z.object({
  name: z.string().trim().min(1).max(100),
  provider: z.string().trim().min(1).max(50).default('mcinasal'),
  connectionName: z.string().trim().min(1).max(100).default('McInasal'),
  scopes: z.array(CommerceScopeSchema).min(1),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireTenantRole(params.id, [TenantMemberRole.OWNER]);
  if (isNextResponse(auth)) return auth;
  const credentials = await prisma.apiCredential.findMany({
    where: { tenantId: params.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      connection: { select: { id: true, provider: true, name: true, status: true } },
    },
  });
  return apiSuccess(credentials);
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireTenantRole(params.id, [TenantMemberRole.OWNER]);
  if (isNextResponse(auth)) return auth;
  try {
    const input = CreateCredentialSchema.parse(await request.json());
    const generated = generateApiCredential();
    const credential = await prisma.$transaction(async (tx) => {
      const connection = await tx.integrationConnection.upsert({
        where: {
          tenantId_provider_name: {
            tenantId: params.id,
            provider: input.provider,
            name: input.connectionName,
          },
        },
        create: {
          tenantId: params.id,
          provider: input.provider,
          name: input.connectionName,
        },
        update: { status: 'active' },
      });
      return tx.apiCredential.create({
        data: {
          tenantId: params.id,
          connectionId: connection.id,
          name: input.name,
          keyPrefix: generated.prefix,
          keyHash: generated.hash,
          scopes: [...new Set(input.scopes)],
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          expiresAt: true,
          createdAt: true,
          connectionId: true,
        },
      });
    });
    return apiCreated({ ...credential, token: generated.token });
  } catch (error) {
    if (error instanceof z.ZodError) return apiError('Invalid credential configuration', 400);
    return apiError('Failed to create API credential', 500);
  }
}
