// Admin-only audit surface for spam-blocked inbound calls.
//
// The voice webhook calls `classifyCaller` (Twilio Lookup) for every
// inbound; when it returns `allow:false` we log via
// `logConsentEvent(... 'sms_send_failed', { errorCode: 'spam_blocked' })`.
// This route surfaces the last N of those events so platform admins
// can audit false positives. Read-only.

import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isSuperAdmin } from '@/lib/server/agency';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(_req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  if (!(await isSuperAdmin(userId))) return apiError('Forbidden', 403);

  const events = await prisma.consentAuditLog.findMany({
    where: {
      eventType: 'sms_send_failed',
      // Pull only spam-classified rows. ConsentAuditLog.eventData is JSON;
      // Prisma's Postgres JSON path filter matches on key+value.
      eventData: { path: ['errorCode'], equals: 'spam_blocked' },
    },
    select: {
      id: true,
      tenantId: true,
      callerPhone: true,
      eventData: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Hydrate tenant names so the admin UI doesn't need another round-trip.
  const tenantIds = Array.from(new Set(events.map((e) => e.tenantId)));
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(tenants.map((t) => [t.id, t.name]));

  return apiSuccess({
    events: events.map((e) => ({
      id: e.id,
      tenantId: e.tenantId,
      tenantName: nameById.get(e.tenantId) ?? '(unknown)',
      callerPhone: e.callerPhone,
      reason:
        (e.eventData as Record<string, unknown> | null)?.errorMessage ?? 'spam_blocked',
      createdAt: e.createdAt.toISOString(),
    })),
  });
}
