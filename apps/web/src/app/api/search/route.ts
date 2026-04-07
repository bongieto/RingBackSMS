import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { decryptMaybePlaintext } from '@/lib/server/encryption';

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

    // Name & email are encrypted at rest — fetch a bounded tenant slice and
    // filter in memory. Phone is plaintext and still usable at SQL level.
    const [allTenantContacts, conversations, orders] = await Promise.all([
      prisma.contact.findMany({
        where: { tenantId },
        select: { id: true, name: true, phone: true, email: true, status: true },
        orderBy: { updatedAt: 'desc' },
        take: 500,
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

    const needle = q.toLowerCase();
    const contacts = allTenantContacts
      .map((c) => ({
        ...c,
        name: decryptMaybePlaintext(c.name),
        email: decryptMaybePlaintext(c.email),
      }))
      .filter(
        (c) =>
          (c.name && c.name.toLowerCase().includes(needle)) ||
          (c.email && c.email.toLowerCase().includes(needle)) ||
          (c.phone && c.phone.includes(q)),
      )
      .slice(0, 5)
      .map(({ email: _e, ...rest }) => rest);

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
