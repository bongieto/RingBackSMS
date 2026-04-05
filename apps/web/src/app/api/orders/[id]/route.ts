import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getOrderById } from '@/lib/server/services/orderService';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  const tenantId = new URL(request.url).searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId is required', 400);
  const order = await getOrderById(params.id, tenantId);
  if (!order) return apiError('Order not found', 404);
  return apiSuccess(order);
}
