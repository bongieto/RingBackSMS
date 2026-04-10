import { NextRequest } from 'next/server';
import twilio from 'twilio';
import { prisma } from '@/lib/server/db';
import { processInboundSms } from '@/lib/server/services/flowEngineService';
import { sendSms } from '@/lib/server/services/twilioService';
import { logger } from '@/lib/server/logger';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { getValidationToken } from '@/lib/server/services/twilioService';
import { TwilioInboundSmsSchema } from '@ringback/shared-types';
import {
  isOptOutKeyword,
  isConsentAffirmative,
  findPendingConsent,
  approveConsent,
  suppressCaller,
} from '@/lib/server/services/consentService';
import { checkEscalation } from '@/lib/server/services/escalationService';

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
    select: {
      id: true,
      isActive: true,
      twilioSubAccountSid: true,
      twilioAuthToken: true,
      name: true,
      config: {
        select: { followupOpener: true },
      },
    },
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

  // ── TCPA Consent Gate ─────────────────────────────────────────────────────
  // Intercept before the AI flow engine. Three checks in order:
  // 1. STOP keywords → suppress immediately (always honored)
  // 2. Pending consent request → check for YES/ambiguous
  // 3. No pending consent → route to AI as normal

  const normalizedBody = Body.trim();

  // 1. STOP keywords — always honored, regardless of consent state
  if (isOptOutKeyword(normalizedBody)) {
    (async () => {
      try {
        await suppressCaller(tenant.id, From, 'opt_out');
        await sendSms(
          tenant.id,
          From,
          "Got it — we won't text you again. Call us anytime.",
        );
      } catch (err) {
        logger.error('Opt-out handling failed', { err, tenantId: tenant.id });
      }
    })();
    return twimlResponse;
  }

  // 2. Check for pending consent request
  const pendingConsent = await findPendingConsent(tenant.id, From);
  if (pendingConsent) {
    if (isConsentAffirmative(normalizedBody)) {
      // Consent granted — approve, then send the follow-up opener
      (async () => {
        try {
          await approveConsent(pendingConsent.id, normalizedBody);
          // Send the industry-specific follow-up opener (or a default)
          const opener =
            tenant.config?.followupOpener ??
            `Thanks! How can ${tenant.name} help you today?`;
          await sendSms(tenant.id, From, opener);
        } catch (err) {
          logger.error('Consent approval failed', { err, tenantId: tenant.id });
        }
      })();
    } else if (!pendingConsent.repromptSent) {
      // Ambiguous reply — re-prompt once
      (async () => {
        try {
          await prisma.smsConsentRequest.update({
            where: { id: pendingConsent.id },
            data: { repromptSent: true },
          });
          await sendSms(
            tenant.id,
            From,
            'Just reply YES to get help by text, or STOP to opt out.',
          );
        } catch (err) {
          logger.error('Re-prompt failed', { err, tenantId: tenant.id });
        }
      })();
    }
    // If reprompt already sent and still ambiguous → silently ignore
    return twimlResponse;
  }

  // 3. No pending consent → check escalation keywords → then route to AI
  (async () => {
    try {
      // Check escalation keywords before AI processes the message.
      // If triggered, the escalation service sends a holding message
      // and notifies the tenant — we skip the AI flow entirely.
      const escalated = await checkEscalation(tenant.id, From, Body);
      if (escalated) return;

      // Route to AI flow engine
      await processInboundSms({
        tenantId: tenant.id,
        callerPhone: From,
        inboundMessage: Body,
        messageSid: MessageSid,
      });
    } catch (err) {
      logger.error('Async SMS processing error', { err, tenantId: tenant.id, messageSid: MessageSid });
    }
  })();

  return twimlResponse;
}
