import { NextRequest } from 'next/server';
import twilio from 'twilio';
import { prisma } from '@/lib/server/db';
import { sendSms } from '@/lib/server/services/twilioService';
import { decryptNullable } from '@/lib/server/encryption';
import { logger } from '@/lib/server/logger';

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function POST(request: NextRequest) {
  const text = await request.text();
  const params = new URLSearchParams(text);
  const body: Record<string, string> = {};
  params.forEach((v, k) => { body[k] = v; });

  const callSid = body.CallSid;
  const from = body.From;
  const to = body.To;

  if (!callSid || !from || !to) {
    return new Response('Missing required fields', { status: 400 });
  }

  // Resolve tenant by the called number
  const tenant = await prisma.tenant.findUnique({
    where: { twilioPhoneNumber: to },
    include: { config: true },
  });

  if (!tenant || !tenant.isActive) {
    const twiml = new VoiceResponse();
    twiml.say('This number is not currently in service. Goodbye.');
    twiml.hangup();
    return new Response(twiml.toString(), {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  // Verify Twilio signature — fail-closed if token is missing
  const authToken = decryptNullable(tenant.twilioAuthToken);
  if (!authToken) {
    logger.error('Missing Twilio auth token, cannot validate signature', { tenantId: tenant.id });
    return new Response('Configuration error', { status: 500 });
  }
  const sig = request.headers.get('x-twilio-signature') ?? '';
  const url = `${process.env.FRONTEND_URL ?? ''}/api/webhooks/twilio/voice`;
  if (!twilio.validateRequest(authToken, sig, url, body)) {
    logger.warn('Invalid Twilio signature on voice webhook', { tenantId: tenant.id });
    return new Response('Invalid signature', { status: 403 });
  }

  const businessName = tenant.name;
  const baseUrl = process.env.FRONTEND_URL ?? '';

  // Create the missed call record immediately
  try {
    await prisma.missedCall.create({
      data: {
        tenantId: tenant.id,
        callerPhone: from,
        twilioCallSid: callSid,
        occurredAt: new Date(),
        smsSent: false,
      },
    });
  } catch (err: any) {
    // Duplicate CallSid — call already tracked
    if (!err.message?.includes('Unique constraint')) {
      logger.error('Failed to create missed call record', { err, tenantId: tenant.id });
    }
  }

  // Send the SMS greeting immediately (don't wait for voicemail)
  if (tenant.config?.greeting) {
    sendSms(tenant.id, from, tenant.config.greeting)
      .then(() =>
        prisma.missedCall.update({
          where: { twilioCallSid: callSid },
          data: { smsSent: true },
        })
      )
      .catch((err) => logger.error('Failed to send SMS on voice webhook', { err, tenantId: tenant.id }));
  }

  // Build TwiML response: short greeting + optional voicemail
  const twiml = new VoiceResponse();

  // Brief pause to feel natural
  twiml.pause({ length: 1 });

  twiml.say(
    { voice: 'Polly.Joanna', language: 'en-US' },
    `Hi, thanks for calling ${businessName}. We can help you faster by text — you'll receive a message in just a moment. If you'd prefer a callback, leave a message after the beep.`
  );

  // Record voicemail (max 60 seconds)
  twiml.record({
    maxLength: 60,
    finishOnKey: '#',
    playBeep: true,
    recordingStatusCallback: `${baseUrl}/api/webhooks/twilio/recording-callback`,
    recordingStatusCallbackMethod: 'POST',
    transcribe: false,
  });

  // If they don't leave a message, say goodbye
  twiml.say(
    { voice: 'Polly.Joanna', language: 'en-US' },
    'Thank you for calling. Check your texts for a message from us. Goodbye!'
  );

  logger.info('Voice webhook responded with TwiML', { tenantId: tenant.id, callSid });

  return new Response(twiml.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  });
}
