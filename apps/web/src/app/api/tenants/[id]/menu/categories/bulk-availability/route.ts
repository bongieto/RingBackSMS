import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { bulkSetCategoriesAvailability } from '@/lib/server/services/tenantService';
import { BulkAvailabilityRequestSchema } from '@ringback/shared-types';
import { apiSuccess, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    const body = BulkAvailabilityRequestSchema.parse(await req.json());
    return apiSuccess(
      await bulkSetCategoriesAvailability(params.id, body.ids, body.isAvailable),
    );
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    console.error('[PATCH categories/bulk-availability] failed', err);
    return apiError('Failed to update availability', 500);
  }
}
