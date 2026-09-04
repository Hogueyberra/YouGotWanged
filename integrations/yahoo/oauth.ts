export const YAHOO_AUTHORIZATION_ENDPOINT =
  'https://api.login.yahoo.com/oauth2/request_auth';
export const YAHOO_TOKEN_ENDPOINT =
  'https://api.login.yahoo.com/oauth2/get_token';

export interface YahooAuthorizationUrlInput {
  clientId: string;
  redirectUri: string;
  state: string;
  language?: string;
}

export interface YahooTokenRotationInput {
  previousRefreshToken?: string | null;
  responseRefreshToken?: string | null;
}

function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new TypeError(`${label} is required.`);
  return trimmed;
}

function requireRedirectUri(value: string): string {
  const normalized = requireText(value, 'redirectUri');
  const url = new URL(normalized);
  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    )
  ) {
    throw new TypeError(
      'redirectUri must use HTTPS outside local development.',
    );
  }
  return url.toString();
}

export function buildYahooAuthorizationUrl(
  input: YahooAuthorizationUrlInput,
): URL {
  const url = new URL(YAHOO_AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', requireText(input.clientId, 'clientId'));
  url.searchParams.set('redirect_uri', requireRedirectUri(input.redirectUri));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', requireText(input.state, 'state'));
  if (input.language?.trim()) {
    url.searchParams.set('language', input.language.trim());
  }
  return url;
}

export function createOAuthState(byteLength = 32): string {
  if (!Number.isInteger(byteLength) || byteLength < 16 || byteLength > 64) {
    throw new TypeError('OAuth state byteLength must be between 16 and 64.');
  }
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export async function hashOAuthState(state: string): Promise<string> {
  const bytes = new TextEncoder().encode(requireText(state, 'state'));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const maximum = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maximum; index += 1) {
    difference |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function verifyOAuthState(
  candidate: string,
  expectedHash: string,
): Promise<boolean> {
  if (!candidate.trim() || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  return constantTimeTextEqual(
    await hashOAuthState(candidate),
    expectedHash.toLowerCase(),
  );
}

/** Yahoo may rotate refresh tokens; a newly returned token replaces the old one. */
export function resolveYahooRefreshToken(
  input: YahooTokenRotationInput,
): string {
  const returned = input.responseRefreshToken?.trim();
  if (returned) return returned;
  const previous = input.previousRefreshToken?.trim();
  if (previous) return previous;
  throw new TypeError('Yahoo token response did not provide a refresh token.');
}
