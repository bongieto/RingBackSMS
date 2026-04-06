import { NextRequest } from 'next/server';
import twilio from 'twilio';
import { prisma } from '@/lib/server/db';
import { decryptNullable } from '@/lib/server/encryption';
import { logger } from '@/lib/server/logger';

export async function POST(request: NextRequest) {
  const text = await request.text();
  const params = new URLSearchParams(text);
  const body: Record<string, string> = {};
  params.forEach((v, k) => { body[k] = v; });

  const callSid = body.CallSid;
  const recordingUrl = body.RecordingUrl;
  const recordingStatus = body.RecordingStatus;
  const recordingDuration = body.RecordingDuration;

  if (!callSid || !recordingUrl) {
    return new Response('Missing required fields', { status: 400 });
  }

  // Resolve tenant via the missed call record to validate the signature
  const missedCall = await prisma.missedCall.findUnique({
    where: { twilioCallSid: callSid },
    select: { tenantId: true },
  });

  if (!missedCall) {
    logger.warn('Recording callback for unknown CallSid', { callSid });
    return new Response('Unknown call', { status: 404 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: missedCall.tenantId },
    select: { twilioAuthToken: true },
  });

  const authToken = tenant ? decryptNullable(tenant.twilioAuthToken) : null;
  if (!authToken) {
    logger.error('Missing Twilio auth token for recording callback', { callSid, tenantId: missedCall.tenantId });
    return new Response('Configuration error', { status: 500 });
  }

  const sig = request.headers.get('x-twilio-signature') ?? '';
  const url = `${process.env.FRONTEND_URL ?? ''}/api/webhooks/twilio/recording-callback`;
  if (!twilio.validateRequest(authToken, sig, url, body)) {
    logger.warn('Invalid Twilio signature on recording callback', { callSid });
    return new Response('Invalid signature', { status: 403 });
  }

  // Only process completed recordings
  if (recordingStatus !== 'completed') {
    logger.debug('Recording not completed, skipping', { callSid, status: recordingStatus });
    return new Response('OK', { status: 200 });
  }

  const duration = parseInt(recordingDuration ?? '0', 10);

  // Skip very short recordings (< 2 seconds) — likely just silence/hangup
  if (duration < 2) {
    logger.debug('Recording too short, skipping', { callSid, duration });
    return new Response('OK', { status: 200 });
  }

  try {
    await prisma.missedCall.update({
      where: { twilioCallSid: callSid },
      data: {
        voicemailUrl: `${recordingUrl}.mp3`,
        voicemailDuration: duration,
        voicemailReceivedAt: new Date(),
      },
    });

    logger.info('Voicemail saved', { callSid, duration, recordingUrl });
  } catch (err) {
    logger.error('Failed to save voicemail', { err, callSid });
  }

  return new Response('OK', { status: 200 });
}
