import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createTenant } from '@/lib/server/services/tenantService';
import { CreateTenantRequestSchema } from '@ringback/shared-types';
import { apiCreated, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';

export async function POST(request: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  try {
    const body = CreateTenantRequestSchema.parse(await request.json());
    const tenant = await createTenant({ ...body, clerkOrgId: orgId ?? undefined });
    return apiCreated(tenant);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    const message = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/tenants] failed', err);
    return apiError(`Internal server error: ${message}`, 500);
  }
}
