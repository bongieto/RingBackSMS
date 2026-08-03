import { randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import { CommerceScopes, WebhookEndpointCreateSchema } from '@ringback/shared-types';
import { authenticateCommerceRequest } from '@/lib/server/commerce/apiAuth';
import { commerceError, commerceResponse } from '@/lib/server/commerce/http';
import { assertSafeWebhookUrl } from '@/lib/server/commerce/webhookSecurity';
import { prisma } from '@/lib/server/db';
import { encrypt } from '@/lib/server/encryption';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateCommerceRequest(request, [CommerceScopes.WEBHOOKS_MANAGE]);
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { tenantId: auth.tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        url: true,
        description: true,
        events: true,
        status: true,
        failureCount: true,
        disabledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return commerceResponse(endpoints);
  } catch (error) {
    logger.warn('Commerce webhook endpoint list failed', { error });
    return commerceError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateCommerceRequest(request, [CommerceScopes.WEBHOOKS_MANAGE]);
    const input = WebhookEndpointCreateSchema.parse(await request.json());
    try {
      await assertSafeWebhookUrl(input.url);
    } catch (error) {
      return Response.json(
        {
          error: {
            code: 'invalid_webhook_url',
            message: error instanceof Error ? error.message : 'Invalid webhook URL',
          },
        },
        { status: 400 }
      );
    }
    const secret = `whsec_${randomBytes(32).toString('base64url')}`;
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        tenantId: auth.tenantId,
        connectionId: auth.connectionId,
        url: input.url,
        description: input.description,
        events: [...new Set(input.events)],
        secretEncrypted: encrypt(secret),
      },
      select: {
        id: true,
        url: true,
        description: true,
        events: true,
        status: true,
        createdAt: true,
      },
    });
    return commerceResponse({ ...endpoint, secret }, 201);
  } catch (error) {
    logger.warn('Commerce webhook endpoint create failed', { error });
    return commerceError(error);
  }
}
