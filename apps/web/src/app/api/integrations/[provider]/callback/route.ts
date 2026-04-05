import { NextRequest, NextResponse } from 'next/server';
import { posRegistry } from '@/lib/server/pos/registry';
import { logger } from '@/lib/server/logger';

export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const tenantId = searchParams.get('state');
  const error = searchParams.get('error');
  const dashboardUrl = process.env.FRONTEND_URL ?? 'https://ring-back-sms.vercel.app';
  const { provider } = params;

  if (error || !code || !tenantId) {
    return NextResponse.redirect(`${dashboardUrl}/dashboard/settings/integrations?pos_error=access_denied&provider=${provider}`);
  }
  try {
    const adapter = posRegistry.get(provider);
    await adapter.exchangeCode(tenantId, code);
    return NextResponse.redirect(`${dashboardUrl}/dashboard/settings/integrations?pos_connected=true&provider=${provider}`);
  } catch (err) {
    logger.error('POS OAuth callback error', { err, provider, tenantId });
    return NextResponse.redirect(`${dashboardUrl}/dashboard/settings/integrations?pos_error=oauth_failed&provider=${provider}`);
  }
}
