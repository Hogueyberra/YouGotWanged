/**
 * Yahoo OAuth2 confidential-client token exchange.
 *
 * Pure helpers around https://api.login.yahoo.com/oauth2/get_token. The
 * caller injects fetch so these functions stay testable without network
 * access. Client secrets are never logged or returned; they only leave in
 * the Authorization header of the token request.
 */

export const YAHOO_TOKEN_ENDPOINT =
  'https://api.login.yahoo.com/oauth2/get_token';

export interface YahooOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface YahooTokenResponse {
  accessToken: string;
  /** Null when Yahoo did not rotate the refresh token. */
  refreshToken: string | null;
  expiresInSeconds: number;
}

export interface TokenExchangeDeps {
  fetchImpl: typeof fetch;
  config: YahooOAuthConfig;
}

function requiredEnv(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) throw new TypeError(`${name} is not configured.`);
  return value;
}

/**
 * Reads the Yahoo OAuth configuration from the server environment.
 * Throws when any value is missing; callers map that to a 503.
 */
export function readYahooOAuthConfig(
  env: Record<string, string | undefined>,
): YahooOAuthConfig {
  return {
    clientId: requiredEnv(env, 'YAHOO_CLIENT_ID'),
    clientSecret: requiredEnv(env, 'YAHOO_CLIENT_SECRET'),
    redirectUri: requiredEnv(env, 'YAHOO_REDIRECT_URI'),
  };
}

/** True when all Yahoo OAuth env values are present (values never exposed). */
export function hasYahooOAuthConfig(
  env: Record<string, string | undefined>,
): boolean {
  return Boolean(
    env['YAHOO_CLIENT_ID']?.trim() &&
      env['YAHOO_CLIENT_SECRET']?.trim() &&
      env['YAHOO_REDIRECT_URI']?.trim(),
  );
}

/** Yahoo confidential-client authentication: Basic base64(client_id:secret). */
export function basicAuthHeader(clientId: string, clientSecret: string): string {
  const credentials = `${clientId}:${clientSecret}`;
  const bytes = new TextEncoder().encode(credentials);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // btoa is available in Workers and Node; the input is ASCII-safe here.
  return `Basic ${btoa(binary)}`;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new TypeError(`Yahoo token response has an invalid ${label}.`);
  return value;
}

function positiveNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    throw new TypeError(`Yahoo token response has an invalid ${label}.`);
  return value;
}

function parseTokenResponse(body: unknown): YahooTokenResponse {
  if (typeof body !== 'object' || body === null)
    throw new TypeError('Yahoo token response was not a JSON object.');
  const record = body as Record<string, unknown>;
  const refreshToken =
    record['refresh_token'] === undefined || record['refresh_token'] === null
      ? null
      : nonEmptyString(record['refresh_token'], 'refresh_token');
  return {
    accessToken: nonEmptyString(record['access_token'], 'access_token'),
    refreshToken,
    expiresInSeconds: positiveNumber(record['expires_in'], 'expires_in'),
  };
}

async function postToken(
  deps: TokenExchangeDeps,
  params: Record<string, string>,
): Promise<YahooTokenResponse> {
  const body = new URLSearchParams(params);
  let response: Response;
  try {
    response = await deps.fetchImpl(YAHOO_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuthHeader(
          deps.config.clientId,
          deps.config.clientSecret,
        ),
      },
      body: body.toString(),
    });
  } catch (error) {
    throw new TypeError(
      `Yahoo token request failed: ${error instanceof Error ? error.message : 'network error'}`,
    );
  }
  if (!response.ok)
    throw new TypeError(
      `Yahoo token request was rejected (HTTP ${response.status}).`,
    );
  return parseTokenResponse(await response.json());
}

/** Exchanges an authorization code for access + refresh tokens. */
export async function exchangeAuthorizationCode(
  deps: TokenExchangeDeps,
  code: string,
): Promise<YahooTokenResponse> {
  const trimmed = code.trim();
  if (!trimmed) throw new TypeError('Authorization code is required.');
  return postToken(deps, {
    grant_type: 'authorization_code',
    code: trimmed,
    redirect_uri: deps.config.redirectUri,
  });
}

/** Refreshes an access token. Yahoo may rotate the refresh token. */
export async function refreshYahooAccessToken(
  deps: TokenExchangeDeps,
  refreshToken: string,
): Promise<YahooTokenResponse> {
  const trimmed = refreshToken.trim();
  if (!trimmed) throw new TypeError('Refresh token is required.');
  return postToken(deps, {
    grant_type: 'refresh_token',
    refresh_token: trimmed,
  });
}
