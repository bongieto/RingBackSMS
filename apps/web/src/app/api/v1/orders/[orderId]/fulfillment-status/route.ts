import { NextRequest } from 'next/server';
import {
  CommerceScopes,
  FulfillmentUpdateSchema,
  isKitchenPaymentEligible,
} from '@ringback/shared-types';
import { OrderStatus } from '@prisma/client';
import { authenticateCommerceRequest } from '@/lib/server/commerce/apiAuth';
import { commerceError, commerceResponse, conflict } from '@/lib/server/commerce/http';
import { enqueueIntegrationEvent } from '@/lib/server/commerce/outbox';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';
import { autoCompleteTasksForEntity } from '@/lib/server/services/taskService';
import { notifyCustomerOfOrderStatus } from '@/lib/server/services/orderStatusNotification';
import { waitUntil } from '@/lib/server/waitUntil';

export const dynamic = 'force-dynamic';

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PREPARING, OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  READY: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

export async function PATCH(request: NextRequest, { params }: { params: { orderId: string } }) {
  try {
    const auth = await authenticateCommerceRequest(request, [CommerceScopes.FULFILLMENT_WRITE]);
    const input = FulfillmentUpdateSchema.parse(await request.json());
    const existing = await prisma.order.findFirst({
      where: { id: params.orderId, tenantId: auth.tenantId },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        integrationVersion: true,
        locationId: true,
      },
    });
    if (!existing) {
      return Response.json(
        { error: { code: 'not_found', message: 'Order not found' } },
        { status: 404 }
      );
    }
    const tenantConfig = await prisma.tenantConfig.findUnique({
      where: { tenantId: auth.tenantId },
      select: { requirePayment: true },
    });
    if (!isKitchenPaymentEligible(tenantConfig?.requirePayment ?? true, existing.paymentStatus)) {
      return conflict('Order is not payment-eligible for fulfillment');
    }
    if (input.expectedVersion !== existing.integrationVersion) {
      return conflict(`Order integration version is ${existing.integrationVersion}`);
    }
    const nextStatus = input.status as OrderStatus;
    if (!ALLOWED_TRANSITIONS[existing.status].includes(nextStatus)) {
      return conflict(`Cannot transition fulfillment from ${existing.status} to ${nextStatus}`);
    }

    const updated = await prisma
      .$transaction(async (tx) => {
        const result = await tx.order.updateMany({
          where: {
            id: existing.id,
            tenantId: auth.tenantId,
            status: existing.status,
            integrationVersion: input.expectedVersion,
          },
          data: {
            status: nextStatus,
            integrationVersion: { increment: 1 },
            fulfillmentOwner: auth.connectionId
              ? `integration:${auth.connectionId}`
              : 'partner_api',
          },
        });
        if (result.count !== 1) throw new Error('CONCURRENT_UPDATE');
        const order = await tx.order.findUniqueOrThrow({ where: { id: existing.id } });
        if (auth.connectionId && input.externalId) {
          await tx.externalResourceMapping.upsert({
            where: {
              connectionId_resourceType_internalId: {
                connectionId: auth.connectionId,
                resourceType: 'order',
                internalId: order.id,
              },
            },
            create: {
              tenantId: auth.tenantId,
              connectionId: auth.connectionId,
              resourceType: 'order',
              internalId: order.id,
              externalId: input.externalId,
              lastSyncedAt: new Date(),
            },
            update: { externalId: input.externalId, lastSyncedAt: new Date() },
          });
        }
        await enqueueIntegrationEvent(tx, {
          tenantId: auth.tenantId,
          sourceConnectionId: auth.connectionId,
          type: nextStatus === OrderStatus.CANCELLED ? 'order.cancelled' : 'order.updated',
          locationId: order.locationId,
          resourceType: 'order',
          resourceId: order.id,
          data: {
            order_id: order.id,
            status: order.status,
            version: order.integrationVersion,
            occurred_at: input.occurredAt ?? new Date().toISOString(),
          },
        });
        return order;
      })
      .catch((error) => {
        if (error instanceof Error && error.message === 'CONCURRENT_UPDATE') return null;
        throw error;
      });
    if (!updated) return conflict('Order was updated concurrently; fetch it and retry');

    await autoCompleteTasksForEntity('ORDER', 'orderId', updated.id).catch((error) =>
      logger.warn('Partner fulfillment task completion failed', { error, orderId: updated.id })
    );
    waitUntil(
      notifyCustomerOfOrderStatus(auth.tenantId, updated.id, updated.status).catch((error) =>
        logger.error('Partner fulfillment customer notification failed', {
          error,
          orderId: updated.id,
        })
      )
    );
    return commerceResponse({
      order_id: updated.id,
      status: updated.status,
      version: updated.integrationVersion,
      payment_status: updated.paymentStatus,
      refund_issued: false,
      updated_at: updated.updatedAt,
    });
  } catch (error) {
    logger.warn('Commerce fulfillment update failed', { error });
    return commerceError(error);
  }
}
