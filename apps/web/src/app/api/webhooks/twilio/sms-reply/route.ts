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
  declineConsent,
  suppressCaller,
  isCallerSuppressed,
} from '@/lib/server/services/consentService';
import { checkEscalation } from '@/lib/server/services/escalationService';
import { waitUntil } from '@/lib/server/waitUntil';

// Give the handler 30s so background AI + SMS work can finish on Vercel
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const text = await request.text();
  const params = new URLSearchParams(text);
  const body: Record<string, string> = {};
  params.forEach((v, k) => { body[k] = v; });

  const parseResult = TwilioInboundSmsSchema.safeParse(body);
  if (!parseResult.success) return new Response('Invalid payload', { status: 400 });

  const { MessageSid, From, Body, To } = parseResult.data;

  // Pre-verify Twilio signature with master auth token BEFORE DB lookup.
  // Prevents unauthenticated actors from probing registered numbers.
  // Fail-closed: missing master token = misconfiguration, never skip the check.
  const masterToken = process.env.TWILIO_MASTER_AUTH_TOKEN?.trim();
  if (!masterToken) {
    logger.error('TWILIO_MASTER_AUTH_TOKEN not configured — refusing webhook');
    return new Response('Webhook not configured', { status: 500 });
  }
  const sig = request.headers.get('x-twilio-signature') ?? '';
  const webhookUrl = `${process.env.FRONTEND_URL ?? ''}/api/webhooks/twilio/sms-reply`;
  if (!twilio.validateRequest(masterToken, sig, webhookUrl, body)) {
    logger.warn('Invalid Twilio signature on SMS webhook (master pre-check)');
    return new Response('Invalid signature', { status: 403 });
  }

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

  // Re-verify with sub-account token if tenant has one. Fail-closed: if
  // the tenant is configured with a sub-account but the decrypted token
  // is unavailable, refuse rather than silently skipping the check.
  if (tenant.twilioSubAccountSid && tenant.twilioAuthToken) {
    const subToken = getValidationToken(tenant);
    if (!subToken) {
      logger.error('Sub-account Twilio token could not be resolved', { tenantId: tenant.id });
      return new Response('Tenant auth token misconfigured', { status: 500 });
    }
    if (!twilio.validateRequest(subToken, sig, webhookUrl, body)) {
      logger.warn('Invalid Twilio signature on SMS webhook (sub-account)', { tenantId: tenant.id });
      return new Response('Invalid signature', { status: 403 });
    }
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
    waitUntil(
      (async () => {
        try {
          // Close any pending consent request before suppressing
          const pending = await findPendingConsent(tenant.id, From);
          if (pending) {
            await declineConsent(pending.id, normalizedBody);
          } else {
            await suppressCaller(tenant.id, From, 'opt_out');
          }
          await sendSms(
            tenant.id,
            From,
            "Got it — we won't text you again. Call us anytime.",
          );
        } catch (err) {
          logger.error('Opt-out handling failed', { err, tenantId: tenant.id });
        }
      })()
    );
    return twimlResponse;
  }

  // 2. Check for pending consent request
  const pendingConsent = await findPendingConsent(tenant.id, From);
  if (pendingConsent) {
    if (isConsentAffirmative(normalizedBody)) {
      // Consent granted — approve, then send the follow-up opener
      waitUntil(
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
        })()
      );
    } else if (!pendingConsent.repromptSent) {
      // Ambiguous reply — re-prompt once
      waitUntil(
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
        })()
      );
    }
    // If reprompt already sent and still ambiguous → silently ignore
    return twimlResponse;
  }

  // 3. No pending consent → verify not suppressed → check escalation → route to AI
  const suppressed = await isCallerSuppressed(tenant.id, From);
  if (suppressed) {
    logger.info('Suppressed caller texted, ignoring', { tenantId: tenant.id });
    return twimlResponse;
  }

  waitUntil(
    (async () => {
      try {
        // Review capture runs BEFORE the AI so bare "5" replies don't
        // get parsed as part of an order flow.
        const { tryConsumeReviewReply } = await import('@/lib/server/services/reviewService');
        const consumed = await tryConsumeReviewReply(tenant.id, From, Body);
        if (consumed) return;

        // Day-before meeting confirmations. A bare "C" / "yes" reply
        // when the caller has a pending confirmation prompt becomes a
        // confirmation; "R" / "reschedule" sends a friendly ack and
        // clears the booking state so the next message starts fresh.
        const { tryConsumeMeetingConfirmReply } = await import(
          '@/lib/server/services/schedulingService'
        );
        const meetingConfirm = await tryConsumeMeetingConfirmReply(
          tenant.id,
          From,
          Body,
        );
        if (meetingConfirm.consumed) {
          if (meetingConfirm.rescheduled) {
            const { deleteCallerState } = await import(
              '@/lib/server/services/stateService'
            );
            await deleteCallerState(tenant.id, From).catch(() => {});
          }
          return;
        }

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
    })()
  );

  return twimlResponse;
}
