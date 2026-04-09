import { createLogger, format, transports } from 'winston';

// ── PII auto-redaction ──────────────────────────────────────────────────────

const PII_PHONE_FIELDS = new Set([
  'callerphone', 'from', 'phone', 'ownerphone', 'to',
  'businessphone', 'callerPhone', 'ownerPhone',
]);

const PII_EMAIL_FIELDS = new Set([
  'owneremail', 'email', 'ownerEmail',
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

function redactPii(info: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(info)) {
    if (typeof value === 'string') {
      const lower = key.toLowerCase();
      if (PII_PHONE_FIELDS.has(lower) || PII_PHONE_FIELDS.has(key)) {
        result[key] = maskPhone(value);
        continue;
      }
      if (PII_EMAIL_FIELDS.has(lower) || PII_EMAIL_FIELDS.has(key)) {
        result[key] = maskEmail(value);
        continue;
      }
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactPii(value as Record<string, unknown>);
      continue;
    }
    result[key] = value;
  }
  return result;
}

const piiRedactFormat = format((info) => {
  const redacted = redactPii(info as unknown as Record<string, unknown>);
  Object.assign(info, redacted);
  return info;
});

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
