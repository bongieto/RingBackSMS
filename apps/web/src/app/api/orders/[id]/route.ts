import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { getOrderById } from '@/lib/server/services/orderService';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = new URL(request.url).searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId is required', 400);
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const order = await getOrderById(params.id, tenantId);
  if (!order) return apiError('Order not found', 404);
  return apiSuccess(order);
}
