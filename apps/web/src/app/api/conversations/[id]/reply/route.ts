import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { Prisma } from '@prisma/client';
import { sendSms } from '@/lib/server/services/twilioService';
import { encryptMessages, decryptMessages } from '@/lib/server/encryption';
import { summarizeConversationMessages } from '@/lib/server/conversationSummary';
import { buildConversationMessageWindow } from '@/lib/server/conversationMessages';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';
import { logTiming, startTimer } from '@/lib/server/perf';
import {
  findExemplarPairFromMessages,
  recordHandoffExemplar,
} from '@/lib/server/services/handoffExemplarService';
import { waitUntil } from '@vercel/functions';

const ReplySchema = z.object({ message: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const timer = startTimer();
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

    // Capture a HandoffExemplar (P6 learning loop): pair this human reply
    // with the customer inbound it's answering, plus the bot's prior
    // reply for audit. Fire-and-forget — never blocks the SMS send path.
    // waitUntil keeps the insert alive past the serverless response so
    // a few-ms DB write doesn't tear down with the request context.
    const pair = findExemplarPairFromMessages(
      existing as Array<{ role?: string; content?: string; sender?: string }>,
    );
    if (pair) {
      waitUntil(
        recordHandoffExemplar({
          tenantId: conversation.tenantId,
          conversationId: conversation.id,
          callerPhone: conversation.callerPhone,
          inboundMessage: pair.inboundMessage,
          humanReply: message,
          botReplyBefore: pair.botReplyBefore,
        }),
      );
    }

    const summary = summarizeConversationMessages(updatedMessages);
    const updated = await prisma.conversation.update({
      where: { id: params.id },
      data: {
        messages: encryptMessages(updatedMessages) as unknown as Prisma.InputJsonValue,
        ...summary,
        updatedAt: new Date(),
      },
      include: { orders: true, meetings: true },
    });
    const messageWindow = buildConversationMessageWindow(updated.messages);
    const responseData = { ...updated, ...messageWindow };
    logger.info('Manual reply sent', { conversationId: params.id });
    logTiming('Conversation reply API completed', timer, {
      tenantId: conversation.tenantId,
      conversationId: params.id,
      messageLength: message.length,
      returnedMessages: messageWindow.messages.length,
    });
    return apiSuccess(responseData);
  } catch (err: any) {
    logger.error('Conversation reply API failed', {
      conversationId: params.id,
      latencyMs: timer.elapsedMs(),
      err: err?.message ?? String(err),
    });
    return apiError('Internal server error', 500);
  }
}
