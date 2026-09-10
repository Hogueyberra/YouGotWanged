import { AppError } from './errors.ts';

const KEY_ENV = 'YAHOO_TOKEN_ENCRYPTION_KEY';
const VERSION_PREFIX = 'v1';

function requireEncryptionKeyMaterial(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  const value = environment[KEY_ENV]?.trim();
  if (!value) {
    throw new AppError(
      'ENCRYPTION_KEY_MISSING',
      'Yahoo token encryption is unavailable because the server secret is not configured.',
      503,
    );
  }
  return value;
}

function decodeKeyBytes(material: string): Uint8Array {
  if (/^[0-9a-fA-F]{64}$/.test(material)) {
    const bytes = new Uint8Array(32);
    for (let index = 0; index < 32; index += 1) {
      bytes[index] = Number.parseInt(material.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
  }

  try {
    const binary = atob(material);
    if (binary.length !== 32) {
      throw new TypeError('key length');
    }
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    throw new AppError(
      'ENCRYPTION_KEY_INVALID',
      'Yahoo token encryption key must be 32 bytes as hex (64 chars) or base64.',
      503,
    );
  }
}

async function importKey(
  environment: Readonly<Record<string, string | undefined>>,
): Promise<CryptoKey> {
  const keyBytes = decodeKeyBytes(requireEncryptionKeyMaterial(environment));
  const keyBuffer = keyBytes.buffer.slice(
    keyBytes.byteOffset,
    keyBytes.byteOffset + keyBytes.byteLength,
  ) as ArrayBuffer;
  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Encrypt a Yahoo token for durable storage. Fails closed without a valid key. */
export async function encryptSecret(
  plaintext: string,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<string> {
  const trimmed = plaintext.trim();
  if (!trimmed) {
    throw new AppError('INVALID_TOKEN', 'A non-empty token is required.', 400);
  }
  const key = await importKey(environment);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(trimmed),
    ),
  );
  return `${VERSION_PREFIX}.${toBase64(iv)}.${toBase64(ciphertext)}`;
}

/** Decrypt a stored Yahoo token. Fails closed without a valid key. */
export async function decryptSecret(
  payload: string,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<string> {
  const parts = payload.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION_PREFIX) {
    throw new AppError(
      'INVALID_CIPHERTEXT',
      'Stored Yahoo token payload is unreadable.',
      500,
    );
  }
  const key = await importKey(environment);
  try {
    const ivBytes = fromBase64(parts[1]!);
    const ciphertextBytes = fromBase64(parts[2]!);
    const iv = ivBytes.buffer.slice(
      ivBytes.byteOffset,
      ivBytes.byteOffset + ivBytes.byteLength,
    ) as ArrayBuffer;
    const ciphertext = ciphertextBytes.buffer.slice(
      ciphertextBytes.byteOffset,
      ciphertextBytes.byteOffset + ciphertextBytes.byteLength,
    ) as ArrayBuffer;
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new AppError(
      'DECRYPTION_FAILED',
      'Stored Yahoo token could not be decrypted.',
      500,
    );
  }
}

export function hasTokenEncryptionKey(
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  return Boolean(environment[KEY_ENV]?.trim());
}
