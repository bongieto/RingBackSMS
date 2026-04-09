import { NextRequest } from 'next/server';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';

const HANDOFF_TIMEOUT_HOURS = 4;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const cutoff = new Date(
      Date.now() - HANDOFF_TIMEOUT_HOURS * 60 * 60 * 1000,
    );

    const result = await prisma.conversation.updateMany({
      where: {
        handoffStatus: 'HUMAN',
        handoffAt: { lt: cutoff },
      },
      data: {
        handoffStatus: 'AI',
      },
    });

    logger.info('[cron/clear-stale-handoffs] cleared', {
      count: result.count,
      cutoff: cutoff.toISOString(),
    });

    return Response.json({
      ok: true,
      cleared: result.count,
      cutoffHours: HANDOFF_TIMEOUT_HOURS,
    });
  } catch (err: any) {
    logger.error('[cron/clear-stale-handoffs] failed', {
      err: err?.message,
    });
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
