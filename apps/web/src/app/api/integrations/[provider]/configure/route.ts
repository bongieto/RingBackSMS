import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { posRegistry } from '@/lib/server/pos/registry';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

export async function POST(request: NextRequest, { params }: { params: { provider: string } }) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return apiError('Unauthorized', 401);
  try {
    const body = await request.json();
    const tenantId = body.tenantId as string;
    const credentials = body.credentials;
    const adapter = posRegistry.get(params.provider);
    await adapter.exchangeCode(tenantId, JSON.stringify(credentials));
    return apiSuccess({ configured: true, provider: params.provider });
  } catch (err: any) {
    logger.error('POS configure error', { err, provider: params.provider });
    return apiError(err.message, 400);
  }
}
