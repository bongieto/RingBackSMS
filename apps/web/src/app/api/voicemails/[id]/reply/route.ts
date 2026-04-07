import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { sendSms } from '@/lib/server/services/twilioService';
import { encryptMessages, decryptMessages } from '@/lib/server/encryption';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

const ReplySchema = z.object({ message: z.string().min(1).max(1600) });

/**
 * Send a manual SMS reply to the caller of a voicemail.
 * Reuses or creates a Conversation thread for that caller so the
 * outbound message shows up in the conversations module.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { message } = ReplySchema.parse(await req.json());

    const missedCall = await prisma.missedCall.findUnique({
      where: { id: params.id },
      select: { id: true, tenantId: true, callerPhone: true },
    });
    if (!missedCall) return apiError('Voicemail not found', 404);

    const auth = await verifyTenantAccess(missedCall.tenantId);
    if (isNextResponse(auth)) return auth;

    // Send the SMS first — if Twilio rejects, don't pollute the conversation.
    await sendSms(missedCall.tenantId, missedCall.callerPhone, message);

    // Stamp the response timestamp for funnel analytics (idempotent: only first time).
    await prisma.missedCall.updateMany({
      where: { id: missedCall.id, ownerRespondedAt: null },
      data: { ownerRespondedAt: new Date() },
    });

    // Find the most recent active conversation for this caller, else create one
    // tied to this missed call.
    let conversation = await prisma.conversation.findFirst({
      where: {
        tenantId: missedCall.tenantId,
        callerPhone: missedCall.callerPhone,
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const newMessage = {
      role: 'assistant' as const,
      content: message,
      timestamp: new Date().toISOString(),
      sender: 'human' as const,
    };

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          tenantId: missedCall.tenantId,
          callerPhone: missedCall.callerPhone,
          missedCallId: missedCall.id,
          messages: encryptMessages([newMessage]) as unknown as Prisma.InputJsonValue,
          handoffStatus: 'HUMAN',
          handoffAt: new Date(),
        },
      });
    } else {
      const existing = decryptMessages(conversation.messages);
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          messages: encryptMessages([...existing, newMessage]) as unknown as Prisma.InputJsonValue,
          handoffStatus: 'HUMAN',
          handoffAt: conversation.handoffAt ?? new Date(),
          updatedAt: new Date(),
        },
      });
    }

    logger.info('Voicemail reply sent', { missedCallId: params.id, conversationId: conversation.id });
    return apiSuccess({ conversationId: conversation.id });
  } catch (err: any) {
    logger.error('Voicemail reply failed', { err, missedCallId: params.id });
    return apiError(err?.message ?? 'Internal server error', 500);
  }
}
