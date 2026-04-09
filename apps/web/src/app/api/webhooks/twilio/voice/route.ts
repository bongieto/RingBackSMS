import { NextRequest } from 'next/server';
import twilio from 'twilio';
import { prisma } from '@/lib/server/db';
import { sendSmsWithRetry } from '@/lib/server/services/twilioService';
import { logger } from '@/lib/server/logger';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { getValidationToken } from '@/lib/server/services/twilioService';
import { linkMissedCallToContact } from '@/lib/server/services/contactLinking';
import { isWithinBusinessHours } from '@/lib/server/businessHours';
import { getCallerContext, type CallerTier } from '@/lib/server/services/callerContextService';
import { sendHighPriorityAlert } from '@/lib/server/services/notificationService';
import { acquireAlertLock } from '@/lib/server/services/stateService';
import { createTask } from '@/lib/server/services/taskService';
import { maskPhone } from '@/lib/server/phoneUtils';

const ALLOWED_VOICES = new Set([
  'Polly.Joanna-Neural',
  'Polly.Matthew-Neural',
  'Polly.Salli-Neural',
  'Polly.Ivy-Neural',
]);

/** Transparently upgrade legacy non-neural voice IDs stored in the DB. */
const LEGACY_VOICE_UPGRADE: Record<string, string> = {
  'Polly.Joanna': 'Polly.Joanna-Neural',
  'Polly.Matthew': 'Polly.Matthew-Neural',
  'Polly.Salli': 'Polly.Salli-Neural',
  'Polly.Ivy': 'Polly.Ivy-Neural',
};

