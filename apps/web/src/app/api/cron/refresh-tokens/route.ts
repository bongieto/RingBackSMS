import { NextRequest } from 'next/server';
import { refreshExpiringPosTokens } from '@/lib/server/pos/tokenRefreshJob';
import { logger } from '@/lib/server/logger';

export async function GET(request: NextRequest) {
  // Verify this is called by Vercel Cron — fail-closed if CRON_SECRET is unset
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await refreshExpiringPosTokens();
    return Response.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (err) {
    logger.error('Cron refresh-tokens failed', { err });
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
