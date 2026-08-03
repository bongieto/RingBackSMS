import { createHash, randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import {
  CommerceScopes,
  ExternalOrderCreateSchema,
  isKitchenPaymentEligible,
} from '@ringback/shared-types';
import { Prisma } from '@prisma/client';
import { authenticateCommerceRequest } from '@/lib/server/commerce/apiAuth';
import { commerceError, commerceResponse, conflict } from '@/lib/server/commerce/http';
import { enqueueIntegrationEvent } from '@/lib/server/commerce/outbox';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

function orderNumber(): string {
  return `EXT-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateCommerceRequest(request, [CommerceScopes.ORDERS_WRITE]);
    if (!auth.connectionId) {
      return Response.json(
        {
          error: {
            code: 'invalid_connection',
            message: 'Credential is not linked to an integration connection',
          },
        },
        { status: 403 }
      );
    }
    const idempotencyKey = request.headers.get('idempotency-key')?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
      return Response.json(
        {
          error: { code: 'invalid_request', message: 'A valid Idempotency-Key header is required' },
        },
        { status: 400 }
      );
    }
    const raw = await request.json();
    const input = ExternalOrderCreateSchema.parse(raw);
    const expectedTotal = input.subtotal + input.taxAmount + input.feeAmount + input.tipAmount;
    if (Math.abs(expectedTotal - input.total) > 0.005) {
      return Response.json(
        {
          error: { code: 'invalid_total', message: 'subtotal + tax + fee + tip must equal total' },
        },
        { status: 400 }
      );
    }
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const prior = await prisma.apiIdempotencyRecord.findUnique({
      where: {
        tenantId_operation_key: {
          tenantId: auth.tenantId,
          operation: 'orders.create',
          key: idempotencyKey,
        },
      },
    });
    if (prior) {
      if (prior.requestHash !== requestHash)
        return conflict('Idempotency key was already used with a different request');
      return commerceResponse(prior.response, prior.statusCode);
    }

    const [location, menuCount, config] = await Promise.all([
      prisma.tenantLocation.findFirst({
        where: { id: input.locationId, tenantId: auth.tenantId, isActive: true },
      }),
      prisma.menuItem.count({
        where: {
          tenantId: auth.tenantId,
          id: { in: [...new Set(input.items.map((item) => item.menuItemId))] },
        },
      }),
      prisma.tenantConfig.findUnique({
        where: { tenantId: auth.tenantId },
        select: { requirePayment: true },
      }),
    ]);
    if (!location || menuCount !== new Set(input.items.map((item) => item.menuItemId)).size) {
      return Response.json(
        { error: { code: 'not_found', message: 'Location or menu item not found' } },
        { status: 404 }
      );
    }
    const owner = `integration:${auth.connectionId}`;
    const responseData = await prisma
      .$transaction(
        async (tx) => {
          const existingMapping = await tx.externalResourceMapping.findUnique({
            where: {
              connectionId_resourceType_externalId: {
                connectionId: auth.connectionId!,
                resourceType: 'order',
                externalId: input.externalId,
              },
            },
          });
          if (existingMapping)
            throw new Error(`EXTERNAL_ORDER_EXISTS:${existingMapping.internalId}`);
          const conversation = await tx.conversation.create({
            data: {
              tenantId: auth.tenantId,
              callerPhone: input.customer?.phone ?? `external:${auth.connectionId}`,
              flowType: 'ORDER',
              isActive: false,
            },
          });
          const order = await tx.order.create({
            data: {
              tenantId: auth.tenantId,
              conversationId: conversation.id,
              callerPhone: input.customer?.phone ?? `external:${auth.connectionId}`,
              customerName: input.customer?.name ?? null,
              orderNumber: orderNumber(),
              status: input.fulfillmentStatus,
              items: input.items,
              subtotal: input.subtotal,
              taxAmount: input.taxAmount,
              feeAmount: input.feeAmount,
              tipAmount: input.tipAmount,
              total: input.total,
              pickupTime: input.pickupTime ?? null,
              dineIn: input.dineIn,
              notes: input.notes ?? null,
              paymentStatus: input.paymentStatus,
              locationId: input.locationId,
              originSystem: owner,
              financialOwner: owner,
              fulfillmentOwner: owner,
            },
          });
          await tx.externalResourceMapping.create({
            data: {
              tenantId: auth.tenantId,
              connectionId: auth.connectionId!,
              resourceType: 'order',
              internalId: order.id,
              externalId: input.externalId,
              lastSyncedAt: new Date(),
            },
          });
          if (isKitchenPaymentEligible(config?.requirePayment ?? true, order.paymentStatus)) {
            await enqueueIntegrationEvent(tx, {
              tenantId: auth.tenantId,
              sourceConnectionId: auth.connectionId,
              type: 'order.ready_for_fulfillment',
              locationId: order.locationId,
              resourceType: 'order',
              resourceId: order.id,
              data: {
                order_id: order.id,
                order_number: order.orderNumber,
                resource_url: `/api/v1/orders/${order.id}`,
                version: order.integrationVersion,
              },
            });
          }
          const response = {
            id: order.id,
            orderNumber: order.orderNumber,
            externalId: input.externalId,
            status: order.status,
            paymentStatus: order.paymentStatus,
            integrationVersion: order.integrationVersion,
            createdAt: order.createdAt,
          };
          await tx.apiIdempotencyRecord.create({
            data: {
              tenantId: auth.tenantId,
              operation: 'orders.create',
              key: idempotencyKey,
              requestHash,
              statusCode: 201,
              response: response as Prisma.InputJsonValue,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          });
          return response;
        },
        { isolationLevel: 'Serializable' }
      )
      .catch((error) => {
        if (error instanceof Error && error.message.startsWith('EXTERNAL_ORDER_EXISTS:')) {
          return { conflictOrderId: error.message.split(':')[1] } as const;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code)
        ) {
          return { retryIdempotency: true } as const;
        }
        throw error;
      });
    if ('conflictOrderId' in responseData) {
      return conflict(`External order already maps to ${responseData.conflictOrderId}`);
    }
    if ('retryIdempotency' in responseData) {
      const replay = await prisma.apiIdempotencyRecord.findUnique({
        where: {
          tenantId_operation_key: {
            tenantId: auth.tenantId,
            operation: 'orders.create',
            key: idempotencyKey,
          },
        },
      });
      if (replay?.requestHash === requestHash)
        return commerceResponse(replay.response, replay.statusCode);
      return conflict(
        'Order creation was processed concurrently; retry with the same idempotency key'
      );
    }
    return commerceResponse(responseData, 201);
  } catch (error) {
    logger.warn('Commerce external order creation failed', { error });
    return commerceError(error);
  }
}
