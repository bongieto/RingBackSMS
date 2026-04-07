import { NextRequest } from 'next/server';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';
import { sendDailyTaskDigestEmail } from '@/lib/server/services/emailService';

function currentHourInTz(timezone: string): number {
  try {
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(new Date());
    return parseInt(hour, 10);
  } catch {
    return new Date().getUTCHours();
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const configs = await prisma.tenantConfig.findMany({
      where: { dailyDigestEnabled: true },
      select: {
        tenantId: true,
        timezone: true,
        dailyDigestHour: true,
      },
    });

    let sent = 0;
    let skipped = 0;

    for (const cfg of configs) {
      const hourNow = currentHourInTz(cfg.timezone);
      if (hourNow !== cfg.dailyDigestHour) {
        skipped++;
        continue;
      }

      const tasks = await prisma.task.findMany({
        where: { tenantId: cfg.tenantId, status: 'OPEN' },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        take: 10,
        select: {
          id: true,
          title: true,
          priority: true,
          source: true,
          callerPhone: true,
          createdAt: true,
        },
      });

      if (tasks.length === 0) {
        skipped++;
        continue;
      }

      const ok = await sendDailyTaskDigestEmail(cfg.tenantId, tasks);
      if (ok) sent++;
    }

    logger.info('Daily task digest cron ran', { sent, skipped, total: configs.length });
    return Response.json({ ok: true, sent, skipped, considered: configs.length });
  } catch (err) {
    logger.error('Cron daily-task-digest failed', { err });
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
