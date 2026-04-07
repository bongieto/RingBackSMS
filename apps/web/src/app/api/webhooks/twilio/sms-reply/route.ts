import { NextRequest } from 'next/server';
import twilio from 'twilio';
import { prisma } from '@/lib/server/db';
import { processInboundSms } from '@/lib/server/services/flowEngineService';
import { logger } from '@/lib/server/logger';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { getValidationToken } from '@/lib/server/services/twilioService';
import { TwilioInboundSmsSchema } from '@ringback/shared-types';

export async function POST(request: NextRequest) {
  const text = await request.text();
  const params = new URLSearchParams(text);
  const body: Record<string, string> = {};
  params.forEach((v, k) => { body[k] = v; });

  const parseResult = TwilioInboundSmsSchema.safeParse(body);
  if (!parseResult.success) return new Response('Invalid payload', { status: 400 });

  const { MessageSid, From, Body, To } = parseResult.data;

  // Rate limit: 60 SMS per minute per sender phone (abuse/loop protection)
  const rl = await checkRateLimit(`twilio-sms:${From}`, 60, 60);
  if (!rl.allowed) {
    logger.warn('Twilio SMS webhook rate limited', { from: From });
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }, status: 200,
    });
  }

  // Resolve tenant
  const tenant = await prisma.tenant.findUnique({
    where: { twilioPhoneNumber: To },
    select: { id: true, isActive: true, twilioSubAccountSid: true, twilioAuthToken: true },
  });

  if (!tenant || !tenant.isActive) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }, status: 200,
    });
  }

  // Verify signature — fail-closed if token is missing
  const authToken = getValidationToken(tenant);
  if (!authToken) {
    logger.error('Missing Twilio auth token, cannot validate signature', { tenantId: tenant.id });
    return new Response('Configuration error', { status: 500 });
  }
  const sig = request.headers.get('x-twilio-signature') ?? '';
  const url = `${process.env.FRONTEND_URL ?? ''}/api/webhooks/twilio/sms-reply`;
  if (!twilio.validateRequest(authToken, sig, url, body)) {
    return new Response('Invalid signature', { status: 403 });
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
