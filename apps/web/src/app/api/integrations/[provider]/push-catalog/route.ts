import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { posRegistry } from '@/lib/server/pos/registry';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function POST(request: NextRequest, { params }: { params: { provider: string } }) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return apiError('Unauthorized', 401);
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  const count = await posRegistry.get(params.provider).pushCatalogToPOS(tenantId);
  return apiSuccess({ pushed: count, provider: params.provider });
}
