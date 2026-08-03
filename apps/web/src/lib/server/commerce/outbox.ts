import { Prisma } from '@prisma/client';
import { COMMERCE_API_VERSION } from '@ringback/shared-types';

type TransactionClient = Prisma.TransactionClient;

export interface IntegrationEventInput {
  tenantId: string;
  sourceConnectionId?: string | null;
  type: string;
  locationId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  data: Prisma.InputJsonValue;
}

export async function enqueueIntegrationEvent(tx: TransactionClient, input: IntegrationEventInput) {
  return tx.integrationEvent.create({
    data: {
      tenantId: input.tenantId,
      sourceConnectionId: input.sourceConnectionId ?? null,
      type: input.type,
      apiVersion: COMMERCE_API_VERSION,
      locationId: input.locationId ?? null,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      payload: input.data,
    },
  });
}
