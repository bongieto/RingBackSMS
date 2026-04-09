import { NextRequest } from 'next/server';
import twilio from 'twilio';
import { prisma } from '@/lib/server/db';
import { logger } from '@/lib/server/logger';
import { getValidationToken } from '@/lib/server/services/twilioService';
import { analyzeVoicemail } from '@/lib/server/services/aiService';
import { createTask } from '@/lib/server/services/taskService';

/**
 * Fire-and-forget: read the transcript back from the DB, run AI analysis,
 * and write the summary + intent. Kept here so the webhook stays fast.
 */
async function summarizeAndTagVoicemail(missedCallId: string): Promise<void> {
  try {
    const row = await prisma.missedCall.findUnique({
      where: { id: missedCallId },
      select: { voicemailTranscript: true, tenantId: true, callerPhone: true },
    });
    if (!row?.voicemailTranscript) return;
    const { summary, intent } = await analyzeVoicemail(row.voicemailTranscript);
    await prisma.missedCall.update({
      where: { id: missedCallId },
      data: { voicemailSummary: summary, voicemailIntent: intent, transcriptionStatus: 'done' },
    });

    // Create an actionable task for the owner — skip obvious spam.
    if (intent !== 'SPAM') {
      await createTask({
        tenantId: row.tenantId,
        source: 'VOICEMAIL',
        title: summary || 'New voicemail',
        description: row.voicemailTranscript,
        priority: intent === 'COMPLAINT' ? 'URGENT' : 'HIGH',
        callerPhone: row.callerPhone,
        missedCallId,
      }).catch((err) => logger.warn('Failed to create voicemail task', { err, missedCallId }));
    }
  } catch (err) {
    logger.error('summarizeAndTagVoicemail failed', { err, missedCallId });
    await prisma.missedCall
      .update({ where: { id: missedCallId }, data: { transcriptionStatus: 'failed' } })
      .catch(() => {});
  }
}

export async function POST(request: NextRequest) {
  const text = await request.text();
  const params = new URLSearchParams(text);
  const body: Record<string, string> = {};
  params.forEach((v, k) => { body[k] = v; });

  const callSid = body.CallSid;
  const transcriptionText = body.TranscriptionText;
  const transcriptionStatus = body.TranscriptionStatus;

  if (!callSid) {
    return new Response('Missing CallSid', { status: 400 });
  }

  const missedCall = await prisma.missedCall.findUnique({
    where: { twilioCallSid: callSid },
    select: { id: true, tenantId: true },
  });

  if (!missedCall) {
    logger.warn('Transcription callback for unknown CallSid', { callSid });
    return new Response('Unknown call', { status: 404 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: missedCall.tenantId },
    select: { twilioSubAccountSid: true, twilioAuthToken: true },
  });

  const authToken = tenant ? getValidationToken(tenant) : null;
  if (!authToken) {
    logger.error('Missing Twilio auth token for transcription callback', { callSid });
    return new Response('Configuration error', { status: 500 });
  }

  const sig = request.headers.get('x-twilio-signature') ?? '';
  const url = `${process.env.FRONTEND_URL ?? ''}/api/webhooks/twilio/transcription-callback`;
  if (!twilio.validateRequest(authToken, sig, url, body)) {
    logger.warn('Invalid Twilio signature on transcription callback', { callSid });
    return new Response('Invalid signature', { status: 403 });
  }

  if (transcriptionStatus !== 'completed' || !transcriptionText?.trim()) {
    await prisma.missedCall.update({
      where: { id: missedCall.id },
      data: { transcriptionStatus: 'failed' },
    }).catch((err) => logger.error('Failed to mark transcription failed', { err, callSid }));
    return new Response('OK', { status: 200 });
  }

  // Cap transcript length to avoid blowing the AI prompt window downstream.
  const cappedTranscript = transcriptionText.length > 3000
    ? transcriptionText.substring(0, 3000)
    : transcriptionText;

  try {
    await prisma.missedCall.update({
      where: { id: missedCall.id },
      data: { voicemailTranscript: cappedTranscript },
    });
  } catch (err) {
    logger.error('Failed to save transcript', { err, callSid });
    return new Response('OK', { status: 200 });
  }

  // Fire-and-forget AI analysis — don't block Twilio.
  summarizeAndTagVoicemail(missedCall.id).catch((err) =>
    logger.error('summarizeAndTagVoicemail rejected', { err, callSid })
  );

  return new Response('OK', { status: 200 });
}
