import { redirect } from 'next/navigation';
import { FrontOffice } from '../components/ffo/front-office';
import { getActor } from '../server/identity';
import { repository } from '../server/data';
import { overview } from '../server/service';
import { getServerEnv } from '../integrations/yahoo/serverEnv';
import { hasYahooOAuthConfig } from '../integrations/yahoo/tokenExchange';
import { passwordSignInPath } from './chatgpt-auth';
import './office.css';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const actor = await getActor();
  if (!actor) redirect(passwordSignInPath('/'));
  const initial = await overview(repository(), actor, {
    yahooConnectEnabled: hasYahooOAuthConfig(getServerEnv()),
  });
  return <FrontOffice initial={initial} />;
}
