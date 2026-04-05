import { encrypt, decrypt, encryptNullable, decryptNullable } from '../utils/encryption';

// Set test encryption key (32 bytes = 64 hex chars)
beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
});

describe('Encryption utilities', () => {
  it('encrypts and decrypts a string', () => {
    const plaintext = 'my-secret-token-12345';
    const encrypted = encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.split(':').length).toBe(3); // iv:tag:ciphertext format

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext on each encryption (random IV)', () => {
    const plaintext = 'same-text';
    const enc1 = encrypt(plaintext);
    const enc2 = encrypt(plaintext);

    expect(enc1).not.toBe(enc2);
    expect(decrypt(enc1)).toBe(plaintext);
    expect(decrypt(enc2)).toBe(plaintext);
  });

  it('throws on tampered ciphertext', () => {
    const encrypted = encrypt('secret');
    const parts = encrypted.split(':');
    parts[2] = Buffer.from('tampered').toString('base64');
    const tampered = parts.join(':');

    expect(() => decrypt(tampered)).toThrow();
  });

  it('encryptNullable returns null for null input', () => {
    expect(encryptNullable(null)).toBeNull();
    expect(encryptNullable(undefined)).toBeNull();
    expect(encryptNullable('')).toBeNull();
  });

  it('decryptNullable returns null for null input', () => {
    expect(decryptNullable(null)).toBeNull();
    expect(decryptNullable(undefined)).toBeNull();
    expect(decryptNullable('')).toBeNull();
  });

  it('encryptNullable and decryptNullable round-trip non-null values', () => {
    const value = 'twilio-auth-token-xyz';
    const encrypted = encryptNullable(value);
    expect(encrypted).not.toBeNull();
    const decrypted = decryptNullable(encrypted);
    expect(decrypted).toBe(value);
  });
});
