import { NextRequest } from 'next/server';
import { logger } from '@/lib/server/logger';
import { reopenSnoozedTasks } from '@/lib/server/services/taskService';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const count = await reopenSnoozedTasks();
    return Response.json({ ok: true, reopened: count });
  } catch (err) {
    logger.error('Cron reopen-snoozed failed', { err });
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
