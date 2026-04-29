import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { decryptMessages } from '@/lib/server/encryption';
import {
  messagesFromPreview,
  summarizeConversationMessages,
} from '@/lib/server/conversationSummary';
import { apiPaginated, apiError } from '@/lib/server/response';
import { logTiming, startTimer } from '@/lib/server/perf';

export async function GET(request: NextRequest) {
  const timer = startTimer();
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId') ?? '';
  if (!tenantId) return apiError('tenantId is required', 400);
  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);
  const isActiveParam = searchParams.get('isActive');
  const isActive = isActiveParam !== null ? isActiveParam === 'true' : undefined;

  const where = { tenantId, ...(isActive !== undefined && { isActive }) };
  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        tenantId: true,
        callerPhone: true,
        missedCallId: true,
        flowType: true,
        handoffStatus: true,
        handoffAt: true,
        isActive: true,
        intake: true,
        causingTurnId: true,
        createdAt: true,
        updatedAt: true,
        lastMessagePreview: true,
        messageCount: true,
        messageSummarySyncedAt: true,
      },
    }),
    prisma.conversation.count({ where }),
  ]);

  const missingSummaryIds = conversations
    .filter((conversation) => !conversation.messageSummarySyncedAt)
    .map((conversation) => conversation.id);

  const fallbackSummaries = new Map<string, ReturnType<typeof summarizeConversationMessages>>();
  if (missingSummaryIds.length > 0) {
    const legacyRows = await prisma.conversation.findMany({
      where: { id: { in: missingSummaryIds }, tenantId },
      select: { id: true, messages: true },
    });

    await Promise.all(
      legacyRows.map(async (row) => {
        const summary = summarizeConversationMessages(decryptMessages(row.messages));
        fallbackSummaries.set(row.id, summary);
        await prisma.conversation.update({
          where: { id: row.id },
          data: summary,
        });
      }),
    );
  }

  const summarized = conversations.map((conversation) => {
    const fallback = fallbackSummaries.get(conversation.id);
    const lastMessagePreview = fallback?.lastMessagePreview ?? conversation.lastMessagePreview;
    const messageCount = fallback?.messageCount ?? conversation.messageCount;
    return {
      ...conversation,
      lastMessagePreview,
      messageCount,
      messages: messagesFromPreview(lastMessagePreview),
    };
  });

  logTiming('Conversation list API completed', timer, {
    tenantId,
    page,
    pageSize,
    isActive,
    resultCount: summarized.length,
    total,
    summaryBackfillCount: missingSummaryIds.length,
  });
  return apiPaginated(summarized, total, page, pageSize);
}
