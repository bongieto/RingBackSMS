import { createLogger, format, transports } from 'winston';

// ── PII auto-redaction ──────────────────────────────────────────────────────
//
// Log lines go to Axiom, stdout, and (in test / dev) shell buffers.
// Any of those can leak. The redactor scrubs three classes of PII at
// serialization time, keyed on the field name the caller used, so the
// typical pattern `logger.info('...', { callerPhone, customerName })`
// just works without a review step per log line.
//
// 1. Phone fields — masked to ***last-4.
// 2. Email fields — masked to first char + *** + @domain.
// 3. Name fields — masked to first letter + ***.
// 4. Free-text fields (message bodies, SMS replies) — length-capped AND
//    scanned for embedded phone / email patterns so an inbound SMS
//    that happens to contain "call me at 555-1234" doesn't slip the
//    number through the field-name-only redactor.
//
// The redactor also recurses into arrays (the first version missed
// these — so an `items` array logged during order processing leaked
// customer names via items[*].customerName).

const PII_PHONE_FIELDS = new Set([
  'callerphone', 'from', 'phone', 'ownerphone', 'to',
  'businessphone', 'customerphone', 'recipient',
]);

const PII_EMAIL_FIELDS = new Set([
  'owneremail', 'email', 'customeremail', 'recipientemail',
]);

const PII_NAME_FIELDS = new Set([
  'customername', 'contactname', 'fullname', 'firstname', 'lastname',
  'name', 'ownername', 'callername', 'recipientname',
]);

// Field names whose values are free-form text that may embed PII. Capped
// to SCRUB_TEXT_MAX chars (preserving start, for debugging) and scanned
// for phone/email patterns within.
const PII_FREE_TEXT_FIELDS = new Set([
  'body', 'message', 'content', 'inboundmessage', 'smsreply',
  'transcript', 'voicemailtranscript', 'voicemailsummary', 'notes',
  'description', 'comment',
]);

const SCRUB_TEXT_MAX = 120;

// Fields whose value is commonly a legitimate ID (orderId, tenantId,
// messageSid) — never name-mask even though the field contains "name"-
// like substrings. Explicit allowlist wins over the fuzzy name check.
const ID_FIELDS = new Set([
  'tenantid', 'orderid', 'conversationid', 'callerid', 'messagesid',
  'accountsid', 'subaccountsid', 'sessionid', 'paymentid', 'refundid',
  'subscriptionid', 'customerid', 'id', 'externalid', 'turnid',
  'clerkuserid', 'clerkorgid', 'stripecustomerid', 'stripesubscriptionid',
]);

function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****';
  return phone.slice(0, Math.max(0, phone.length - 7)) + '***' + phone.slice(-4);
}

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return email[0] + '***' + email.slice(at);
}

function maskName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return '';
  if (trimmed.length === 1) return '*';
  return trimmed[0] + '***';
}

/** Cap a free-form string and scrub any phone/email patterns it contains. */
function scrubFreeText(text: string): string {
  const capped = text.length > SCRUB_TEXT_MAX
    ? text.slice(0, SCRUB_TEXT_MAX) + '…'
    : text;
  return capped
    // E.164-ish phone numbers
    .replace(/\+?\d[\d\s\-().]{8,}\d/g, (match) => {
      const digits = match.replace(/\D/g, '');
      return digits.length >= 10 ? maskPhone(digits) : match;
    })
    // Obvious email addresses
    .replace(
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
      (match) => maskEmail(match),
    );
}

function redactValue(value: unknown, keyLower: string): unknown {
  if (typeof value === 'string') {
    if (ID_FIELDS.has(keyLower)) return value;
    if (PII_PHONE_FIELDS.has(keyLower)) return maskPhone(value);
    if (PII_EMAIL_FIELDS.has(keyLower)) return maskEmail(value);
    if (PII_NAME_FIELDS.has(keyLower)) return maskName(value);
    if (PII_FREE_TEXT_FIELDS.has(keyLower)) return scrubFreeText(value);
    return value;
  }
  if (Array.isArray(value)) {
    // Recurse — each element inherits the containing field's name so
    // `items: [{customerName}]` still masks customerName inside.
    return value.map((v) => (typeof v === 'object' && v !== null
      ? redactPii(v as Record<string, unknown>)
      : redactValue(v, keyLower)));
  }
  if (value && typeof value === 'object') {
    return redactPii(value as Record<string, unknown>);
  }
  return value;
}

function redactPii(info: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(info)) {
    const lower = key.toLowerCase();
    result[key] = redactValue(value, lower);
  }
  return result;
}

const piiRedactFormat = format((info) => {
  const redacted = redactPii(info as unknown as Record<string, unknown>);
  Object.assign(info, redacted);
  return info;
});

// Exported only for testing. Consumers should use `logger`.
export const __redactPiiForTesting = redactPii;

// ── Logger ──────────────────────────────────────────────────────────────────

export const logger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    piiRedactFormat(),
    format.json()
  ),
  transports: [new transports.Console()],
});
