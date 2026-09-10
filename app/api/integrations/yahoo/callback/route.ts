import { api, json } from '../../../../../server/http';
import { getActor } from '../../../../../server/identity';
import { yahooOAuthRepository } from '../../../../../server/data';
import { readYahooEnvironment } from '../../../../../server/yahoo-env';
import { completeYahooCallback } from '../../../../../server/yahoo-oauth';

export const dynamic = 'force-dynamic';

/**
 * Yahoo OAuth callback. Validates state, exchanges code, stores encrypted tokens.
 * Never returns tokens to the browser. Live ingest remains gated off.
 */
export async function GET(request: Request) {
  return api(async () => {
    const url = new URL(request.url);
    const result = await completeYahooCallback({
      actor: await getActor(),
      repository: yahooOAuthRepository(),
      environment: readYahooEnvironment(),
      code: url.searchParams.get('code'),
      state: url.searchParams.get('state'),
    });
    return json({
      ok: result.ok,
      liveIngestEnabled: result.liveIngestEnabled,
      message:
        'Yahoo connection stored server-side. Live Fantasy ingest remains gated until approval and contract validation.',
    });
  });
}
