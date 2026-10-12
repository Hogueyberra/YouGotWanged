import { cookies } from 'next/headers';
import { getServerEnv } from '../integrations/yahoo/serverEnv';
import type { Actor } from './identity';

/**
 * Password gate for Cloudflare Workers deployments.
 *
 * The app was built for the Sites platform, which injects `oai-*` identity
 * headers. On Workers those headers never exist, so this module provides a
 * simple shared-password fallback: after a correct password entry on
 * `/signin`, the browser holds an HttpOnly cookie whose value is an
 * HMAC of the password. Stateless — nothing to store server-side.
 */

const COOKIE_NAME = 'ygw_auth';
const HMAC_LABEL = 'yougotwanged-auth-v1';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function appPassword(): string | undefined {
  return getServerEnv().APP_PASSWORD;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function expectedCookieValue(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(HMAC_LABEL),
  );
  return toHex(sig);
}

/** Constant-time string comparison (fixed-length hex safe). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function passwordMatches(attempt: string): boolean {
  const password = appPassword();
  if (!password || !attempt) return false;
  return timingSafeEqual(attempt, password);
}

export async function buildAuthCookieHeader(): Promise<string> {
  const password = appPassword();
  if (!password) throw new Error('APP_PASSWORD is not configured');
  const value = await expectedCookieValue(password);
  return (
    `${COOKIE_NAME}=${value}; HttpOnly; Secure; ` +
    `SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`
  );
}

/** Fixed single-user actor for password-gate sessions. */
export async function getPasswordActor(): Promise<Actor | null> {
  const password = appPassword();
  if (!password) return null;
  const presented = (await cookies()).get(COOKIE_NAME)?.value;
  if (!presented) return null;
  const expected = await expectedCookieValue(password);
  if (!timingSafeEqual(presented, expected)) return null;
  return { id: 'nick', displayName: 'Nick' };
}
