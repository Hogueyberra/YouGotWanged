import { api } from '../../../../../server/http';
import { getActor } from '../../../../../server/identity';
import { yahooOAuthRepository } from '../../../../../server/data';
import { readYahooEnvironment } from '../../../../../server/yahoo-env';
import { beginYahooConnect } from '../../../../../server/yahoo-oauth';

export const dynamic = 'force-dynamic';

/** Start Yahoo OAuth. Redirects to Yahoo; never returns secrets. */
export async function GET() {
  return api(async () => {
    const { redirectUrl } = await beginYahooConnect({
      actor: await getActor(),
      repository: yahooOAuthRepository(),
      environment: readYahooEnvironment(),
    });
    return Response.redirect(redirectUrl, 302);
  });
}
