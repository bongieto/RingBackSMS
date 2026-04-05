import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { updateTenantConfig } from '@/lib/server/services/tenantService';
import { UpdateTenantConfigRequestSchema } from '@ringback/shared-types';
import { apiSuccess, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return apiError('Unauthorized', 401);
  try {
    const body = UpdateTenantConfigRequestSchema.parse(await req.json());
    const config = await updateTenantConfig(params.id, body);
    return apiSuccess(config);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    return apiError('Internal server error', 500);
  }
}
