import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { z } from 'zod';
import { apiSuccess, apiCreated, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

const NoteSchema = z.object({ body: z.string().min(1).max(5000) });

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);

  const contact = await prisma.contact.findUnique({ where: { id: params.id } });
  if (!contact) return apiError('Contact not found', 404);

  const notes = await prisma.contactNote.findMany({
    where: { contactId: params.id },
    orderBy: { createdAt: 'desc' },
  });

  return apiSuccess(notes);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  try {
    const { body } = NoteSchema.parse(await req.json());

    const contact = await prisma.contact.findUnique({ where: { id: params.id } });
    if (!contact) return apiError('Contact not found', 404);

    const note = await prisma.contactNote.create({
      data: {
        contactId: params.id,
        tenantId: contact.tenantId,
        body,
      },
    });

    logger.info('Contact note added', { contactId: params.id, noteId: note.id });
    return apiCreated(note);
  } catch (err: any) {
    return apiError(err.message ?? 'Internal server error', 500);
  }
}
