import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

const HandoffSchema = z.object({
  status: z.enum(['AI', 'HUMAN']),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);

  try {
    const body = HandoffSchema.parse(await req.json());
    const conversation = await prisma.conversation.findUnique({ where: { id: params.id } });
    if (!conversation) return apiError('Not found', 404);

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
      userId,
    });

    return apiSuccess(updated);
  } catch (err: any) {
    if (err instanceof z.ZodError) return apiError('Invalid status. Must be AI or HUMAN', 400);
    return apiError(err.message, 500);
  }
}
