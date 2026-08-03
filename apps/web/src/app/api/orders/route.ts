import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { OrderStatus } from '@prisma/client';
import { getKitchenOrders, getTenantOrders } from '@/lib/server/services/orderService';
import { apiPaginated, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId is required', 400);
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const status = searchParams.get('status') as OrderStatus | null;
  const kitchen = searchParams.get('kitchen') === 'true';
  const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10) || 1, 1);
  // Clamp: an unclamped ?pageSize=100000 would dump an entire tenant's
  // table in one query.
  const pageSize = Math.min(Math.max(parseInt(searchParams.get('pageSize') ?? '20', 10) || 20, 1), 100);
  if (status && !Object.values(OrderStatus).includes(status)) return apiError(`Invalid status: ${status}`, 400);
  try {
    if (kitchen) {
      const orders = await getKitchenOrders(tenantId);
      return apiPaginated(orders, orders.length, 1, 250);
    }
    const { orders, total } = await getTenantOrders(tenantId, status ?? undefined, page, pageSize);
    return apiPaginated(orders, total, page, pageSize);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    return apiError('Internal server error', 500);
  }
}
