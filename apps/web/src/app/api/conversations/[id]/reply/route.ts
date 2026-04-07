import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { Prisma } from '@prisma/client';
import { sendSms } from '@/lib/server/services/twilioService';
import { encryptMessages, decryptMessages } from '@/lib/server/encryption';
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

    // Stamp ownerRespondedAt on the most recent unanswered missed call from this caller.
    try {
      const recent = await prisma.missedCall.findFirst({
        where: {
          tenantId: conversation.tenantId,
          callerPhone: conversation.callerPhone,
          ownerRespondedAt: null,
        },
        orderBy: { occurredAt: 'desc' },
        select: { id: true },
      });
      if (recent) {
        await prisma.missedCall.update({
          where: { id: recent.id },
          data: { ownerRespondedAt: new Date() },
        });
      }
    } catch (err) {
      logger.error('Failed to set ownerRespondedAt from conversation reply', { err, conversationId: params.id });
    }
    const existing = decryptMessages(conversation.messages);
    const updatedMessages = [
      ...existing,
      { role: 'assistant', content: message, timestamp: new Date().toISOString(), sender: 'human' },
    ];
    const updated = await prisma.conversation.update({
      where: { id: params.id },
      data: {
        messages: encryptMessages(updatedMessages) as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
      include: { orders: true, meetings: true },
    });
    // Decrypt messages for the response so the client sees plain messages
    const responseData = { ...updated, messages: decryptMessages(updated.messages) };
    logger.info('Manual reply sent', { conversationId: params.id });
    return apiSuccess(responseData);
  } catch (err: any) {
    return apiError('Internal server error', 500);
  }
}
