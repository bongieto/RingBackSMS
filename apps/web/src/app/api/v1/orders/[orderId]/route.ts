import { NextRequest } from 'next/server';
import { CommerceScopes } from '@ringback/shared-types';
import { authenticateCommerceRequest } from '@/lib/server/commerce/apiAuth';
import { commerceError, commerceResponse } from '@/lib/server/commerce/http';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';
import { decryptMaybePlaintext } from '@/lib/server/encryption';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    const auth = await authenticateCommerceRequest(request, [CommerceScopes.ORDERS_READ]);
    const order = await prisma.order.findFirst({
      where: { id: params.orderId, tenantId: auth.tenantId },
      select: {
        id: true,
        orderNumber: true,
        locationId: true,
        customerName: true,
        status: true,
        paymentStatus: true,
        items: true,
        subtotal: true,
        taxAmount: true,
        feeAmount: true,
        tipAmount: true,
        total: true,
        pickupTime: true,
        dineIn: true,
        estimatedReadyTime: true,
        notes: true,
        originSystem: true,
        financialOwner: true,
        fulfillmentOwner: true,
        integrationVersion: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!order) {
      return Response.json(
        { error: { code: 'not_found', message: 'Order not found' } },
        { status: 404 }
      );
    }
    return commerceResponse({
      ...order,
      customerName: decryptMaybePlaintext(order.customerName),
      subtotal: order.subtotal == null ? null : Number(order.subtotal),
      taxAmount: order.taxAmount == null ? null : Number(order.taxAmount),
      feeAmount: order.feeAmount == null ? null : Number(order.feeAmount),
      tipAmount: order.tipAmount == null ? null : Number(order.tipAmount),
      total: Number(order.total),
    });
  } catch (error) {
    logger.warn('Commerce order request failed', { error });
    return commerceError(error);
  }
}
