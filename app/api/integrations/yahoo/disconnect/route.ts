import { api, json, requireSameOrigin } from '../../../../../server/http';
import { getActor } from '../../../../../server/identity';
import { yahooOAuthRepository } from '../../../../../server/data';
import { disconnectYahoo } from '../../../../../server/yahoo-oauth';

export const dynamic = 'force-dynamic';

/** Delete the signed-in actor's stored Yahoo connection. */
export async function POST(request: Request) {
  return api(async () => {
    requireSameOrigin(request);
    const result = await disconnectYahoo({
      actor: await getActor(),
      repository: yahooOAuthRepository(),
    });
    return json(result);
  });
}
