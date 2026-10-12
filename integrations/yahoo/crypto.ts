/**
 * AES-GCM token encryption for Yahoo OAuth tokens.
 *
 * Tokens are encrypted at rest in D1 with a 256-bit data key supplied via the
 * YAHOO_TOKEN_KEY environment variable (base64-encoded). All helpers use Web
 * Crypto so they run unchanged in Cloudflare Workers and Node.
 */

const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  let output = '';
  for (let i = 0; i < binary.length; i += 3) {
    const a = binary.charCodeAt(i);
    const b = i + 1 < binary.length ? binary.charCodeAt(i + 1) : 0;
    const c = i + 2 < binary.length ? binary.charCodeAt(i + 2) : 0;
    const triple = (a << 16) | (b << 8) | c;
    output +=
      BASE64_ALPHABET[(triple >> 18) & 63] +
      BASE64_ALPHABET[(triple >> 12) & 63] +
      (i + 1 < binary.length ? BASE64_ALPHABET[(triple >> 6) & 63] : '=') +
      (i + 2 < binary.length ? BASE64_ALPHABET[triple & 63] : '=');
  }
  return output;
}

export function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const cleaned = value.replace(/\s/g, '');
  if (cleaned.length === 0 || cleaned.length % 4 !== 0)
    throw new TypeError('Value is not valid base64.');
  const lookup = new Map<string, number>();
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1)
    lookup.set(BASE64_ALPHABET[i], i);
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array(new ArrayBuffer((cleaned.length / 4) * 3 - padding));
  let offset = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const sextets: number[] = [];
    for (let j = 0; j < 4; j += 1) {
      const char = cleaned[i + j];
      if (char === '=') {
        sextets.push(0);
        continue;
      }
      const sextet = lookup.get(char);
      if (sextet === undefined)
        throw new TypeError('Value is not valid base64.');
      sextets.push(sextet);
    }
    const triple =
      (sextets[0] << 18) | (sextets[1] << 12) | (sextets[2] << 6) | sextets[3];
    bytes[offset] = (triple >> 16) & 255;
    if (offset + 1 < bytes.length) bytes[offset + 1] = (triple >> 8) & 255;
    if (offset + 2 < bytes.length) bytes[offset + 2] = triple & 255;
    offset += 3;
  }
  return bytes;
}

/** Imports the 256-bit data key from its base64 env representation. */
export async function importTokenKey(base64Key: string): Promise<CryptoKey> {
  const keyBytes = base64ToBytes(base64Key.trim());
  if (keyBytes.length !== KEY_LENGTH_BYTES)
    throw new TypeError(
      'YAHOO_TOKEN_KEY must base64-decode to exactly 32 bytes.',
    );
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Encrypts a token. Returns base64(iv || ciphertext) with a fresh random IV
 * per call, so equal plaintexts never produce equal stored values.
 */
export async function encryptToken(
  key: CryptoKey,
  plaintext: string,
): Promise<string> {
  const iv = new Uint8Array(new ArrayBuffer(IV_LENGTH_BYTES));
  crypto.getRandomValues(iv);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return bytesToBase64(combined);
}

/** Decrypts a value produced by encryptToken. Throws on tampering. */
export async function decryptToken(
  key: CryptoKey,
  payload: string,
): Promise<string> {
  const combined = base64ToBytes(payload);
  if (combined.length <= IV_LENGTH_BYTES)
    throw new TypeError('Encrypted token payload is too short.');
  const iv = new Uint8Array(IV_LENGTH_BYTES);
  iv.set(combined.subarray(0, IV_LENGTH_BYTES));
  const ciphertext = new Uint8Array(combined.length - IV_LENGTH_BYTES);
  ciphertext.set(combined.subarray(IV_LENGTH_BYTES));
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}
