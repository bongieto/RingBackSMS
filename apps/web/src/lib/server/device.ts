import { createHash, randomBytes, randomInt } from 'crypto';

/**
 * Pairing code: 6-digit numeric string shown in the dashboard, entered on
 * the mobile device. Short-lived (10-minute TTL) and single-use.
 * Uses crypto.randomInt so we get a uniform distribution across 000000–999999.
 */
export function generatePairingCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Device bearer token. 32 random bytes as base64url → 43 chars, URL-safe. */
export function generateDeviceToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hash stored in DB so a read-only DB leak doesn't expose live tokens. */
export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 10 minutes. The dashboard tells users the code expires in "about 10 min." */
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
