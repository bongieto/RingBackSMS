import { NextRequest } from 'next/server';
import { logger } from '@/lib/server/logger';
import { reopenSnoozedTasks, pruneOldTasks } from '@/lib/server/services/taskService';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const reopened = await reopenSnoozedTasks();
    // Prune once an hour (cron runs every 5 min, so gate by minute)
    const minute = new Date().getUTCMinutes();
    const pruned = minute < 5 ? await pruneOldTasks(30) : 0;
    return Response.json({ ok: true, reopened, pruned });
  } catch (err) {
    logger.error('Cron reopen-snoozed failed', { err });
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
