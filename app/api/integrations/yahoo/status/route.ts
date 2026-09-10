import { api, json } from '../../../../../server/http';
import { getActor } from '../../../../../server/identity';
import { yahooOAuthRepository } from '../../../../../server/data';
import { readYahooEnvironment } from '../../../../../server/yahoo-env';
import { readYahooStatus } from '../../../../../server/yahoo-oauth';

export const dynamic = 'force-dynamic';

/** Credential-redacted Yahoo readiness for the signed-in actor. */
export async function GET() {
  return api(async () => {
    const payload = await readYahooStatus({
      actor: await getActor(),
      repository: yahooOAuthRepository(),
      environment: readYahooEnvironment(),
    });
    return json(payload);
  });
}
