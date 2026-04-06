import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { Prisma } from '@prisma/client';
import { sendSms } from '@/lib/server/services/twilioService';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

const ReplySchema = z.object({ message: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { message } = ReplySchema.parse(await req.json());
    const conversation = await prisma.conversation.findUnique({ where: { id: params.id } });
    if (!conversation) return apiError('Not found', 404);
    const authResult = await verifyTenantAccess(conversation.tenantId);
    if (isNextResponse(authResult)) return authResult;

    await sendSms(conversation.tenantId, conversation.callerPhone, message);
    const existing = Array.isArray(conversation.messages) ? conversation.messages : [];
    const updated = await prisma.conversation.update({
      where: { id: params.id },
      data: { messages: [...existing, { role: 'assistant', content: message, timestamp: new Date().toISOString(), sender: 'human' }] as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
      include: { orders: true, meetings: true },
    });
    logger.info('Manual reply sent', { conversationId: params.id });
    return apiSuccess(updated);
  } catch (err: any) {
    return apiError('Internal server error', 500);
  }
}
