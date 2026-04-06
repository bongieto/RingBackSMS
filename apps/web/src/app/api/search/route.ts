import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';

const SearchSchema = z.object({
  q: z.string().min(1).max(100),
  tenantId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const { q, tenantId } = SearchSchema.parse({
      q: params.get('q'),
      tenantId: params.get('tenantId'),
    });
    const authResult = await verifyTenantAccess(tenantId);
    if (isNextResponse(authResult)) return authResult;

    const query = `%${q}%`;

    const [contacts, conversations, orders] = await Promise.all([
      prisma.contact.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, phone: true, status: true },
        take: 5,
      }),
      prisma.conversation.findMany({
        where: {
          tenantId,
          callerPhone: { contains: q },
        },
        select: { id: true, callerPhone: true, flowType: true, createdAt: true },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.findMany({
        where: {
          tenantId,
          OR: [
            { orderNumber: { contains: q, mode: 'insensitive' } },
            { callerPhone: { contains: q } },
          ],
        },
        select: { id: true, orderNumber: true, callerPhone: true, status: true, total: true },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return apiSuccess({
      contacts: contacts.map((c) => ({ ...c, type: 'contact' as const })),
      conversations: conversations.map((c) => ({ ...c, type: 'conversation' as const })),
      orders: orders.map((o) => ({ ...o, type: 'order' as const })),
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return apiError('Invalid request', 422);
    return apiError('Internal server error', 500);
  }
}
