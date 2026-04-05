import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getTenantById } from '@/lib/server/services/tenantService';
import { apiSuccess, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  try {
    const tenant = await getTenantById(params.id);
    return apiSuccess(tenant);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    return apiError('Internal server error', 500);
  }
}
