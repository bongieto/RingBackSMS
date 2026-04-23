import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Typed error for decryption failures. Gives callers a way to
 * distinguish "this ciphertext is malformed" from "the key rotated and
 * left us unable to read old rows" from "the tag doesn't authenticate"
 * — three very different operational situations that used to surface
 * as the same generic Error. Downstream handlers can log the `reason`
 * and decide whether to fail open, fail closed, or alert.
 *
 * Values for `reason`:
 *   - 'empty'        — input was null / empty / whitespace
 *   - 'malformed'    — not the iv:tag:ciphertext base64 shape
 *   - 'auth_failed'  — ciphertext parsed but GCM authentication failed
 *                       (wrong key, corruption, or tampering)
 *   - 'unknown'      — crypto threw something we didn't classify
 */
export type DecryptionFailureReason =
  | 'empty'
  | 'malformed'
  | 'auth_failed'
  | 'unknown';

export class DecryptionError extends Error {
  public readonly reason: DecryptionFailureReason;
  constructor(reason: DecryptionFailureReason, message?: string) {
    super(message ?? `Decryption failed: ${reason}`);
    this.name = 'DecryptionError';
    this.reason = reason;
  }
}

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is not set');
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== 32) throw new Error('ENCRYPTION_KEY must be a 32-byte (64-char hex) value');
  return buf;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string in the format: iv:tag:ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * Decrypts a base64-encoded string previously produced by encrypt().
 * Throws DecryptionError with a classified `reason` on failure so
 * callers can distinguish operational cases (malformed input, wrong
 * key, tampering).
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) throw new DecryptionError('empty');
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');
  if (parts.length !== 3) throw new DecryptionError('malformed', 'expected iv:tag:ciphertext');

  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const ciphertext = Buffer.from(parts[2], 'base64');

  // Reject obvious shape mismatches before we hand bad buffers to
  // OpenSSL. A 0-length IV or wrong tag length would throw a less
  // informative error from createDecipheriv.
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new DecryptionError('malformed', `iv=${iv.length}B tag=${tag.length}B`);
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext) + decipher.final('utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // GCM auth failure surfaces as "Unsupported state or unable to
    // authenticate data" on Node. Treat any throw from
    // createDecipheriv/setAuthTag/final as an auth failure — if it
    // were a shape issue, we'd have caught it above.
    throw new DecryptionError('auth_failed', msg);
  }
}

/**
 * Non-throwing variant. Returns a result object so call sites on the
 * hot path (Twilio webhook signature re-verification, POS token
 * resolution) can log the specific reason without wrapping a try/catch
 * around every call. Callers that WANT to throw — which is most of
 * them, since a bad token is a real 500 — should keep using `decrypt`.
 */
export type DecryptResult =
  | { ok: true; value: string }
  | { ok: false; reason: DecryptionFailureReason; message: string };

export function safeDecrypt(encryptedData: string | null | undefined): DecryptResult {
  if (encryptedData == null || encryptedData === '') {
    return { ok: false, reason: 'empty', message: 'input was null/empty' };
  }
  try {
    return { ok: true, value: decrypt(encryptedData) };
  } catch (err) {
    if (err instanceof DecryptionError) {
      return { ok: false, reason: err.reason, message: err.message };
    }
    return { ok: false, reason: 'unknown', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Encrypts a value if it exists, returns null otherwise.
 */
export function encryptNullable(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  return encrypt(value);
}

/**
 * Decrypts a value if it exists, returns null otherwise.
 */
export function decryptNullable(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  return decrypt(value);
}

/**
 * Decrypts a value that MAY be legacy plaintext. Used for progressive
 * encryption rollout on fields like Contact.name / Contact.email where
 * existing rows are plaintext and new writes are encrypted.
 *
 * Returns the plaintext if decryption succeeds, otherwise returns the
 * stored value as-is (assumed legacy plaintext).
 */
export function decryptMaybePlaintext(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  // Quick format check: our encrypted format is `iv:tag:ciphertext` (base64)
  // If it doesn't have exactly 2 colons, treat as plaintext.
  if (typeof value !== 'string' || value.split(':').length !== 3) return value;
  try {
    return decrypt(value);
  } catch {
    return value; // legacy plaintext or corrupted; prefer showing original
  }
}

/**
 * Cheap format check: does this string look like our AES-256-GCM output
 * (`iv:tag:ciphertext` base64)? Used as a defensive guard before we
 * splice a name/email into customer-facing copy — a plaintext name will
 * never match this pattern, so false positives are negligible.
 */
export function looksEncrypted(value: string | null | undefined): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  return /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(value);
}

/**
 * Deterministic HMAC-SHA256 of a normalized value, used to make encrypted
 * columns searchable at the SQL level (exact match only). Not reversible.
 *
 * `tenantId` is mixed into the HMAC input so the same PII value (e.g.
 * "john@example.com") hashes differently across tenants. Without this,
 * a DB exfiltration would let an attacker correlate the same person
 * across multiple tenants via equal hashes.
 *
 * Uses CONTACT_SEARCH_HMAC_KEY if set; otherwise derives a stable key from
 * ENCRYPTION_KEY so dev environments keep working without extra config.
 */
export function hashForSearch(
  value: string | null | undefined,
  tenantId: string,
): string | null {
  if (value == null) return null;
  if (!tenantId) throw new Error('hashForSearch requires a tenantId');
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '') return null;
  const keyMaterial = process.env.CONTACT_SEARCH_HMAC_KEY || process.env.ENCRYPTION_KEY;
  if (!keyMaterial) {
    throw new Error(
      'CONTACT_SEARCH_HMAC_KEY or ENCRYPTION_KEY must be set for search hashing',
    );
  }
  // Scope input as `${tenantId}:${value}`. Two tenants with the same PII
  // produce distinct hashes and the stored table can't be correlated.
  return createHmac('sha256', keyMaterial)
    .update(`${tenantId}:${normalized}`)
    .digest('hex');
}

/**
 * Encrypts a conversation messages array for storage in the Json column.
 * Returns an encrypted string that will be stored in the Json field.
 */
export function encryptMessages(messages: unknown[]): string {
  return encrypt(JSON.stringify(messages));
}

/**
 * Decrypts conversation messages from storage.
 * Backward compatible: if stored value is already an array (old unencrypted data),
 * returns it as-is. If it's an encrypted string, decrypts and parses it.
 */
export function decryptMessages(stored: unknown): unknown[] {
  if (stored == null) return [];
  if (Array.isArray(stored)) return stored; // backward compat: old unencrypted data
  if (typeof stored === 'string' && stored.length > 0) {
    try {
      return JSON.parse(decrypt(stored));
    } catch {
      return [];
    }
  }
  return [];
}
