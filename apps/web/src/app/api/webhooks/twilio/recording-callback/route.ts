import { NextRequest } from 'next/server';
import { prisma } from '@/lib/server/db';
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
