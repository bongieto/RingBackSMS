import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { Prisma } from '@prisma/client';
import { sendSms } from '@/lib/server/services/twilioService';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

const ReplySchema = z.object({ message: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  try {
    const { message } = ReplySchema.parse(await req.json());
    const conversation = await prisma.conversation.findUnique({ where: { id: params.id } });
    if (!conversation) return apiError('Not found', 404);
    await sendSms(conversation.tenantId, conversation.callerPhone, message);
    const existing = Array.isArray(conversation.messages) ? conversation.messages : [];
    const updated = await prisma.conversation.update({
      where: { id: params.id },
      data: { messages: [...existing, { role: 'assistant', content: message, timestamp: new Date().toISOString() }] as unknown as Prisma.InputJsonValue, updatedAt: new Date() },
      include: { orders: true, meetings: true },
    });
    logger.info('Manual reply sent', { conversationId: params.id });
    return apiSuccess(updated);
  } catch (err: any) {
    return apiError(err.message, 500);
  }
}
