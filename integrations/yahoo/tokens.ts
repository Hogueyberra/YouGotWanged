/**
 * Yahoo token lifecycle: encrypted persistence, expiry skew, and refresh
 * with rotation.
 *
 * Tokens never leave this module unencrypted except as the return value of
 * getValidYahooAccessToken, which hands a live bearer token to the caller
 * for a single upstream request. Callers must not store or log it.
 */

import type { TradeRepository } from '../../server/repository.ts';
import { decryptToken, encryptToken } from './crypto.ts';
import {
  refreshYahooAccessToken,
  type TokenExchangeDeps,
  type YahooTokenResponse,
} from './tokenExchange.ts';
import { resolveYahooRefreshToken } from './oauth.ts';

/** Refresh while this much validity remains, so requests never race expiry. */
export const YAHOO_REFRESH_SKEW_MS = 5 * 60 * 1000;

export interface YahooTokenStoreDeps extends TokenExchangeDeps {
  repo: TradeRepository;
  key: CryptoKey;
  now: () => Date;
}

function expiryIso(now: Date, expiresInSeconds: number): string {
  return new Date(now.getTime() + expiresInSeconds * 1000).toISOString();
}

function msUntilExpiry(expiresAtIso: string, now: Date): number {
  return new Date(expiresAtIso).getTime() - now.getTime();
}

/**
 * Persists encrypted tokens for the actor, replacing any previous row.
 * refreshTokenFallback is the previously stored refresh token, used when
 * Yahoo did not rotate it on this exchange.
 */
export async function saveYahooTokens(
  deps: Pick<YahooTokenStoreDeps, 'repo' | 'key' | 'now'>,
  actorId: string,
  tokenResponse: YahooTokenResponse,
  refreshTokenFallback: string | null,
): Promise<void> {
  const refreshToken = resolveYahooRefreshToken({
    previousRefreshToken: refreshTokenFallback,
    responseRefreshToken: tokenResponse.refreshToken,
  });
  const now = deps.now();
  await deps.repo.saveYahooTokens(
    actorId,
    await encryptToken(deps.key, tokenResponse.accessToken),
    await encryptToken(deps.key, refreshToken),
    expiryIso(now, tokenResponse.expiresInSeconds),
    now.toISOString(),
  );
}

/** True when the actor has Yahoo tokens stored (says nothing about expiry). */
export async function hasYahooTokens(
  repo: TradeRepository,
  actorId: string,
): Promise<boolean> {
  return (await repo.getYahooTokens(actorId)) !== null;
}

/**
 * Returns a usable access token for the actor, refreshing once when the
 * stored token is expired or within the refresh skew. On refresh failure
 * the stored tokens are deleted and null is returned: the user must
 * reconnect. Never retries in a loop.
 */
export async function getValidYahooAccessToken(
  deps: YahooTokenStoreDeps,
  actorId: string,
): Promise<string | null> {
  const row = await deps.repo.getYahooTokens(actorId);
  if (!row) return null;
  const now = deps.now();
  if (msUntilExpiry(row.expiresAt, now) > YAHOO_REFRESH_SKEW_MS)
    return decryptToken(deps.key, row.accessTokenEnc);
  const previousRefreshToken = await decryptToken(deps.key, row.refreshTokenEnc);
  let refreshed: YahooTokenResponse;
  try {
    refreshed = await refreshYahooAccessToken(deps, previousRefreshToken);
  } catch {
    // Single attempt only: stale or revoked grants require reconnection.
    await deps.repo.deleteYahooTokens(actorId);
    return null;
  }
  await saveYahooTokens(deps, actorId, refreshed, previousRefreshToken);
  return refreshed.accessToken;
}
