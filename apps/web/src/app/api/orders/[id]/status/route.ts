import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { OrderStatus } from '@prisma/client';
import { getOrderById, updateOrderStatus } from '@/lib/server/services/orderService';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { AppError } from '@/lib/server/errors';

const STATUS_TRANSITIONS: Record<string, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY, OrderStatus.CANCELLED],
  READY: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { status, tenantId } = z
      .object({ status: z.nativeEnum(OrderStatus), tenantId: z.string().min(1) })
      .parse(await req.json());
    const authResult = await verifyTenantAccess(tenantId);
    if (isNextResponse(authResult)) return authResult;

    const order = await getOrderById(params.id, tenantId);
    if (!order) return apiError('Order not found', 404);
    const allowed = STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(status)) return apiError(`Cannot transition from ${order.status} to ${status}`, 400);
    const updated = await updateOrderStatus(params.id, tenantId, status);
    return apiSuccess(updated);
  } catch (err) {
    if (err instanceof AppError) return apiError(err.message, err.statusCode);
    return apiError('Internal server error', 500);
  }
}
