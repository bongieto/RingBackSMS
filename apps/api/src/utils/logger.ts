import winston from 'winston';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

/**
 * Masks a phone number, keeping only the last 4 digits visible.
 * e.g. +12175551234 → +1217***1234
 */
function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****';
  return phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4);
}

/**
 * Recursively mask phone numbers in log metadata objects.
 */
function maskPhones(obj: unknown): unknown {
  if (typeof obj === 'string') {
    // E.164 phone pattern
    return obj.replace(/\+?[1-9]\d{9,14}/g, (match) => maskPhone(match));
  }
  if (Array.isArray(obj)) {
    return obj.map(maskPhones);
  }
  if (obj !== null && typeof obj === 'object') {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      masked[key] = maskPhones(value);
    }
    return masked;
  }
  return obj;
}

const phoneRedactFormat = winston.format((info) => {
  const { message, ...rest } = info;
  return {
    ...info,
    message: typeof message === 'string' ? maskPhones(message) : message,
    ...(maskPhones(rest) as Record<string, unknown>),
  };
});

const transports: winston.transport[] = [
  new winston.transports.Console({
    format:
      process.env.NODE_ENV === 'production'
        ? combine(timestamp(), errors({ stack: true }), phoneRedactFormat(), json())
        : combine(colorize(), simple()),
  }),
];

// Add Axiom transport in production if configured
if (process.env.NODE_ENV === 'production' && process.env.AXIOM_TOKEN && process.env.AXIOM_DATASET) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { WinstonTransport: AxiomTransport } = require('@axiomhq/winston');
    transports.push(
      new AxiomTransport({
        dataset: process.env.AXIOM_DATASET,
        token: process.env.AXIOM_TOKEN,
      })
    );
  } catch {
    // Axiom transport not available — continue with console only
  }
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: combine(timestamp(), errors({ stack: true }), phoneRedactFormat(), json()),
  transports,
  exitOnError: false,
});
