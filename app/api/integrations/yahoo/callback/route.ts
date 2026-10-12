import { hashOAuthState } from '../../../../../integrations/yahoo/oauth';
import { importTokenKey } from '../../../../../integrations/yahoo/crypto';
import { getServerEnv } from '../../../../../integrations/yahoo/serverEnv';
import {
  exchangeAuthorizationCode,
  readYahooOAuthConfig,
} from '../../../../../integrations/yahoo/tokenExchange';
import { saveYahooTokens } from '../../../../../integrations/yahoo/tokens';
import { repository } from '../../../../../server/data';
import { requireActor } from '../../../../../server/identity';

/**
 * Completes the Yahoo OAuth2 authorization-code flow.
 *
 * The state is validated strictly and consumed single-use before the code
 * is exchanged. Tokens are encrypted with YAHOO_TOKEN_KEY and stored in
 * D1. The browser is always redirected to the connection status page;
 * token values never appear in URLs, logs, or responses.
 */
export async function GET(request: Request) {
  const statusUrl = (query: string) =>
    Response.redirect(
      new URL(`/connections/yahoo${query}`, request.url).toString(),
      302,
    );

  let actor: { id: string; displayName: string };
  try {
    actor = await requireActor();
  } catch {
    return statusUrl('?error=signin');
  }

  const params = new URL(request.url).searchParams;
  if (params.get('error')) return statusUrl('?error=denied');
  const code = params.get('code')?.trim();
  const state = params.get('state')?.trim();
  if (!code || !state) return statusUrl('?error=invalid_request');

  const serverEnv = getServerEnv();
  let config;
  try {
    config = readYahooOAuthConfig(serverEnv);
  } catch {
    return statusUrl('?error=not_configured');
  }

  const repo = repository();
  const stateOk = await repo.consumeYahooOAuthState(
    actor.id,
    await hashOAuthState(state),
    new Date().toISOString(),
  );
  if (!stateOk) return statusUrl('?error=invalid_state');

  let tokenResponse;
  try {
    tokenResponse = await exchangeAuthorizationCode(
      { fetchImpl: fetch, config },
      code,
    );
  } catch {
    return statusUrl('?error=exchange_failed');
  }

  const tokenKey = serverEnv['YAHOO_TOKEN_KEY']?.trim();
  if (!tokenKey) return statusUrl('?error=not_configured');
  try {
    await saveYahooTokens(
      { repo, key: await importTokenKey(tokenKey), now: () => new Date() },
      actor.id,
      tokenResponse,
      null,
    );
  } catch {
    return statusUrl('?error=save_failed');
  }

  return statusUrl('?connected=1');
}
