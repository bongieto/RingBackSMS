import { NextRequest } from 'next/server';
import { refreshExpiringPosTokens } from '@/lib/server/pos/tokenRefreshJob';
import { logger } from '@/lib/server/logger';

export async function GET(request: NextRequest) {
  // Verify this is called by Vercel Cron (optional extra security)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
