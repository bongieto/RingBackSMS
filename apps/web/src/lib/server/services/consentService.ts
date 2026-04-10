import { prisma } from '../db';
import { logger } from '../logger';

const CONSENT_TEMPLATE =
  "Hey! {business_name} here — we just missed your call and we're sorry about that! I can help you via text if you want. Reply YES to go ahead or STOP to opt out. Msg & data rates may apply.";

const CONSENT_WORDS = new Set([
  'YES', 'Y', 'SURE', 'OK', 'OKAY', 'YEP', 'YEAH', 'YUP',
  'YES PLEASE', 'PLEASE', 'HELP', 'GO AHEAD',
]);

const STOP_WORDS = new Set([
  'STOP', 'CANCEL', 'UNSUBSCRIBE', 'QUIT', 'END',
  'NO', 'NOPE', 'NOT NOW', 'DONT TEXT ME',
  "DON'T TEXT ME", 'LEAVE ME ALONE',
]);

// ── Public API ─────────────────────────────────────────────────────────────

export function buildConsentMessage(tenantName: string): string {
  return CONSENT_TEMPLATE.replace('{business_name}', tenantName);
}

export function isConsentAffirmative(body: string): boolean {
  const normalized = body.trim().toUpperCase();
  return CONSENT_WORDS.has(normalized);
}

export function isOptOutKeyword(body: string): boolean {
  const normalized = body.trim().toUpperCase();
  return STOP_WORDS.has(normalized);
}

export async function isCallerSuppressed(
  tenantId: string,
  callerPhone: string,
): Promise<boolean> {
  const row = await prisma.smsSuppression.findUnique({
    where: { tenantId_callerPhone: { tenantId, callerPhone } },
    select: { id: true },
  });
  return Boolean(row);
}

export async function createConsentRequest(
  tenantId: string,
  callerPhone: string,
  twilioNumber: string,
  consentMessageSid?: string,
): Promise<string> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const row = await prisma.smsConsentRequest.create({
    data: {
      tenantId,
      callerPhone,
      twilioNumber,
      consentMessageSid: consentMessageSid ?? null,
      expiresAt,
      status: 'PENDING',
    },
  });
  await logConsentEvent(tenantId, callerPhone, 'consent_requested', {
    consentMessageSid,
    twilioNumber,
  });
  return row.id;
}

export async function findPendingConsent(
  tenantId: string,
  callerPhone: string,
) {
  return prisma.smsConsentRequest.findFirst({
    where: {
      tenantId,
      callerPhone,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function approveConsent(
  requestId: string,
  replyBody: string,
): Promise<void> {
  const req = await prisma.smsConsentRequest.update({
    where: { id: requestId },
    data: {
      status: 'CONSENTED',
      consentedAt: new Date(),
      replyBody,
    },
    select: { tenantId: true, callerPhone: true },
  });
  await logConsentEvent(req.tenantId, req.callerPhone, 'consented', {
    replyBody,
  });
}

export async function declineConsent(
  requestId: string,
  replyBody: string,
): Promise<void> {
  const req = await prisma.smsConsentRequest.update({
    where: { id: requestId },
    data: {
      status: 'DECLINED',
      declinedAt: new Date(),
      replyBody,
    },
    select: { tenantId: true, callerPhone: true },
  });
  await suppressCaller(req.tenantId, req.callerPhone, 'opt_out');
  await logConsentEvent(req.tenantId, req.callerPhone, 'declined', {
    replyBody,
  });
}

export async function suppressCaller(
  tenantId: string,
  callerPhone: string,
  reason: string = 'opt_out',
): Promise<void> {
  await prisma.smsSuppression.upsert({
    where: { tenantId_callerPhone: { tenantId, callerPhone } },
    create: { tenantId, callerPhone, reason },
    update: { reason },
  });
  // Mark contact as suppressed
  await prisma.contact.updateMany({
    where: { tenantId, phone: callerPhone },
    data: { suppressed: true },
  });
  await logConsentEvent(tenantId, callerPhone, 'suppressed', { reason });
  logger.info('Caller suppressed', { tenantId, reason });
}

export async function logConsentEvent(
  tenantId: string,
  callerPhone: string,
  eventType: string,
  eventData?: Record<string, unknown>,
): Promise<void> {
  await prisma.consentAuditLog.create({
    data: {
      tenantId,
      callerPhone,
      eventType,
      eventData: eventData ? JSON.parse(JSON.stringify(eventData)) : undefined,
    },
  });
}
