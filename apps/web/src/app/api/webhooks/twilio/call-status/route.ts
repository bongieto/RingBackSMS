import { NextRequest } from 'next/server';
import twilio from 'twilio';
import { prisma } from '@/lib/server/db';
import { sendSms, getValidationToken } from '@/lib/server/services/twilioService';
import { logger } from '@/lib/server/logger';
import { TwilioCallStatusSchema } from '@ringback/shared-types';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/server/rateLimit';
import { buildGreetingVars, renderGreetingTemplate } from '@/lib/server/businessHours';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await checkRateLimit(`twilio-status:${ip}`, 120, 60);
  if (!rl.allowed) return rateLimitResponse(rl);

  // Parse URL-encoded Twilio body
  const text = await request.text();
  const params = new URLSearchParams(text);
  const body: Record<string, string> = {};
  params.forEach((v, k) => { body[k] = v; });

  const parseResult = TwilioCallStatusSchema.safeParse(body);
  if (!parseResult.success) return new Response('Invalid payload', { status: 400 });

  const { CallSid, From, To, CallStatus } = parseResult.data;

  // Resolve tenant by To number
  const tenant = await prisma.tenant.findUnique({
    where: { twilioPhoneNumber: To },
    include: { config: true },
  });

  if (!tenant || !tenant.isActive) return new Response('OK', { status: 200 });

  // Verify Twilio signature — fail-closed if token is missing
  const authToken = getValidationToken(tenant);
  if (!authToken) {
    logger.warn('No Twilio auth token for signature verification', { tenantId: tenant.id });
    return new Response('Auth token not configured', { status: 500 });
  }
  const sig = request.headers.get('x-twilio-signature') ?? '';
  const url = `${process.env.FRONTEND_URL ?? ''}/api/webhooks/twilio/call-status`;
  const isValid = twilio.validateRequest(authToken, sig, url, body);
  if (!isValid) {
    logger.warn('Invalid Twilio signature', { tenantId: tenant.id });
    return new Response('Invalid signature', { status: 403 });
  }

  // The voice webhook now handles missed call creation and SMS sending.
  // This status callback serves as a fallback — if the voice webhook didn't
  // fire (e.g., call went straight to no-answer before Twilio hit voiceUrl),
  // we still create the record and send the SMS.
  if (!['no-answer', 'busy', 'failed', 'canceled', 'completed'].includes(CallStatus)) {
    return new Response('OK', { status: 200 });
  }

  if (!tenant.config) return new Response('OK', { status: 200 });

  try {
    // Check if voice webhook already handled this call
    const existing = await prisma.missedCall.findUnique({
      where: { twilioCallSid: CallSid },
    });

    if (existing) {
      // Already handled by voice webhook — nothing to do
      logger.debug('Call already tracked by voice webhook', { callSid: CallSid });
      return new Response('OK', { status: 200 });
    }

    // Fallback: voice webhook didn't fire, handle here (idempotent upsert)
    const missedCall = await prisma.missedCall.upsert({
      where: { twilioCallSid: CallSid },
      create: { tenantId: tenant.id, callerPhone: From, twilioCallSid: CallSid, occurredAt: new Date(), smsSent: false },
      update: {},
    });
    if (!missedCall.smsSent) {
      // Render any {business_name} / {next_open} / {today_hours} /
      // {closes_at} placeholders before sending — same template system
      // used by the voice greeting.
      const rendered = renderGreetingTemplate(
        tenant.config.greeting,
        buildGreetingVars(tenant.name, {
          businessHoursStart: tenant.config.businessHoursStart,
          businessHoursEnd: tenant.config.businessHoursEnd,
          businessDays: tenant.config.businessDays,
          businessSchedule: (tenant.config.businessSchedule as any) ?? null,
          closedDates: tenant.config.closedDates,
          timezone: tenant.config.timezone,
        }),
      );
      await sendSms(tenant.id, From, rendered);
      await prisma.missedCall.update({ where: { id: missedCall.id }, data: { smsSent: true } });
    }
    logger.info('Missed call handled via status callback fallback', { tenantId: tenant.id, callSid: CallSid });
  } catch (err) {
    logger.error('call-status webhook error', { err, tenantId: tenant.id });
  }

  return new Response('OK', { status: 200 });
}
