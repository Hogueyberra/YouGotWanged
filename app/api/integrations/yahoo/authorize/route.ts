import {
  buildYahooAuthorizationUrl,
  createOAuthState,
  hashOAuthState,
} from '../../../../../integrations/yahoo/oauth';
import { getServerEnv } from '../../../../../integrations/yahoo/serverEnv';
import { readYahooOAuthConfig } from '../../../../../integrations/yahoo/tokenExchange';
import { repository } from '../../../../../server/data';
import { api } from '../../../../../server/http';
import { requireActor } from '../../../../../server/identity';

/** OAuth state is single-use and expires after 10 minutes. */
const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Starts the Yahoo OAuth2 authorization-code flow. The authenticated actor
 * is redirected to Yahoo; only the SHA-256 hash of the state is stored
 * server-side, bound to the actor.
 */
export async function GET() {
  return api(async () => {
    const actor = await requireActor();
    const config = readYahooOAuthConfig(getServerEnv());
    const state = createOAuthState();
    const now = new Date();
    await repository().createYahooOAuthState(
      actor.id,
      await hashOAuthState(state),
      new Date(now.getTime() + STATE_TTL_MS).toISOString(),
      now.toISOString(),
    );
    const authorizationUrl = buildYahooAuthorizationUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
      language: 'en-us',
    });
    return Response.redirect(authorizationUrl.toString(), 302);
  });
}
