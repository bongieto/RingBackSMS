import { NextRequest } from 'next/server';
import twilio from 'twilio';
import { z } from 'zod';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { decryptNullable } from '@/lib/server/encryption';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

const BulkDeleteSchema = z.object({
  tenantId: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1).max(100),
});

function extractRecordingSid(url: string): string | null {
  const match = url.match(/\/Recordings\/(RE[a-f0-9]+)/i);
  return match ? match[1] : null;
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof BulkDeleteSchema>;
  try {
    body = BulkDeleteSchema.parse(await req.json());
  } catch {
    return apiError('Invalid request body', 400);
  }

  const authResult = await verifyTenantAccess(body.tenantId);
  if (isNextResponse(authResult)) return authResult;

  const calls = await prisma.missedCall.findMany({
    where: { id: { in: body.ids }, tenantId: body.tenantId, voicemailUrl: { not: null } },
    select: { id: true, voicemailUrl: true },
  });

  if (calls.length === 0) {
    return apiSuccess({ deleted: 0 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: body.tenantId },
    select: { twilioSubAccountSid: true, twilioAuthToken: true },
  });
  if (!tenant) return apiError('Tenant not found', 404);

  // Build Twilio client (master vs sub-account)
  let client: twilio.Twilio | null = null;
  try {
    if (tenant.twilioSubAccountSid && tenant.twilioAuthToken) {
      const decrypted = decryptNullable(tenant.twilioAuthToken);
      if (decrypted) client = twilio(tenant.twilioSubAccountSid, decrypted);
    } else {
      const sid = process.env.TWILIO_MASTER_ACCOUNT_SID;
      const token = process.env.TWILIO_MASTER_AUTH_TOKEN;
      if (sid && token) client = twilio(sid, token);
    }
  } catch (err) {
    logger.warn('Failed to build Twilio client for bulk delete', { err });
  }

  // Best-effort recording deletes in parallel
  if (client) {
    await Promise.allSettled(
      calls.map(async (c) => {
        const sid = c.voicemailUrl ? extractRecordingSid(c.voicemailUrl) : null;
        if (!sid) return;
        try {
          await client!.recordings(sid).remove();
        } catch (err) {
          logger.warn('Failed to delete Twilio recording in bulk', { err, recordingSid: sid });
        }
      })
    );
  }

  const result = await prisma.missedCall.updateMany({
    where: { id: { in: calls.map((c) => c.id) }, tenantId: body.tenantId },
    data: {
      voicemailUrl: null,
      voicemailDuration: null,
      voicemailReceivedAt: null,
    },
  });

  return apiSuccess({ deleted: result.count });
}
