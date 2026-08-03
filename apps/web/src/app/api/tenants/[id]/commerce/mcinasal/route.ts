import { NextRequest } from 'next/server';
import { Prisma, TenantMemberRole } from '@prisma/client';
import { z } from 'zod';
import { requireTenantRole, isNextResponse } from '@/lib/server/auth';
import { encrypt } from '@/lib/server/encryption';
import { prisma } from '@/lib/server/db';
import { apiError, apiSuccess } from '@/lib/server/response';

const ConfigurationSchema = z.object({
  endpointUrl: z.string().url().max(500),
  accessToken: z
    .string()
    .regex(/^mc_rb_live_[A-Za-z0-9_-]{32,}$/)
    .optional(),
  mcinasalLocationId: z.string().uuid(),
  ringbackLocationId: z.string().uuid(),
  enabled: z.boolean().default(false),
});

function validatedEndpoint(raw: string): string {
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !url.hostname.endsWith('.supabase.co') ||
    !url.pathname.endsWith('/functions/v1/ringback-commerce')
  ) {
    throw new Error('McInasal endpoint must be its HTTPS Supabase ringback-commerce function');
  }
  url.search = '';
  url.hash = '';
  return url.toString();
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireTenantRole(params.id, [TenantMemberRole.OWNER]);
  if (isNextResponse(auth)) return auth;
  const connection = await prisma.integrationConnection.findFirst({
    where: { tenantId: params.id, provider: 'mcinasal' },
    select: {
      id: true,
      name: true,
      status: true,
      config: true,
      accessTokenEncrypted: true,
      updatedAt: true,
    },
  });
  if (!connection) return apiSuccess(null);
  return apiSuccess({
    id: connection.id,
    name: connection.name,
    status: connection.status,
    config: connection.config,
    hasAccessToken: Boolean(connection.accessTokenEncrypted),
    updatedAt: connection.updatedAt,
  });
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireTenantRole(params.id, [TenantMemberRole.OWNER]);
  if (isNextResponse(auth)) return auth;
  try {
    const input = ConfigurationSchema.parse(await request.json());
    const endpointUrl = validatedEndpoint(input.endpointUrl);
    const location = await prisma.tenantLocation.findFirst({
      where: { id: input.ringbackLocationId, tenantId: params.id, isActive: true },
      select: { id: true },
    });
    if (!location) return apiError('RingBack location not found', 404);
    const existing = await prisma.integrationConnection.findFirst({
      where: { tenantId: params.id, provider: 'mcinasal', name: 'McInasal' },
      select: { id: true, accessTokenEncrypted: true },
    });
    if (input.enabled && !input.accessToken && !existing?.accessTokenEncrypted) {
      return apiError('An access token is required before enabling McInasal', 400);
    }
    const config = {
      endpointUrl,
      mcinasalLocationId: input.mcinasalLocationId,
      ringbackLocationId: input.ringbackLocationId,
    } satisfies Prisma.InputJsonObject;
    const connection = await prisma.integrationConnection.upsert({
      where: {
        tenantId_provider_name: { tenantId: params.id, provider: 'mcinasal', name: 'McInasal' },
      },
      create: {
        tenantId: params.id,
        provider: 'mcinasal',
        name: 'McInasal',
        status: input.enabled ? 'active' : 'disabled',
        config,
        accessTokenEncrypted: input.accessToken ? encrypt(input.accessToken) : null,
      },
      update: {
        status: input.enabled ? 'active' : 'disabled',
        config,
        ...(input.accessToken && { accessTokenEncrypted: encrypt(input.accessToken) }),
      },
      select: {
        id: true,
        name: true,
        status: true,
        config: true,
        accessTokenEncrypted: true,
        updatedAt: true,
      },
    });
    return apiSuccess({
      id: connection.id,
      name: connection.name,
      status: connection.status,
      config: connection.config,
      hasAccessToken: Boolean(connection.accessTokenEncrypted),
      updatedAt: connection.updatedAt,
    });
  } catch (error) {
    if (
      error instanceof z.ZodError ||
      (error instanceof Error && error.message.includes('endpoint'))
    ) {
      return apiError(error instanceof Error ? error.message : 'Invalid configuration', 400);
    }
    return apiError('Failed to configure McInasal', 500);
  }
}
