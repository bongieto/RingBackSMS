import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { posRegistry } from '@/lib/server/pos/registry';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  const { userId, orgId } = await auth();
  if (!userId || !orgId) return apiError('Unauthorized', 401);
  const tenantId = new URL(request.url).searchParams.get('tenantId') ?? '';
  try {
    const adapter = posRegistry.get(params.provider);
    const url = adapter.getOAuthUrl(tenantId);
    return apiSuccess({ url, provider: params.provider });
  } catch (err: any) {
    return apiError(err.message, 400);
  }
}
