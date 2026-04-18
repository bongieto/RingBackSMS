import { prisma } from '../db';
import { logger } from '../logger';

const CONSENT_TEMPLATE =
  "Hey! {business_name} here — we just missed your call and we're sorry about that! I can help you via text if you want. Reply YES to go ahead or STOP to opt out. Msg & data rates may apply.";

const CONSENT_WORDS = new Set([
  'YES', 'Y', 'SURE', 'OK', 'OKAY', 'YEP', 'YEAH', 'YUP',
  'YES PLEASE', 'PLEASE', 'HELP', 'GO AHEAD',
]);

/**
 * STRICT opt-out keywords — treated as "unsubscribe forever" in all contexts
 * (including mid-conversation). This list matches the US wireless-carrier
 * universal opt-out set. Twilio's Advanced Opt-Out intercepts all of these
 * at the network level before they reach our webhook, so this is a belt-and-
 * suspenders safety net for non-US / edge cases.
 *
 * NOTE: We deliberately exclude `NO`, `NOPE`, `NOT NOW`, etc. — those are
 * ambiguous mid-conversation (e.g. "NO don't confirm that order") and
 * historically caused accidental opt-outs. They're still honored as a
 * consent decline when the customer has a PENDING consent request (see
 * DECLINE_WORDS below).
 */
const STRICT_OPT_OUT_WORDS = new Set([
  'STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END',
  'DONT TEXT ME', "DON'T TEXT ME", 'LEAVE ME ALONE',
]);

/**
 * Words that signal "I don't want to opt in" — only applied when the
 * caller has a PENDING consent request. A standalone "NO" in a later
 * conversation means something else (usually "no, I don't want that item").
 */
const DECLINE_WORDS = new Set([
  ...STRICT_OPT_OUT_WORDS,
  'NO', 'NOPE', 'NAH', 'NOT NOW',
]);

// ── Public API ─────────────────────────────────────────────────────────────

export function buildConsentMessage(tenantName: string): string {
  return CONSENT_TEMPLATE.replace('{business_name}', tenantName);
}

export function isConsentAffirmative(body: string): boolean {
  const normalized = body.trim().toUpperCase();
  return CONSENT_WORDS.has(normalized);
}

/**
 * Strict opt-out check — always honored regardless of conversation context.
 * Use this to decide whether to add the caller to the suppression list.
 */
export function isOptOutKeyword(body: string): boolean {
  const normalized = body.trim().toUpperCase();
  return STRICT_OPT_OUT_WORDS.has(normalized);
}

/**
 * Consent-decline check — only call this when the caller has a PENDING
 * consent request. Matches a broader set of "no" responses.
 */
export function isConsentDecline(body: string): boolean {
  const normalized = body.trim().toUpperCase();
  return DECLINE_WORDS.has(normalized);
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

/**
 * Creates a consent request, or returns the existing PENDING request if one
 * already exists (dedup for rapid redial / concurrent calls). Returns
 * `{ id, alreadyPending }` so the caller knows whether to skip sending SMS.
 */
export async function createConsentRequest(
  tenantId: string,
  callerPhone: string,
  twilioNumber: string,
  consentMessageSid?: string,
): Promise<{ id: string; alreadyPending: boolean }> {
  // Check for existing pending consent first (dedup rapid redial)
  const existing = await prisma.smsConsentRequest.findFirst({
    where: { tenantId, callerPhone, status: 'PENDING', expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (existing) return { id: existing.id, alreadyPending: true };

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
  return { id: row.id, alreadyPending: false };
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
  // Close all pending consent rows for this caller
  await prisma.smsConsentRequest.updateMany({
    where: { tenantId, callerPhone, status: 'PENDING' },
    data: { status: 'DECLINED', declinedAt: new Date() },
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
