import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';
import { sendNotification } from '@/lib/server/services/notificationService';
import { createTask, autoCompleteTasksForEntity } from '@/lib/server/services/taskService';

const HandoffSchema = z.object({
  status: z.enum(['AI', 'HUMAN']),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = HandoffSchema.parse(await req.json());
    const conversation = await prisma.conversation.findUnique({ where: { id: params.id } });
    if (!conversation) return apiError('Not found', 404);
    const authResult = await verifyTenantAccess(conversation.tenantId);
    if (isNextResponse(authResult)) return authResult;

    const updated = await prisma.conversation.update({
      where: { id: params.id },
      data: {
        handoffStatus: body.status,
        handoffAt: body.status === 'HUMAN' ? new Date() : null,
        updatedAt: new Date(),
      },
      include: { orders: true, meetings: true },
    });

    logger.info('Handoff status changed', {
      conversationId: params.id,
      status: body.status,
      userId: authResult.userId,
    });

    // Notify owner when conversation is escalated to human
    if (body.status === 'HUMAN') {
      sendNotification({
        tenantId: conversation.tenantId,
        subject: 'Conversation escalated to human',
        message: `A conversation with ${conversation.callerPhone} has been escalated and needs your attention. View it in your dashboard.`,
        channel: 'email',
      }).catch((err) => logger.error('Failed to send handoff notification', { err }));

      // Also notify via Slack if configured
      sendNotification({
        tenantId: conversation.tenantId,
        subject: 'Conversation escalated to human',
        message: `A conversation with ${conversation.callerPhone} needs human attention.`,
        channel: 'slack',
      }).catch((err) => logger.error('Failed to send Slack handoff notification', { err }));

      createTask({
        tenantId: conversation.tenantId,
        source: 'CONVERSATION',
        title: `Reply needed: ${conversation.callerPhone}`,
        priority: 'HIGH',
        callerPhone: conversation.callerPhone,
        conversationId: params.id,
      }).catch((err) => logger.warn('Failed to create handoff task', { err }));
    } else {
      // Returning to AI → close any open handoff task for this conversation.
      autoCompleteTasksForEntity('CONVERSATION', 'conversationId', params.id).catch((err) =>
        logger.warn('Failed to auto-complete handoff task', { err })
      );
    }

    return apiSuccess(updated);
  } catch (err: any) {
    if (err instanceof z.ZodError) return apiError('Invalid status. Must be AI or HUMAN', 400);
    return apiError('Internal server error', 500);
  }
}
