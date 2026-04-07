import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { decryptMessages } from '@/lib/server/encryption';
import { apiSuccess, apiError } from '@/lib/server/response';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const conversation = await prisma.conversation.findUnique({ where: { id: params.id }, include: { orders: true, meetings: true } });
  if (!conversation) return apiError('Not found', 404);
  const authResult = await verifyTenantAccess(conversation.tenantId);
  if (isNextResponse(authResult)) return authResult;
  // Decrypt messages before returning
  const responseData = { ...conversation, messages: decryptMessages(conversation.messages) };
  return apiSuccess(responseData);
}
