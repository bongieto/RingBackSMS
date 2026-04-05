import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; noteId: string } }) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);

  const note = await prisma.contactNote.findFirst({
    where: { id: params.noteId, contactId: params.id },
  });

  if (!note) return apiError('ContactNote not found', 404);

  await prisma.contactNote.delete({ where: { id: params.noteId } });

  logger.info('Contact note deleted', { contactId: params.id, noteId: params.noteId });
  return apiSuccess({ deleted: true });
}
