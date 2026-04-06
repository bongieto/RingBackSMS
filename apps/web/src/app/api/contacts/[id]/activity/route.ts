import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const contact = await prisma.contact.findUnique({ where: { id: params.id } });
  if (!contact) return apiError('Contact not found', 404);
  const authResult = await verifyTenantAccess(contact.tenantId);
  if (isNextResponse(authResult)) return authResult;

  const [conversations, orders, meetings] = await Promise.all([
    prisma.conversation.findMany({
      where: { tenantId: contact.tenantId, callerPhone: contact.phone },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, flowType: true, createdAt: true, messages: true },
    }),
    prisma.order.findMany({
      where: { tenantId: contact.tenantId, callerPhone: contact.phone },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, orderNumber: true, total: true, status: true, createdAt: true },
    }),
    prisma.meeting.findMany({
      where: { tenantId: contact.tenantId, callerPhone: contact.phone },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, scheduledAt: true, status: true, createdAt: true },
    }),
  ]);

  const activities = [
    ...conversations.map((c) => {
      const msgs = Array.isArray(c.messages) ? (c.messages as Array<{ role: string; content: string }>) : [];
      const lastMsg = msgs[msgs.length - 1];
      return {
        type: 'conversation' as const,
        id: c.id,
        summary: lastMsg
          ? `${lastMsg.role === 'user' ? 'Customer' : 'Bot'}: ${String(lastMsg.content).slice(0, 80)}`
          : 'SMS conversation',
        occurredAt: c.createdAt.toISOString(),
      };
    }),
    ...orders.map((o) => ({
      type: 'order' as const,
      id: o.id,
      orderNumber: o.orderNumber,
      total: Number(o.total),
      status: o.status,
      occurredAt: o.createdAt.toISOString(),
    })),
    ...meetings.map((m) => ({
      type: 'meeting' as const,
      id: m.id,
      scheduledAt: m.scheduledAt?.toISOString() ?? null,
      status: m.status,
      occurredAt: m.createdAt.toISOString(),
    })),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return apiSuccess({ activities });
}
