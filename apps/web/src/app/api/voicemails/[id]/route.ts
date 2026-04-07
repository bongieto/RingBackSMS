import { NextRequest } from 'next/server';
import twilio from 'twilio';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { decryptNullable } from '@/lib/server/encryption';
import { apiSuccess, apiError } from '@/lib/server/response';
import { logger } from '@/lib/server/logger';

/**
 * Extract the Twilio Recording SID (REXXXX...) from a recording URL.
 * Twilio URLs look like: https://api.twilio.com/2010-04-01/Accounts/ACxxx/Recordings/RExxx[.mp3]
 */
function extractRecordingSid(url: string): string | null {
  const match = url.match(/\/Recordings\/(RE[a-f0-9]+)/i);
  return match ? match[1] : null;
}

async function deleteTwilioRecording(
  tenant: { twilioSubAccountSid: string | null; twilioAuthToken: string | null },
  recordingSid: string
): Promise<void> {
  let accountSid: string;
  let authToken: string;

  if (tenant.twilioSubAccountSid && tenant.twilioAuthToken) {
    const decrypted = decryptNullable(tenant.twilioAuthToken);
    if (!decrypted) throw new Error('Failed to decrypt sub-account auth token');
    accountSid = tenant.twilioSubAccountSid;
    authToken = decrypted;
  } else {
    const sid = process.env.TWILIO_MASTER_ACCOUNT_SID;
    const token = process.env.TWILIO_MASTER_AUTH_TOKEN;
    if (!sid || !token) throw new Error('Twilio master credentials not configured');
    accountSid = sid;
    authToken = token;
  }

  const client = twilio(accountSid, authToken);
  await client.recordings(recordingSid).remove();
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return apiError('tenantId required', 400);

  const authResult = await verifyTenantAccess(tenantId);
  if (isNextResponse(authResult)) return authResult;

  const missedCall = await prisma.missedCall.findUnique({
    where: { id: params.id },
    select: { tenantId: true, voicemailUrl: true },
  });

  if (!missedCall || missedCall.tenantId !== tenantId) {
    return apiError('Voicemail not found', 404);
  }

  if (!missedCall.voicemailUrl) {
    return apiError('No voicemail recording', 404);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { twilioSubAccountSid: true, twilioAuthToken: true },
  });

  if (!tenant) return apiError('Tenant not found', 404);

  // Best-effort: delete from Twilio. If Twilio call fails, still clear DB so the
  // user's "delete" action isn't blocked by transient API errors.
  const recordingSid = extractRecordingSid(missedCall.voicemailUrl);
  if (recordingSid) {
    try {
      await deleteTwilioRecording(tenant, recordingSid);
    } catch (err) {
      logger.warn('Failed to delete Twilio recording', { err, recordingSid, tenantId });
    }
  }

  await prisma.missedCall.update({
    where: { id: params.id },
    data: {
      voicemailUrl: null,
      voicemailDuration: null,
      voicemailReceivedAt: null,
    },
  });

  return apiSuccess({ id: params.id, deleted: true });
}
