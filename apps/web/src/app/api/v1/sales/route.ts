import { NextRequest } from 'next/server';
import { CanonicalSaleProjectionSchema, CommerceScopes } from '@ringback/shared-types';
import { Prisma } from '@prisma/client';
import { authenticateCommerceRequest } from '@/lib/server/commerce/apiAuth';
import { assertMonotonicProjection } from '@/lib/server/commerce/financialProjection';
import { commerceError, commerceResponse, conflict } from '@/lib/server/commerce/http';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateCommerceRequest(request, [CommerceScopes.FINANCIALS_WRITE]);
    if (!auth.connectionId) {
      return Response.json(
        {
          error: {
            code: 'invalid_connection',
            message: 'Credential is not linked to a connection',
          },
        },
        { status: 403 }
      );
    }
    const input = CanonicalSaleProjectionSchema.parse(await request.json());
    const location = await prisma.tenantLocation.findFirst({
      where: { id: input.locationId, tenantId: auth.tenantId, isActive: true },
      select: { id: true },
    });
    if (!location) {
      return Response.json(
        { error: { code: 'not_found', message: 'Location not found' } },
        { status: 404 }
      );
    }

    const data = {
      tenantId: auth.tenantId,
      connectionId: auth.connectionId,
      locationId: location.id,
      externalId: input.externalId,
      version: input.version,
      orderNumber: input.orderNumber,
      status: input.status,
      fulfillmentStatus: input.fulfillmentStatus,
      currency: input.currency,
      occurredAt: new Date(input.occurredAt),
      paidAt: input.paidAt ? new Date(input.paidAt) : null,
      grossCents: input.grossCents,
      discountCents: input.discountCents,
      taxCents: input.taxCents,
      feeCents: input.feeCents,
      tipCents: input.tipCents,
      refundCents: input.refundCents,
      netCents: input.netCents,
      tenderTypes: input.tenderTypes,
      items: input.items as Prisma.InputJsonValue,
    };

    const result = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.externalSale.findUnique({
          where: {
            connectionId_externalId: {
              connectionId: auth.connectionId!,
              externalId: input.externalId,
            },
          },
        });
        const decision = assertMonotonicProjection(existing, input.version);
        if (decision === 'stale')
          return { conflict: `Stale sale version; current version is ${existing!.version}` };
        if (decision === 'same') {
          const existingComparable = {
            externalId: existing!.externalId,
            locationId: existing!.locationId,
            version: existing!.version,
            orderNumber: existing!.orderNumber,
            status: existing!.status,
            fulfillmentStatus: existing!.fulfillmentStatus,
            currency: existing!.currency,
            occurredAt: existing!.occurredAt.toISOString(),
            paidAt: existing!.paidAt?.toISOString() ?? null,
            grossCents: existing!.grossCents,
            discountCents: existing!.discountCents,
            taxCents: existing!.taxCents,
            feeCents: existing!.feeCents,
            tipCents: existing!.tipCents,
            refundCents: existing!.refundCents,
            netCents: existing!.netCents,
            tenderTypes: existing!.tenderTypes,
            items: existing!.items,
          };
          const incomingComparable = {
            ...input,
            occurredAt: new Date(input.occurredAt).toISOString(),
            paidAt: input.paidAt ? new Date(input.paidAt).toISOString() : null,
          };
          if (canonicalJson(existingComparable) !== canonicalJson(incomingComparable)) {
            return { conflict: 'Sale version was reused with different financial data' };
          }
          return { sale: existing!, idempotent: true };
        }
        const sale = existing
          ? await tx.externalSale.update({ where: { id: existing.id }, data })
          : await tx.externalSale.create({ data });
        const linkedOrder = await tx.order.findFirst({
          where: {
            tenantId: auth.tenantId,
            posOrderId: input.externalId,
            financialOwner: `integration:${auth.connectionId}`,
          },
          select: { id: true },
        });
        if (linkedOrder) {
          const paymentStatus =
            input.status === 'REFUNDED'
              ? 'REFUNDED'
              : input.status === 'PAID' || input.status === 'PARTIALLY_REFUNDED'
                ? 'PAID'
                : 'UNPAID';
          await tx.order.update({
            where: { id: linkedOrder.id },
            data: {
              subtotal:
                Math.max(
                  0,
                  input.grossCents -
                    input.taxCents -
                    input.feeCents -
                    input.tipCents +
                    input.discountCents
                ) / 100,
              taxAmount: input.taxCents / 100,
              feeAmount: input.feeCents / 100,
              tipAmount: input.tipCents / 100,
              total: input.grossCents / 100,
              paymentStatus,
              status: input.fulfillmentStatus,
              integrationVersion: { increment: 1 },
            },
          });
          await tx.externalResourceMapping.upsert({
            where: {
              connectionId_resourceType_internalId: {
                connectionId: auth.connectionId!,
                resourceType: 'order',
                internalId: linkedOrder.id,
              },
            },
            create: {
              tenantId: auth.tenantId,
              connectionId: auth.connectionId!,
              resourceType: 'order',
              internalId: linkedOrder.id,
              externalId: input.externalId,
              externalVersion: String(input.version),
              lastSyncedAt: new Date(),
            },
            update: { externalVersion: String(input.version), lastSyncedAt: new Date() },
          });
        }
        return { sale, idempotent: false };
      },
      { isolationLevel: 'Serializable', maxWait: 5_000, timeout: 10_000 }
    );
    if ('conflict' in result) return conflict(result.conflict!);
    return commerceResponse(
      {
        id: result.sale.id,
        externalId: result.sale.externalId,
        version: result.sale.version,
        status: result.sale.status,
        netCents: result.sale.netCents,
        idempotent: result.idempotent,
      },
      result.idempotent ? 200 : 202
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2034'].includes(error.code)
    ) {
      return conflict('Sale was updated concurrently; retry with the same version');
    }
    logger.warn('Canonical sale projection failed', { error });
    return commerceError(error);
  }
}
