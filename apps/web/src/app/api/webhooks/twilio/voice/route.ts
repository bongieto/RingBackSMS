import { NextRequest } from 'next/server';
import twilio from 'twilio';
import { prisma } from '@/lib/server/db';
import { sendSms } from '@/lib/server/services/twilioService';
import { decryptNullable } from '@/lib/server/encryption';
import { logger } from '@/lib/server/logger';
import { checkRateLimit } from '@/lib/server/rateLimit';

/** Build TwiML XML string without the Twilio SDK VoiceResponse class (avoids serverless bundling issues) */
function buildVoiceTwiml(businessName: string, recordingCallbackUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say voice="Polly.Joanna" language="en-US">Hi, thanks for calling ${escapeXml(businessName)}. We can help you faster by text — you'll receive a message in just a moment. If you'd prefer a callback, leave a message after the beep.</Say>
  <Record maxLength="60" finishOnKey="#" playBeep="true" recordingStatusCallback="${escapeXml(recordingCallbackUrl)}" recordingStatusCallbackMethod="POST" transcribe="false"/>
  <Say voice="Polly.Joanna" language="en-US">Thank you for calling. Check your texts for a message from us. Goodbye!</Say>
</Response>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

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

  // Rate limit: 30 calls per minute per caller phone
  const rl = await checkRateLimit(`twilio-voice:${from}`, 30, 60);
  if (!rl.allowed) {
    logger.warn('Twilio voice webhook rate limited', { from });
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
    return new Response(twiml, { headers: { 'Content-Type': 'text/xml' }, status: 200 });
  }

  // Resolve tenant by the called number
  const tenant = await prisma.tenant.findUnique({
    where: { twilioPhoneNumber: to },
    include: { config: true },
  });

  if (!tenant || !tenant.isActive) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say>This number is not currently in service. Goodbye.</Say><Hangup/></Response>`;
    return new Response(twiml, {
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
  const twiml = buildVoiceTwiml(businessName, `${baseUrl}/api/webhooks/twilio/recording-callback`);

  logger.info('Voice webhook responded with TwiML', { tenantId: tenant.id, callSid });

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  });
}
