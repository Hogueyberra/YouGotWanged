import { api, json } from '../../../server/http';
import { requireActor } from '../../../server/identity';
import { repository } from '../../../server/data';
import { overview } from '../../../server/service';
import { getServerEnv } from '../../../integrations/yahoo/serverEnv';
import { hasYahooOAuthConfig } from '../../../integrations/yahoo/tokenExchange';
export const dynamic = 'force-dynamic';
export async function GET() {
  return api(async () =>
    json(
      await overview(repository(), await requireActor(), {
        yahooConnectEnabled: hasYahooOAuthConfig(getServerEnv()),
      }),
    ),
  );
}
