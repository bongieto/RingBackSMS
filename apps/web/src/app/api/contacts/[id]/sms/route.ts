import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/server/db';
import { sendSms } from '@/lib/server/services/twilioService';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

const SmsSchema = z.object({ message: z.string().min(1).max(1600) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return apiError('Unauthorized', 401);
  try {
    const { message } = SmsSchema.parse(await req.json());

    const contact = await prisma.contact.findUnique({ where: { id: params.id } });
    if (!contact) return apiError('Contact not found', 404);

    await sendSms(contact.tenantId, contact.phone, message);

    await prisma.contact.update({
      where: { id: params.id },
      data: { lastContactAt: new Date() },
    });

    logger.info('Manual SMS sent to contact', { contactId: params.id, tenantId: contact.tenantId });
    return apiSuccess({ sent: true });
  } catch (err: any) {
    return apiError(err.message ?? 'Internal server error', 500);
  }
}
