import { NextRequest } from 'next/server';
import { CommerceScopes } from '@ringback/shared-types';
import { authenticateCommerceRequest } from '@/lib/server/commerce/apiAuth';
import { commerceError } from '@/lib/server/commerce/http';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest, { params }: { params: { endpointId: string } }) {
  try {
    const auth = await authenticateCommerceRequest(request, [CommerceScopes.WEBHOOKS_MANAGE]);
    const result = await prisma.webhookEndpoint.updateMany({
      where: { id: params.endpointId, tenantId: auth.tenantId, disabledAt: null },
      data: { status: 'disabled', disabledAt: new Date() },
    });
    if (result.count === 0) {
      return Response.json(
        { error: { code: 'not_found', message: 'Webhook endpoint not found' } },
        { status: 404 }
      );
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    logger.warn('Commerce webhook endpoint delete failed', { error });
    return commerceError(error);
  }
}
