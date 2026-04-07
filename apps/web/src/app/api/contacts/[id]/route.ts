import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { ContactStatus } from '@prisma/client';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';
import { encryptNullable, decryptMaybePlaintext } from '@/lib/server/encryption';

function decryptContact<T extends { name: string | null; email: string | null }>(c: T): T {
  return { ...c, name: decryptMaybePlaintext(c.name), email: decryptMaybePlaintext(c.email) };
}

const UpdateSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.nativeEnum(ContactStatus).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const contact = await prisma.contact.findUnique({ where: { id: params.id } });
  if (!contact) return apiError('Contact not found', 404);
  const authResult = await verifyTenantAccess(contact.tenantId);
  if (isNextResponse(authResult)) return authResult;

  const [conversationCount, orderCount] = await Promise.all([
    prisma.conversation.count({
      where: { tenantId: contact.tenantId, callerPhone: contact.phone },
    }),
    prisma.order.count({
      where: { tenantId: contact.tenantId, callerPhone: contact.phone },
    }),
  ]);

  return apiSuccess({ ...decryptContact(contact), conversationCount, orderCount });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = UpdateSchema.parse(await req.json());

    const existing = await prisma.contact.findUnique({ where: { id: params.id } });
    if (!existing) return apiError('Contact not found', 404);
    const authResult = await verifyTenantAccess(existing.tenantId);
    if (isNextResponse(authResult)) return authResult;

    const contact = await prisma.contact.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined && { name: encryptNullable(body.name || null) }),
        ...(body.email !== undefined && { email: encryptNullable(body.email || null) }),
        ...(body.notes !== undefined && { notes: body.notes || null }),
        ...(body.tags !== undefined && { tags: body.tags }),
        ...(body.status !== undefined && { status: body.status }),
      },
    });

    logger.info('Contact updated', { contactId: contact.id });
    return apiSuccess(decryptContact(contact));
  } catch (err: any) {
    return apiError('Internal server error', 500);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const existing = await prisma.contact.findUnique({ where: { id: params.id } });
  if (!existing) return apiError('Contact not found', 404);
  const authResult = await verifyTenantAccess(existing.tenantId);
  if (isNextResponse(authResult)) return authResult;

  await prisma.contact.delete({ where: { id: params.id } });

  logger.info('Contact deleted', { contactId: params.id });
  return apiSuccess({ deleted: true });
}
