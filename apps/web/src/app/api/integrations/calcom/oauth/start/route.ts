import { NextRequest, NextResponse } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { buildAuthorizeUrl, signState } from '@/lib/server/services/calcomService';
import { apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

function getRedirectUri(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ??
    process.env.FRONTEND_URL?.replace(/\/+$/, '') ??
    'https://ringbacksms.com';
  return `${base}/api/integrations/calcom/oauth/callback`;
}

export async function GET(req: NextRequest) {
  const tenantId = new URL(req.url).searchParams.get('tenantId') ?? '';
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  try {
    const state = signState(tenantId);
    const url = buildAuthorizeUrl(state, getRedirectUri());
    return NextResponse.redirect(url);
  } catch (err: any) {
    logger.error('[calcom oauth start] failed', { tenantId, err: err?.message });
    return apiError(err?.message ?? 'Failed to start OAuth', 500);
  }
}
