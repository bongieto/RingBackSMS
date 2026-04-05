import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { posRegistry } from '@/lib/server/pos/registry';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function DELETE(request: NextRequest, { params }: { params: { provider: string } }) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return apiError('Unauthorized', 401);
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  const adapter = posRegistry.get(params.provider);
  await adapter.disconnect(tenantId);
  return apiSuccess({ disconnected: true, provider: params.provider });
}
