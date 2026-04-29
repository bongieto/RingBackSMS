import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import {
  buildConversationMessageWindow,
  parseConversationBeforeIndex,
  parseConversationMessageLimit,
} from '@/lib/server/conversationMessages';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logTiming, startTimer } from '@/lib/server/perf';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const timer = startTimer();
  const conversation = await prisma.conversation.findUnique({ where: { id: params.id }, include: { orders: true, meetings: true } });
  if (!conversation) return apiError('Not found', 404);
  const authResult = await verifyTenantAccess(conversation.tenantId);
  if (isNextResponse(authResult)) return authResult;
  const { searchParams } = new URL(req.url);
  const messageWindow = buildConversationMessageWindow(conversation.messages, {
    limit: parseConversationMessageLimit(searchParams.get('messageLimit')),
    beforeIndex: parseConversationBeforeIndex(searchParams.get('before')),
  });
  const responseData = {
    ...conversation,
    messageCount: messageWindow.messagePage.totalMessages,
    ...messageWindow,
  };
  logTiming('Conversation detail API completed', timer, {
    tenantId: conversation.tenantId,
    conversationId: params.id,
    returnedMessages: messageWindow.messages.length,
    totalMessages: messageWindow.messagePage.totalMessages,
    hasMoreMessages: messageWindow.messagePage.hasMoreMessages,
  });
  return apiSuccess(responseData);
}
