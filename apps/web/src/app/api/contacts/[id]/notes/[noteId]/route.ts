import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; noteId: string } }) {
  const note = await prisma.contactNote.findFirst({
    where: { id: params.noteId, contactId: params.id },
  });

  if (!note) return apiError('ContactNote not found', 404);
  const authResult = await verifyTenantAccess(note.tenantId);
  if (isNextResponse(authResult)) return authResult;

  await prisma.contactNote.delete({ where: { id: params.noteId } });

  logger.info('Contact note deleted', { contactId: params.id, noteId: params.noteId });
  return apiSuccess({ deleted: true });
}
