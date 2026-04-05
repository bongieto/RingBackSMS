import { NextRequest } from 'next/server';
import twilio from 'twilio';
import { prisma } from '@/lib/server/db';
import { processInboundSms } from '@/lib/server/services/flowEngineService';
import { decryptNullable } from '@/lib/server/encryption';
import { logger } from '@/lib/server/logger';
import { TwilioInboundSmsSchema } from '@ringback/shared-types';

export async function POST(request: NextRequest) {
  const text = await request.text();
  const params = new URLSearchParams(text);
  const body: Record<string, string> = {};
  params.forEach((v, k) => { body[k] = v; });

  const parseResult = TwilioInboundSmsSchema.safeParse(body);
  if (!parseResult.success) return new Response('Invalid payload', { status: 400 });

  const { MessageSid, From, Body, To } = parseResult.data;

  // Resolve tenant
  const tenant = await prisma.tenant.findUnique({
    where: { twilioPhoneNumber: To },
    select: { id: true, isActive: true, twilioAuthToken: true },
  });

  if (!tenant || !tenant.isActive) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }, status: 200,
    });
  }

  // Verify signature
  const authToken = decryptNullable(tenant.twilioAuthToken);
  if (authToken) {
    const sig = request.headers.get('x-twilio-signature') ?? '';
    const url = `${process.env.FRONTEND_URL ?? ''}/api/webhooks/twilio/sms-reply`;
    if (!twilio.validateRequest(authToken, sig, url, body)) {
      return new Response('Invalid signature', { status: 403 });
    }
  }

  // Respond immediately to Twilio to avoid timeout
  const twimlResponse = new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' }, status: 200,
  });

  // Process asynchronously (fire and forget)
  processInboundSms({ tenantId: tenant.id, callerPhone: From, inboundMessage: Body, messageSid: MessageSid })
    .catch((err) => logger.error('Async SMS processing error', { err, tenantId: tenant.id, messageSid: MessageSid }));

  return twimlResponse;
}
