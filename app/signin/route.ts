import { buildAuthCookieHeader, passwordMatches } from '../../server/passwordAuth';
import { chatGPTSignInPath } from '../chatgpt-auth';

const PLATFORM_USER_HEADER = 'oai-authenticated-user-id';

function safeReturnTo(url: URL): string {
  const rt = url.searchParams.get('return_to') ?? '/';
  if (!rt.startsWith('/') || rt.startsWith('//')) return '/';
  return rt;
}

function signInHtml(returnTo: string, failed: boolean): string {
  const error = failed
    ? '<p style="color:#ff8a8a;margin:0 0 12px">Wrong password — try again.</p>'
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sign in — YouGotWanged</title>
<style>
  body{background:#0b1020;color:#e8ecf8;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{background:#141b33;border:1px solid #2a3560;border-radius:16px;padding:32px;width:min(360px,90vw);box-shadow:0 12px 40px rgba(0,0,0,.45)}
  h1{font-size:22px;margin:0 0 6px}
  p.sub{color:#9aa6c7;font-size:14px;margin:0 0 20px}
  input{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #2a3560;background:#0b1020;color:#fff;font-size:16px;margin-bottom:14px}
  button{width:100%;padding:12px;border-radius:10px;border:0;background:#4f7cff;color:#fff;font-size:16px;font-weight:600;cursor:pointer}
</style>
</head>
<body>
  <form class="card" method="post">
    <h1>YouGotWanged</h1>
    <p class="sub">Your private front office. Enter the password to continue.</p>
    ${error}
    <input type="password" name="password" placeholder="Password" autocomplete="current-password" autofocus />
    <input type="hidden" name="return_to" value="${returnTo.replace(/"/g, '&quot;')}" />
    <button type="submit">Sign in</button>
  </form>
</body>
</html>`;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // On the Sites platform, delegate to its native sign-in flow.
  if (request.headers.get(PLATFORM_USER_HEADER)) {
    const { redirect } = await import('next/navigation');
    redirect(chatGPTSignInPath(safeReturnTo(url)));
  }
  return new Response(signInHtml(safeReturnTo(url), false), {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData();
  const returnToEntry = form.get('return_to');
  const rawReturnTo =
    typeof returnToEntry === 'string' ? returnToEntry : '/';
  const returnTo =
    rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
      ? rawReturnTo
      : '/';
  const passwordEntry = form.get('password');
  const attempt = typeof passwordEntry === 'string' ? passwordEntry : '';
  if (!passwordMatches(attempt)) {
    return new Response(signInHtml(returnTo, true), {
      status: 401,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: returnTo,
      'Set-Cookie': await buildAuthCookieHeader(),
    },
  });
}
