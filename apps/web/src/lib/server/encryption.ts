import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

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
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted data format');

  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const ciphertext = Buffer.from(parts[2], 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext) + decipher.final('utf8');
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
