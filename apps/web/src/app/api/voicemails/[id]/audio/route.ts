import { NextRequest } from 'next/server';
import { verifyTenantAccess, isNextResponse } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { decryptNullable } from '@/lib/server/encryption';
import { apiError } from '@/lib/server/response';

export async function GET(
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

  let credentials: string;
  if (tenant?.twilioSubAccountSid && tenant.twilioAuthToken) {
    // Legacy sub-account path
    const authToken = decryptNullable(tenant.twilioAuthToken);
    if (!authToken) {
      return apiError('Failed to decrypt Twilio credentials', 500);
    }
    credentials = Buffer.from(`${tenant.twilioSubAccountSid}:${authToken}`).toString('base64');
  } else {
    // Master account path (post-A2P migration)
    const sid = process.env.TWILIO_MASTER_ACCOUNT_SID;
    const token = process.env.TWILIO_MASTER_AUTH_TOKEN;
    if (!sid || !token) {
      return apiError('Twilio master credentials not configured', 500);
    }
    credentials = Buffer.from(`${sid}:${token}`).toString('base64');
  }

  const twilioRes = await fetch(missedCall.voicemailUrl, {
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  });

  if (!twilioRes.ok) {
    return apiError('Failed to fetch voicemail from Twilio', 502);
  }

  return new Response(twilioRes.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': twilioRes.headers.get('content-length') ?? '',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
