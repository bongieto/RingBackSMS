import { NextRequest, NextResponse } from 'next/server';
import { posRegistry } from '@/lib/server/pos/registry';
import { verifyPosOAuthState } from '@/lib/server/pos/oauthState';
import { logger } from '@/lib/server/logger';

export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const dashboardUrl = process.env.FRONTEND_URL ?? 'https://ringbacksms.com';
  const { provider } = params;

  if (error || !code || !state) {
    return NextResponse.redirect(`${dashboardUrl}/dashboard/integrations?pos_error=access_denied&provider=${provider}`);
  }
  const verifiedState = verifyPosOAuthState(state, provider);
  if (!verifiedState) {
    logger.warn('POS OAuth callback rejected invalid state', { provider });
    return NextResponse.redirect(`${dashboardUrl}/dashboard/integrations?pos_error=bad_state&provider=${provider}`);
  }
  const { tenantId } = verifiedState;
  try {
    const adapter = posRegistry.get(provider);
    await adapter.exchangeCode(tenantId, code);
    return NextResponse.redirect(`${dashboardUrl}/dashboard/integrations?pos_connected=true&provider=${provider}`);
  } catch (err) {
    logger.error('POS OAuth callback error', { err, provider, tenantId });
    return NextResponse.redirect(`${dashboardUrl}/dashboard/integrations?pos_error=oauth_failed&provider=${provider}`);
  }
}
