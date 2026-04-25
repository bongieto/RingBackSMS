import { NextRequest } from 'next/server';
import twilio from 'twilio';
import { prisma } from '@/lib/server/db';
import { sendSms, sendSmsWithRetry } from '@/lib/server/services/twilioService';
import { logger } from '@/lib/server/logger';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { getValidationToken } from '@/lib/server/services/twilioService';
import {
  isCallerSuppressed,
  buildConsentMessage,
  createConsentRequest,
  logConsentEvent,
} from '@/lib/server/services/consentService';
import { linkMissedCallToContact } from '@/lib/server/services/contactLinking';
import {
  isWithinBusinessHours,
  buildGreetingVars,
  renderGreetingTemplate,
} from '@/lib/server/businessHours';
import { getCallerContext, type CallerTier } from '@/lib/server/services/callerContextService';
import { sendHighPriorityAlert } from '@/lib/server/services/notificationService';
import { acquireAlertLock } from '@/lib/server/services/stateService';
import { createTask } from '@/lib/server/services/taskService';
import { maskPhone } from '@/lib/server/phoneUtils';
import { waitUntil } from '@/lib/server/waitUntil';
import { classifyCaller } from '@/lib/server/services/spamLookupService';

// Give the handler 30s so background SMS/TTS work can finish on Vercel
export const maxDuration = 30;

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
  voiceAudioUrl: string | null;
  voiceType: string;
  recordingCallbackUrl: string;
  transcribeCallbackUrl: string;
}): string {
  const upgraded = LEGACY_VOICE_UPGRADE[opts.voiceType] ?? opts.voiceType;
  const voice = ALLOWED_VOICES.has(upgraded) ? upgraded : 'Polly.Joanna-Neural';

  // If pre-generated OpenAI TTS audio exists, use <Play>; otherwise fall back to <Say>
  let introVerb: string;
  if (opts.voiceAudioUrl) {
    introVerb = `<Play>${escapeXml(opts.voiceAudioUrl)}</Play>`;
  } else {
    const intro = opts.voiceGreeting?.trim()
      || `Hi, thanks for calling ${opts.businessName}. We can help you faster by text — you'll receive a message in just a moment. If you'd prefer a callback, leave a message after the beep.`;
    introVerb = `<Say voice="${voice}" language="en-US">${escapeXml(intro)}</Say>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  ${introVerb}
  <Record maxLength="60" finishOnKey="#" playBeep="true" recordingStatusCallback="${escapeXml(opts.recordingCallbackUrl)}" recordingStatusCallbackMethod="POST" transcribe="true" transcribeCallback="${escapeXml(opts.transcribeCallbackUrl)}"/>
  <Say voice="${voice}" language="en-US">Thank you for calling. Check your texts for a message from us. Goodbye!</Say>
</Response>`;
}

/**
 * Selects the voice greeting text (TTS) based on caller tier and after-hours
 * status. Falls back gracefully: tier-specific → default.
 * SMS greetings are no longer used — the TCPA consent message is sent instead.
 */
function selectVoiceGreeting(opts: {
  tier: CallerTier;
  isAfterHours: boolean;
  config: {
    voiceGreeting: string | null;
    voiceGreetingAfterHours: string | null;
    voiceGreetingRapidRedial: string | null;
    voiceGreetingReturning: string | null;
  } | null;
}): string | null {
  if (!opts.config) return null;
  const c = opts.config;
  const pick = (...xs: (string | null | undefined)[]): string | null => {
    for (const x of xs) {
      const trimmed = x?.trim();
      if (trimmed) return trimmed;
    }
    return null;
  };

  if (opts.tier === 'RAPID_REDIAL') return pick(c.voiceGreetingRapidRedial, c.voiceGreeting);
  if (opts.isAfterHours) return pick(c.voiceGreetingAfterHours, c.voiceGreeting);
  if (opts.tier === 'RETURNING') return pick(c.voiceGreetingReturning, c.voiceGreeting);
  return pick(c.voiceGreeting);
}

/**
 * Selects the pre-generated audio URL based on caller tier and after-hours.
 * Same cascade logic as selectVoiceGreeting. Returns null if no audio exists.
 */
function selectVoiceAudioUrl(opts: {
  tier: CallerTier;
  isAfterHours: boolean;
  config: {
    voiceAudioUrl: string | null;
    voiceAudioUrlAfterHours: string | null;
    voiceAudioUrlRapidRedial: string | null;
    voiceAudioUrlReturning: string | null;
  } | null;
}): string | null {
  if (!opts.config) return null;
  const c = opts.config;
  const pick = (...xs: (string | null | undefined)[]): string | null => {
    for (const x of xs) {
      const trimmed = x?.trim();
      if (trimmed) return trimmed;
    }
    return null;
  };

  if (opts.tier === 'RAPID_REDIAL') return pick(c.voiceAudioUrlRapidRedial, c.voiceAudioUrl);
  if (opts.isAfterHours) return pick(c.voiceAudioUrlAfterHours, c.voiceAudioUrl);
  if (opts.tier === 'RETURNING') return pick(c.voiceAudioUrlReturning, c.voiceAudioUrl);
  return pick(c.voiceAudioUrl);
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

  // Pre-verify Twilio signature with master auth token BEFORE any DB lookup.
  // This prevents unauthenticated actors from probing which phone numbers
  // have tenants. Fail-closed: missing master token = refuse webhook.
  const masterToken = process.env.TWILIO_MASTER_AUTH_TOKEN?.trim();
  if (!masterToken) {
    logger.error('TWILIO_MASTER_AUTH_TOKEN not configured — refusing webhook');
    return new Response('Webhook not configured', { status: 500 });
  }
  const sig = request.headers.get('x-twilio-signature') ?? '';
  const webhookUrl = `${process.env.FRONTEND_URL ?? ''}/api/webhooks/twilio/voice`;
  if (!twilio.validateRequest(masterToken, sig, webhookUrl, body)) {
    logger.warn('Invalid Twilio signature on voice webhook (master pre-check)');
    return new Response('Invalid signature', { status: 403 });
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

  // Re-verify with sub-account token if tenant has one (belt-and-suspenders).
  // Fail-closed on unresolvable token.
  if (tenant.twilioSubAccountSid && tenant.twilioAuthToken) {
    const subToken = getValidationToken(tenant);
    if (!subToken) {
      logger.error('Sub-account Twilio token could not be resolved', { tenantId: tenant.id });
      return new Response('Tenant auth token misconfigured', { status: 500 });
    }
    if (!twilio.validateRequest(subToken, sig, webhookUrl, body)) {
      logger.warn('Invalid Twilio signature on voice webhook (sub-account)', { tenantId: tenant.id });
      return new Response('Invalid signature', { status: 403 });
    }
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
    waitUntil(
      linkMissedCallToContact(tenant.id, from, missedCallId).catch((err) =>
        logger.error('Contact linking failed', { err, tenantId: tenant.id })
      )
    );
  }

  // High-priority alert when the same caller is rapid-redialing — debounced
  // to once per (tenant, caller) per 30 minutes so we don't spam the owner.
  if (tier === 'RAPID_REDIAL') {
    waitUntil(
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
        .catch((err) => logger.error('Rapid-redial alert failed', { err, tenantId: tenant.id }))
    );
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

  const rawVoiceGreetingText = selectVoiceGreeting({
    tier,
    isAfterHours: !isOpen,
    config: tenant.config,
  });

  // Substitute {business_name}, {next_open}, {today_hours}, {closes_at}
  // into the greeting text. Lets a SINGLE after-hours greeting be
  // correct across all closed scenarios (tonight, day off, holiday) —
  // the operator writes "We'll reopen {next_open}" and the right answer
  // is computed at call time.
  const hasPlaceholders = !!rawVoiceGreetingText && /\{[a-z_]+\}/i.test(rawVoiceGreetingText);
  const voiceGreetingText = rawVoiceGreetingText
    ? renderGreetingTemplate(
        rawVoiceGreetingText,
        tenant.config
          ? buildGreetingVars(businessName, {
              businessHoursStart: tenant.config.businessHoursStart,
              businessHoursEnd: tenant.config.businessHoursEnd,
              businessDays: tenant.config.businessDays,
              businessSchedule: (tenant.config.businessSchedule as any) ?? null,
              closedDates: tenant.config.closedDates,
              timezone: tenant.config.timezone,
            })
          : { business_name: businessName },
      )
    : null;

  const voiceAudioUrlRaw = selectVoiceAudioUrl({
    tier,
    isAfterHours: !isOpen,
    config: tenant.config,
  });
  // If the greeting text uses placeholders, any pre-generated static MP3
  // was rendered from stale literal text and would play "{next_open}"
  // verbatim. Skip it and fall back to real-time TTS, which reads the
  // substituted voiceGreetingText above. Keeps operators from having to
  // regenerate audio every time business hours shift.
  const voiceAudioUrl = hasPlaceholders ? null : voiceAudioUrlRaw;

  // TCPA consent-first flow — send consent request SMS. Using console.log
  // directly (not Winston) because Vercel's serverless log pipeline seems to
  // be dropping Winston JSON output. console.* is always captured verbatim.
  console.log('[consent-sms] start', JSON.stringify({ tenantId: tenant.id, from }));

  const consentPromise = (async () => {
    try {
      const suppressed = await isCallerSuppressed(tenant.id, from);
      console.log('[consent-sms] suppressed-check', JSON.stringify({ suppressed }));
      if (suppressed) return;

      // Spam/robocall gate: Twilio Lookup tells us when the inbound
      // number is invalid or matches the unbranded-VoIP fingerprint
      // typical of robocallers. Cached 30d/global so a returning
      // legit caller doesn't trigger a paid lookup every time.
      const spam = await classifyCaller(from);
      if (!spam.allow) {
        console.log('[consent-sms] spam-blocked', JSON.stringify({
          from,
          reason: spam.reason,
          lineType: spam.lineType,
          cached: spam.cached,
        }));
        await logConsentEvent(tenant.id, from, 'sms_send_failed', {
          errorCode: 'spam_blocked',
          errorMessage: spam.reason,
        }).catch(() => {});
        return;
      }

      const { id: consentRequestId, alreadyPending } = await createConsentRequest(tenant.id, from, to);
      console.log('[consent-sms] create-result', JSON.stringify({ consentRequestId, alreadyPending }));
      if (alreadyPending) return;

      // Consent SMS now supports full placeholder substitution — the
      // tenant's stored consentMessage (editable in Settings) can use
      // {business_name}, {next_open}, {today_hours}, {closes_at}.
      // Falls back to DEFAULT_CONSENT_TEMPLATE when no custom message
      // is set.
      const consentMsg = buildConsentMessage(businessName, {
        customTemplate: tenant.config?.consentMessage,
        hoursConfig: tenant.config
          ? {
              businessHoursStart: tenant.config.businessHoursStart,
              businessHoursEnd: tenant.config.businessHoursEnd,
              businessDays: tenant.config.businessDays,
              businessSchedule: (tenant.config.businessSchedule as any) ?? null,
              closedDates: tenant.config.closedDates,
              timezone: tenant.config.timezone,
            }
          : undefined,
      });
      console.log('[consent-sms] calling-twilio');
      const messageSid = await sendSms(tenant.id, from, consentMsg);
      console.log('[consent-sms] twilio-accepted', JSON.stringify({ messageSid }));

      await prisma.smsConsentRequest.update({
        where: { id: consentRequestId },
        data: { consentMessageSid: messageSid },
      }).catch(() => {});
      await prisma.missedCall.update({
        where: { twilioCallSid: callSid },
        data: { smsSent: true },
      }).catch(() => {});
    } catch (err: any) {
      // Write error details to the DB so we can actually see them
      // (Vercel's log viewer hides console output).
      console.error('[consent-sms] FAILED', JSON.stringify({
        errCode: err?.code,
        errStatus: err?.status,
        errMoreInfo: err?.moreInfo,
        message: err?.message,
        name: err?.name,
      }));
      await logConsentEvent(tenant.id, from, 'sms_send_failed', {
        errorCode: err?.code ?? null,
        errorStatus: err?.status ?? null,
        errorMoreInfo: err?.moreInfo ?? null,
        errorMessage: err?.message ?? String(err),
        errorName: err?.name ?? null,
      }).catch(() => {});
    }
  })();

  // Keep the function alive past response return (Vercel)
  waitUntil(consentPromise);

  // Build TwiML response: short greeting + optional voicemail
  const twiml = buildVoiceTwiml({
    businessName,
    voiceGreeting: voiceGreetingText,
    voiceAudioUrl,
    voiceType: tenant.config?.voiceType ?? 'nova',
    recordingCallbackUrl: `${baseUrl}/api/webhooks/twilio/recording-callback`,
    transcribeCallbackUrl: `${baseUrl}/api/webhooks/twilio/transcription-callback`,
  });

  logger.info('Voice webhook responded with TwiML', { tenantId: tenant.id, callSid, tier });

  return new Response(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  });
}
