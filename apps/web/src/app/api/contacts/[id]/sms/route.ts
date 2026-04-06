import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { sendSms } from '@/lib/server/services/twilioService';
import { z } from 'zod';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

const SmsSchema = z.object({ message: z.string().min(1).max(1600) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { message } = SmsSchema.parse(await req.json());

    const contact = await prisma.contact.findUnique({ where: { id: params.id } });
    if (!contact) return apiError('Contact not found', 404);
    const authResult = await verifyTenantAccess(contact.tenantId);
    if (isNextResponse(authResult)) return authResult;

    await sendSms(contact.tenantId, contact.phone, message);

    await prisma.contact.update({
      where: { id: params.id },
      data: { lastContactAt: new Date() },
    });

    logger.info('Manual SMS sent to contact', { contactId: params.id, tenantId: contact.tenantId });
    return apiSuccess({ sent: true });
  } catch (err: any) {
    return apiError('Internal server error', 500);
  }
}
