import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { MenuIdsRequestSchema } from '@ringback/shared-types';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { bulkDeleteMenuItems } from '@/lib/server/services/tenantService';
import { apiSuccess, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await verifyTenantAccess(params.id);
  if (isNextResponse(authResult)) return authResult;
  try {
    const body = MenuIdsRequestSchema.parse(await req.json());
    return apiSuccess(await bulkDeleteMenuItems(params.id, body.ids));
  } catch (err) {
    if (err instanceof ZodError) return apiError('Invalid item selection', 400);
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    console.error('[POST items/bulk-delete] failed', err);
    return apiError('Failed to delete items', 500);
  }
}
