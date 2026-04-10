import { NextRequest } from 'next/server';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();

    // Find all expired pending consent requests
    const expired = await prisma.smsConsentRequest.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      select: { id: true, tenantId: true, callerPhone: true },
    });

    if (expired.length === 0) {
      return Response.json({ ok: true, expired: 0 });
    }

    // Batch update
    await prisma.smsConsentRequest.updateMany({
      where: { id: { in: expired.map((e) => e.id) } },
      data: { status: 'EXPIRED' },
    });

    // Log audit events for each
    await prisma.consentAuditLog.createMany({
      data: expired.map((e) => ({
        tenantId: e.tenantId,
        callerPhone: e.callerPhone,
        eventType: 'expired',
      })),
    });

    logger.info('[cron/expire-consent-requests] expired', {
      count: expired.length,
    });

    return Response.json({ ok: true, expired: expired.length });
  } catch (err: any) {
    logger.error('[cron/expire-consent-requests] failed', {
      err: err?.message,
    });
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