/** Build TwiML XML string without the Twilio SDK VoiceResponse class (avoids serverless bundling issues) */
function buildVoiceTwiml(opts: {
  businessName: string;
  voiceGreeting: string | null;
  voiceType: string;
  recordingCallbackUrl: string;
  transcribeCallbackUrl: string;
}): string {
  const intro = opts.voiceGreeting?.trim()
    || `Hi, thanks for calling ${opts.businessName}. We can help you faster by text — you'll receive a message in just a moment. If you'd prefer a callback, leave a message after the beep.`;
  const upgraded = LEGACY_VOICE_UPGRADE[opts.voiceType] ?? opts.voiceType;
  const voice = ALLOWED_VOICES.has(upgraded) ? upgraded : 'Polly.Joanna-Neural';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say voice="${voice}" language="en-US">${escapeXml(intro)}</Say>
  <Record maxLength="60" finishOnKey="#" playBeep="true" recordingStatusCallback="${escapeXml(opts.recordingCallbackUrl)}" recordingStatusCallbackMethod="POST" transcribe="true" transcribeCallback="${escapeXml(opts.transcribeCallbackUrl)}"/>
  <Say voice="${voice}" language="en-US">Thank you for calling. Check your texts for a message from us. Goodbye!</Say>
</Response>`;
}

/**
 * Selects the SMS + voice greeting text based on caller tier and after-hours
 * status. Falls back gracefully: rapid-redial → after-hours → returning → default.
 */
function selectGreeting(opts: {
  tier: CallerTier;
  isAfterHours: boolean;
  config: {
    greeting: string;
    greetingAfterHours: string | null;
    greetingRapidRedial: string | null;
    greetingReturning: string | null;
    voiceGreeting: string | null;
    voiceGreetingAfterHours: string | null;
    voiceGreetingRapidRedial: string | null;
    voiceGreetingReturning: string | null;
  } | null;
}): { sms: string | null; voice: string | null } {
  if (!opts.config) return { sms: null, voice: null };
  const c = opts.config;
  const pick = (...xs: (string | null | undefined)[]): string | null => {
    for (const x of xs) {
      const trimmed = x?.trim();
      if (trimmed) return trimmed;
    }
    return null;
  };

  if (opts.tier === 'RAPID_REDIAL') {
    return {
      sms: pick(c.greetingRapidRedial, c.greeting),
      voice: pick(c.voiceGreetingRapidRedial, c.voiceGreeting),
    };
  }

  if (opts.isAfterHours) {
    return {
      sms: pick(c.greetingAfterHours, c.greeting),
      voice: pick(c.voiceGreetingAfterHours, c.voiceGreeting),
    };
  }

  if (opts.tier === 'RETURNING') {
    return {
      sms: pick(c.greetingReturning, c.greeting),
      voice: pick(c.voiceGreetingReturning, c.voiceGreeting),
    };
  }

  return {
    sms: pick(c.greeting),
    voice: pick(c.voiceGreeting),
  };
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
  const authToken = getValidationToken(tenant);
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

  // Look up caller context BEFORE creating the new MissedCall so the tier
  // calculation reflects prior calls (not this one).
  const callerContext = await getCallerContext(tenant.id, from).catch((err) => {
    logger.error('getCallerContext failed', { err, tenantId: tenant.id });
    return null;
  });
  const tier: CallerTier = callerContext?.tier ?? 'NEW';

  // Idempotent upsert keyed on twilioCallSid — safe against Twilio
  // retries and the voice/call-status race.
  let missedCallId: string | null = null;
  try {
    const record = await prisma.missedCall.upsert({
      where: { twilioCallSid: callSid },
      create: {
        tenantId: tenant.id,
        callerPhone: from,
        twilioCallSid: callSid,
        occurredAt: new Date(),
        smsSent: false,
        transcriptionStatus: 'pending',
        callerTier: tier,
      },
      update: {}, // no-op if already exists
      select: { id: true },
    });
    missedCallId = record.id;
  } catch (err: any) {
    logger.error('Failed to upsert missed call record', { err, tenantId: tenant.id });
  }

  // Fire-and-forget: link to Contact (creates one if needed). Doesn't block TwiML.
  if (missedCallId) {
    linkMissedCallToContact(tenant.id, from, missedCallId).catch((err) =>
      logger.error('Contact linking failed', { err, tenantId: tenant.id })
    );
  }

  // High-priority alert when the same caller is rapid-redialing — debounced
  // to once per (tenant, caller) per 30 minutes so we don't spam the owner.
  if (tier === 'RAPID_REDIAL') {
    acquireAlertLock(`rapidredial:${tenant.id}:${from}`, 30 * 60)
      .then(async (acquired) => {
        if (!acquired) return;
        const callCount = (callerContext?.recentMissedCalls.length ?? 0) + 1;
        await sendHighPriorityAlert({
          tenantId: tenant.id,
          subject: `Repeat caller — ${maskPhone(from)}`,
          message: `${maskPhone(from)} has called ${callCount} times in the last few minutes. Probably urgent.`,
        });
        if (missedCallId) {
          await createTask({
            tenantId: tenant.id,
            source: 'RAPID_REDIAL',
            title: `🔥 Call back ${maskPhone(from)} — ${callCount}+ attempts`,
            priority: 'URGENT',
            callerPhone: from,
            missedCallId,
          });
        }
      })
      .catch((err) => logger.error('Rapid-redial alert failed', { err, tenantId: tenant.id }));
  }

  // Pick open vs after-hours / tier-aware greetings
  const isOpen = tenant.config
    ? isWithinBusinessHours({
        businessHoursStart: tenant.config.businessHoursStart,
        businessHoursEnd: tenant.config.businessHoursEnd,
        businessDays: tenant.config.businessDays,
        businessSchedule: (tenant.config.businessSchedule as any) ?? null,
        closedDates: tenant.config.closedDates,
        timezone: tenant.config.timezone,
      })
    : true;

  const { sms: smsGreeting, voice: voiceGreetingText } = selectGreeting({
    tier,
    isAfterHours: !isOpen,
    config: tenant.config,
  });

  // Send the SMS greeting with retry (fire-and-forget, 3 attempts max)
  if (smsGreeting) {
    sendSmsWithRetry(tenant.id, from, smsGreeting)
      .then((sent) => {
        if (sent) {
          prisma.missedCall.update({
            where: { twilioCallSid: callSid },
            data: { smsSent: true },
          }).catch(() => {});
        }
      })
      .catch((err) => logger.error('Failed to send SMS on voice webhook', { err, tenantId: tenant.id }));
  }

  // Build TwiML response: short greeting + optional voicemail
  const twiml = buildVoiceTwiml({
    businessName,
    voiceGreeting: voiceGreetingText,
    voiceType: tenant.config?.voiceType ?? 'Polly.Joanna',
    recordingCallbackUrl: `${baseUrl}/api/webhooks/twilio/recording-callback`,
    transcribeCallbackUrl: `${baseUrl}/api/webhooks/twilio/transcription-callback`,
  });

  logger.info('Voice webhook responded with TwiML', { tenantId: tenant.id, callSid, tier });

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  });
}
