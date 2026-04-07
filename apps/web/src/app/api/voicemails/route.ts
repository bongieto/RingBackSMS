import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { decryptNullable } from '@/lib/server/encryption';
import { apiPaginated, apiError } from '@/lib/server/response';

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId required', 400);

  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(req.nextUrl.searchParams.get('pageSize') ?? '20', 10);

  const where = {
    tenantId,
    voicemailUrl: { not: null },
  };

  const [rows, total] = await Promise.all([
    prisma.missedCall.findMany({
      where,
      select: {
        id: true,
        callerPhone: true,
        voicemailDuration: true,
        voicemailReceivedAt: true,
        occurredAt: true,
        smsSent: true,
        contactId: true,
        contact: {
          select: {
            id: true,
            name: true,
            status: true,
            totalOrders: true,
            totalSpent: true,
          },
        },
      },
      orderBy: { voicemailReceivedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.missedCall.count({ where }),
  ]);

  // Compute repeat counts: how many calls from the same number in the last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const callerPhones = Array.from(new Set(rows.map((r) => r.callerPhone)));
  const repeatGroups = callerPhones.length
    ? await prisma.missedCall.groupBy({
        by: ['callerPhone'],
        where: {
          tenantId,
          callerPhone: { in: callerPhones },
          occurredAt: { gte: since },
        },
        _count: { _all: true },
      })
    : [];
  const repeatMap = new Map(repeatGroups.map((g) => [g.callerPhone, g._count._all]));

  const data = rows.map((r) => ({
    id: r.id,
    callerPhone: r.callerPhone,
    voicemailDuration: r.voicemailDuration,
    voicemailReceivedAt: r.voicemailReceivedAt,
    occurredAt: r.occurredAt,
    smsSent: r.smsSent,
    repeatCount24h: repeatMap.get(r.callerPhone) ?? 1,
    contact: r.contact
      ? {
          id: r.contact.id,
          name: decryptNullable(r.contact.name),
          status: r.contact.status,
          totalOrders: r.contact.totalOrders,
          totalSpent: r.contact.totalSpent,
        }
      : null,
  }));

  return apiPaginated(data, total, page, pageSize);
}
