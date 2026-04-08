import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const contact = await prisma.contact.findUnique({
    where: { id: params.id },
    select: { tenantId: true, phone: true },
  });
  if (!contact) return apiError('Contact not found', 404);
  const authResult = await verifyTenantAccess(contact.tenantId);
  if (isNextResponse(authResult)) return authResult;

  const [conversationCount, orderCount] = await Promise.all([
    prisma.conversation.count({
      where: { tenantId: contact.tenantId, callerPhone: contact.phone },
    }),
    prisma.order.count({
      where: { tenantId: contact.tenantId, callerPhone: contact.phone },
    }),
  ]);

  return apiSuccess({ conversationCount, orderCount });
}
