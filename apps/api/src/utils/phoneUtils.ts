/**
 * Normalises a phone number to E.164 format (+1XXXXXXXXXX for US numbers).
 * Returns null if the number cannot be normalised.
 */
export function toE164(phone: string, defaultCountry = '1'): string | null {
  // Strip all non-digit characters except leading +
  const stripped = phone.replace(/[^\d+]/g, '');

  if (stripped.startsWith('+')) {
    // Already has country code
    const digits = stripped.slice(1);
    if (digits.length >= 10 && digits.length <= 15) {
      return `+${digits}`;
    }
    return null;
  }

  const digits = stripped.replace(/\D/g, '');

  // US/Canada: 10 digits → +1XXXXXXXXXX
  if (digits.length === 10) {
    return `+${defaultCountry}${digits}`;
  }

  // Already has country code (11 digits starting with 1 for NANP)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

/**
 * Masks a phone number for logging/display.
 * +12175551234 → +1217***1234
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length <= 4) return '****';
  const visible = phone.slice(-4);
  const prefix = phone.slice(0, Math.max(0, phone.length - 7));
  return `${prefix}***${visible}`;
}

/**
 * Checks if a string looks like a valid E.164 phone number.
 */
export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{9,14}$/.test(phone);
}

/**
 * Extracts the national number from E.164 (strips country code).
 * Assumes US/Canada for +1 numbers.
 */
export function getNationalNumber(e164: string): string {
  if (e164.startsWith('+1') && e164.length === 12) {
    return e164.slice(2);
  }
  return e164.startsWith('+') ? e164.slice(1) : e164;
}
