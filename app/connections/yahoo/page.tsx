import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getActor } from '../../../server/identity';
import { repository } from '../../../server/data';
import { hasYahooTokens } from '@/integrations/yahoo/tokens';
import { passwordSignInPath } from '../../chatgpt-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import '../../office.css';

export const dynamic = 'force-dynamic';

const ERROR_COPY: Record<string, string> = {
  signin: 'Sign in to your workspace first, then connect Yahoo.',
  denied: 'The Yahoo connection was not approved. You can try again any time.',
  invalid_request: 'Yahoo did not return a usable response. Please try again.',
  invalid_state:
    'The connection request expired or was already used. Please start over.',
  not_configured:
    'Yahoo connection is not configured on this deployment yet. The owner needs to install the Yahoo credentials.',
  exchange_failed:
    'Yahoo rejected the connection. Please try again, or reconnect later.',
  save_failed: 'The connection could not be saved. Please try again.',
};

export default async function YahooConnectionStatus({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const actor = await getActor();
  if (!actor) redirect(passwordSignInPath('/connections/yahoo'));
  const params = await searchParams;
  const connected = await hasYahooTokens(repository(), actor.id);
  const showConnected = connected && !params.error;
  const errorCopy = params.error
    ? (ERROR_COPY[params.error] ?? ERROR_COPY['invalid_request'])
    : null;

  return (
    <main
      className="ffo-view-stack"
      style={{ maxWidth: 640, margin: '48px auto', padding: '0 24px' }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Yahoo connection</CardTitle>
        </CardHeader>
        <CardContent>
          {showConnected ? (
            <output>
              <p>
                <strong>Connected.</strong> Your Yahoo account is linked to this
                workspace.
              </p>
              <p>
                Live Yahoo reads stay disabled until the provider contract is
                validated. The workspace continues to show labeled demo data;
                nothing is sent to Yahoo.
              </p>
            </output>
          ) : (
            <div role="alert">
              <p>
                <strong>Not connected.</strong>{' '}
                {errorCopy ?? 'No Yahoo account is linked yet.'}
              </p>
            </div>
          )}
          {!showConnected && !errorCopy && (
            <p style={{ marginTop: 16 }}>
              <Link
                href="/api/integrations/yahoo/authorize"
                style={{
                  display: 'inline-block',
                  padding: '10px 22px',
                  borderRadius: 10,
                  background: '#4f7cff',
                  color: '#fff',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Connect Yahoo
              </Link>
            </p>
          )}
          <p>
            <Link href="/">Back to workspace</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
