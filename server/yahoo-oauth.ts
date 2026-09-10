import {
  inspectYahooEnvironment,
  type YahooConfigurationInput,
} from '../integrations/providers/config.ts';
import type { ProviderConfigStatus } from '../integrations/providers/contracts.ts';
import {
  buildYahooAuthorizationUrl,
  createOAuthState,
  hashOAuthState,
  resolveYahooRefreshToken,
  verifyOAuthState,
  YAHOO_TOKEN_ENDPOINT,
} from '../integrations/yahoo/oauth.ts';
import { AppError } from './errors.ts';
import type { Actor } from './identity.ts';
import { decryptSecret, encryptSecret } from './token-crypto.ts';
import type { YahooOAuthRepository } from './yahoo-oauth-repository.ts';

export const YAHOO_LIVE_INGEST_ENABLED = false;

export interface YahooClientCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface YahooTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
}

function requireTextEnv(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new AppError(
      'YAHOO_CONFIG_MISSING',
      `Yahoo OAuth requires ${name}. Demo data remains the default.`,
      503,
    );
  }
  return value;
}

export function requireYahooClientCredentials(
  environment: Readonly<Record<string, string | undefined>>,
): YahooClientCredentials {
  return {
    clientId: requireTextEnv(environment, 'YAHOO_CLIENT_ID'),
    clientSecret: requireTextEnv(environment, 'YAHOO_CLIENT_SECRET'),
    redirectUri: requireTextEnv(environment, 'YAHOO_REDIRECT_URI'),
  };
}

export function envFlagEnabled(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
): boolean {
  const value = environment[name]?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export function requireAuthenticatedActor(actor: Actor | null): Actor {
  if (!actor) {
    throw new AppError(
      'UNAUTHENTICATED',
      'Sign in to open your private workspace.',
      401,
    );
  }
  return actor;
}

export async function beginYahooConnect(input: {
  actor: Actor | null;
  repository: YahooOAuthRepository;
  environment: Readonly<Record<string, string | undefined>>;
  now?: Date;
}): Promise<{ redirectUrl: string; state: string }> {
  const actor = requireAuthenticatedActor(input.actor);
  const credentials = requireYahooClientCredentials(input.environment);
  const state = createOAuthState();
  const stateHash = await hashOAuthState(state);
  await input.repository.createState({
    stateHash,
    actorId: actor.id,
    now: input.now,
  });
  const redirectUrl = buildYahooAuthorizationUrl({
    clientId: credentials.clientId,
    redirectUri: credentials.redirectUri,
    state,
  }).toString();
  return { redirectUrl, state };
}

function parseTokenResponse(payload: YahooTokenResponse): {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  expiresIn: number | null;
} {
  if (typeof payload.access_token !== 'string' || !payload.access_token.trim()) {
    throw new AppError(
      'YAHOO_TOKEN_INVALID',
      'Yahoo token response did not include an access token.',
      502,
    );
  }
  const refreshToken =
    typeof payload.refresh_token === 'string' && payload.refresh_token.trim()
      ? payload.refresh_token.trim()
      : null;
  const tokenType =
    typeof payload.token_type === 'string' && payload.token_type.trim()
      ? payload.token_type.trim()
      : 'Bearer';
  const expiresIn =
    typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : typeof payload.expires_in === 'string' &&
          Number.isFinite(Number(payload.expires_in))
        ? Number(payload.expires_in)
        : null;
  return {
    accessToken: payload.access_token.trim(),
    refreshToken,
    tokenType,
    expiresIn,
  };
}

export async function exchangeYahooAuthorizationCode(input: {
  code: string;
  credentials: YahooClientCredentials;
  fetchImpl?: typeof fetch;
}): Promise<YahooTokenResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code.trim(),
    redirect_uri: input.credentials.redirectUri,
  });
  const basic = btoa(
    `${input.credentials.clientId}:${input.credentials.clientSecret}`,
  );
  const response = await fetchImpl(YAHOO_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  if (!response.ok) {
    throw new AppError(
      'YAHOO_TOKEN_EXCHANGE_FAILED',
      'Yahoo could not exchange the authorization code.',
      502,
    );
  }
  return (await response.json()) as YahooTokenResponse;
}

/**
 * Completes the OAuth callback: verify state, exchange code, encrypt+store tokens.
 * Never returns token values to the caller.
 */
