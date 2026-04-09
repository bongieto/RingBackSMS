import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/db';
import { encrypt } from '@/lib/server/encryption';
import { exchangeAuthCode, verifyState } from '@/lib/server/services/calcomService';
import { logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

function getRedirectUri(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ??
    process.env.FRONTEND_URL?.replace(/\/+$/, '') ??
    'https://ringbacksms.com';
  return `${base}/api/integrations/calcom/oauth/callback`;
}

function appReturnUrl(params: Record<string, string>): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') ??
    'https://ringbacksms.com';
  const q = new URLSearchParams(params).toString();
  return `${base}/dashboard/integrations?${q}`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');

  if (errParam) {
    logger.warn('[calcom oauth callback] provider error', { errParam });
    return NextResponse.redirect(
      appReturnUrl({ calcom: 'error', reason: errParam }),
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(appReturnUrl({ calcom: 'error', reason: 'missing_params' }));
  }

  const tenantId = verifyState(state);
  if (!tenantId) {
    logger.warn('[calcom oauth callback] invalid state');
    return NextResponse.redirect(appReturnUrl({ calcom: 'error', reason: 'bad_state' }));
  }

  try {
    const { accessToken, refreshToken, expiresAt, calcomUser } = await exchangeAuthCode(
      code,
      getRedirectUri(),
    );
    await prisma.tenantConfig.update({
      where: { tenantId },
      data: {
        calcomAccessToken: encrypt(accessToken),
        calcomRefreshToken: refreshToken ? encrypt(refreshToken) : null,
        calcomTokenExpiresAt: expiresAt,
        calcomUserId: calcomUser.id,
        calcomUserEmail: calcomUser.email,
      },
    });
    logger.info('cal.com OAuth connected', {
      tenantId,
      calcomUserId: calcomUser.id,
    });
    return NextResponse.redirect(appReturnUrl({ calcom: 'connected' }));
  } catch (err: any) {
    logger.error('[calcom oauth callback] exchange failed', {
      tenantId,
      err: err?.message,
    });
    return NextResponse.redirect(
      appReturnUrl({ calcom: 'error', reason: 'exchange_failed' }),
    );
  }
}
