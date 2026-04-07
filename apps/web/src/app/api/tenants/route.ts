import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createTenant } from '@/lib/server/services/tenantService';
import { CreateTenantRequestSchema } from '@ringback/shared-types';
import { apiCreated, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';
import { prisma } from '@/lib/server/db';

export async function POST(request: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  try {
    const body = CreateTenantRequestSchema.parse(await request.json());

    // Idempotent: if a tenant already exists for this Clerk org, return it
    // instead of failing on the unique clerkOrgId constraint.
    if (orgId) {
      const existing = await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } });
      if (existing) return apiCreated(existing);
    }

    const tenant = await createTenant({ ...body, clerkOrgId: orgId ?? undefined });
    return apiCreated(tenant);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    console.error('[POST /api/tenants] failed', err);
    return apiError('Internal server error', 500);
  }
}