export async function completeYahooCallback(input: {
  actor: Actor | null;
  repository: YahooOAuthRepository;
  environment: Readonly<Record<string, string | undefined>>;
  code: string | null;
  state: string | null;
  now?: Date;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; liveIngestEnabled: false }> {
  const actor = requireAuthenticatedActor(input.actor);
  if (!input.code?.trim() || !input.state?.trim()) {
    throw new AppError(
      'OAUTH_CALLBACK_INVALID',
      'Yahoo callback is missing the authorization code or state.',
      400,
    );
  }

  const stateHash = await hashOAuthState(input.state);
  const stored = await input.repository.getState(stateHash);
  if (!stored || !(await verifyOAuthState(input.state, stored.stateHash))) {
    throw new AppError(
      'OAUTH_STATE_INVALID',
      'Yahoo authorization state is invalid or unknown.',
      400,
    );
  }
  await input.repository.consumeValidState({
    stateHash,
    actorId: actor.id,
    now: input.now,
  });

  const credentials = requireYahooClientCredentials(input.environment);
  const tokenPayload = await exchangeYahooAuthorizationCode({
    code: input.code,
    credentials,
    fetchImpl: input.fetchImpl,
  });
  const tokens = parseTokenResponse(tokenPayload);
  const previous = await input.repository.getConnection(actor.id);
  let previousRefresh: string | null = null;
  if (previous) {
    previousRefresh = await decryptSecret(
      previous.encryptedRefreshToken,
      input.environment,
    );
  }
  const refreshToken = resolveYahooRefreshToken({
    previousRefreshToken: previousRefresh,
    responseRefreshToken: tokens.refreshToken,
  });

  const encryptedAccessToken = await encryptSecret(
    tokens.accessToken,
    input.environment,
  );
  const encryptedRefreshToken = await encryptSecret(
    refreshToken,
    input.environment,
  );
  const now = input.now ?? new Date();
  const accessTokenExpiresAt =
    tokens.expiresIn === null
      ? null
      : new Date(now.getTime() + tokens.expiresIn * 1000).toISOString();

  await input.repository.upsertConnection({
    ownerId: actor.id,
    encryptedAccessToken,
    encryptedRefreshToken,
    tokenType: tokens.tokenType,
    accessTokenExpiresAt,
    now,
  });

  return { ok: true, liveIngestEnabled: YAHOO_LIVE_INGEST_ENABLED };
}

export async function readYahooStatus(input: {
  actor: Actor | null;
  repository: YahooOAuthRepository;
  environment: Readonly<Record<string, string | undefined>>;
}): Promise<{
  status: ProviderConfigStatus;
  hasStoredUserToken: boolean;
  applicationApproved: boolean;
  liveContractValidated: boolean;
  liveIngestEnabled: false;
  encryptionConfigured: boolean;
}> {
  const actor = requireAuthenticatedActor(input.actor);
  const hasStoredUserToken = await input.repository.hasConnection(actor.id);
  const applicationApproved = envFlagEnabled(
    input.environment,
    'YAHOO_APPLICATION_APPROVED',
  );
  const liveContractValidated = envFlagEnabled(
    input.environment,
    'YAHOO_LIVE_CONTRACT_VALIDATED',
  );
  const status = inspectYahooEnvironment(
    input.environment,
    hasStoredUserToken,
    applicationApproved,
    liveContractValidated,
  );
  return {
    status,
    hasStoredUserToken,
    applicationApproved,
    liveContractValidated,
    liveIngestEnabled: YAHOO_LIVE_INGEST_ENABLED,
    encryptionConfigured: Boolean(
      input.environment.YAHOO_TOKEN_ENCRYPTION_KEY?.trim(),
    ),
  };
}

export async function disconnectYahoo(input: {
  actor: Actor | null;
  repository: YahooOAuthRepository;
}): Promise<{ ok: true; deleted: boolean; liveIngestEnabled: false }> {
  const actor = requireAuthenticatedActor(input.actor);
  const deleted = await input.repository.deleteConnection(actor.id);
  return { ok: true, deleted, liveIngestEnabled: YAHOO_LIVE_INGEST_ENABLED };
}

/** Exported for tests that assert readiness input shaping. */
export function yahooStatusConfigurationInput(
  environment: Readonly<Record<string, string | undefined>>,
  hasStoredUserToken: boolean,
): YahooConfigurationInput {
  return {
    clientId: environment.YAHOO_CLIENT_ID,
    clientSecret: environment.YAHOO_CLIENT_SECRET,
    redirectUri: environment.YAHOO_REDIRECT_URI,
    applicationApproved: envFlagEnabled(
      environment,
      'YAHOO_APPLICATION_APPROVED',
    ),
    hasStoredUserToken,
    liveContractValidated: envFlagEnabled(
      environment,
      'YAHOO_LIVE_CONTRACT_VALIDATED',
    ),
  };
}
