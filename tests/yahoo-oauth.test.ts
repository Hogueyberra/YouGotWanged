import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  base64ToBytes,
  bytesToBase64,
  decryptToken,
  encryptToken,
  importTokenKey,
} from '../integrations/yahoo/crypto.ts';
import {
  buildYahooAuthorizationUrl,
  createOAuthState,
  hashOAuthState,
  resolveYahooRefreshToken,
  verifyOAuthState,
} from '../integrations/yahoo/oauth.ts';
import {
  basicAuthHeader,
  exchangeAuthorizationCode,
  hasYahooOAuthConfig,
  readYahooOAuthConfig,
  refreshYahooAccessToken,
} from '../integrations/yahoo/tokenExchange.ts';
import {
  getValidYahooAccessToken,
  hasYahooTokens,
  saveYahooTokens,
} from '../integrations/yahoo/tokens.ts';
import {
  TradeRepository,
  type Database,
  type QueryResult,
  type Statement,
} from '../server/repository.ts';

const here = dirname(fileURLToPath(import.meta.url));
const drizzleDir = join(here, '..', 'drizzle');

class SQLiteStatement implements Statement {
  private readonly database: SQLiteDatabase;
  private readonly statement: StatementSync;
  private readonly values: (string | number | null)[];
  constructor(
    database: SQLiteDatabase,
    statement: StatementSync,
    values: (string | number | null)[] = [],
  ) {
    this.database = database;
    this.statement = statement;
    this.values = values;
  }
  bind(...values: (string | number | null)[]): Statement {
    return new SQLiteStatement(this.database, this.statement, values);
  }
  async all<T = Record<string, unknown>>(): Promise<QueryResult<T>> {
    const results = this.statement.all(...this.values) as T[];
    return { results, meta: { changes: this.database.changes() } };
  }
  execute<T = Record<string, unknown>>(): QueryResult<T> {
    const results = this.statement.all(...this.values) as T[];
    return { results, meta: { changes: this.database.changes() } };
  }
}

class SQLiteDatabase implements Database {
  private readonly database = new DatabaseSync(':memory:');
  constructor() {
    this.database.exec('PRAGMA foreign_keys = ON');
    for (const file of readdirSync(drizzleDir).sort()) {
      if (!file.endsWith('.sql')) continue;
      const sql = readFileSync(join(drizzleDir, file), 'utf8');
      for (const statement of sql.split('--> statement-breakpoint')) {
        if (statement.trim()) this.database.exec(statement);
      }
    }
  }
  changes(): number {
    const row = this.database
      .prepare('SELECT changes() AS count')
      .get() as { count: number };
    return row.count;
  }
  prepare(sql: string): Statement {
    return new SQLiteStatement(this, this.database.prepare(sql));
  }
  async batch<T = Record<string, unknown>>(
    statements: Statement[],
  ): Promise<QueryResult<T>[]> {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) =>
        (statement as SQLiteStatement).execute<T>(),
      );
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function makeRepo(): TradeRepository {
  return new TradeRepository(new SQLiteDatabase());
}

async function makeKey(): Promise<CryptoKey> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return importTokenKey(bytesToBase64(bytes));
}

const FIXED_NOW = new Date('2026-10-06T14:00:00.000Z');

void test('crypto: AES-GCM round-trips a token', async () => {
  const key = await makeKey();
  const ciphertext = await encryptToken(key, 'access-token-value');
  assert.equal(await decryptToken(key, ciphertext), 'access-token-value');
});

void test('crypto: same plaintext encrypts differently (random IV)', async () => {
  const key = await makeKey();
  const first = await encryptToken(key, 'same');
  const second = await encryptToken(key, 'same');
  assert.notEqual(first, second);
});

void test('crypto: rejects keys that are not 32 bytes', async () => {
  await assert.rejects(
    importTokenKey(bytesToBase64(new Uint8Array(16))),
    /32 bytes/,
  );
  await assert.rejects(importTokenKey('!!!not-base64!!!'), /base64/);
});

void test('crypto: tampered ciphertext fails closed', async () => {
  const key = await makeKey();
  const payload = await encryptToken(key, 'secret');
  const bytes = base64ToBytes(payload);
  bytes[bytes.length - 1] ^= 0xff;
  await assert.rejects(decryptToken(key, bytesToBase64(bytes)));
});

void test('oauth: state is 256-bit hex and verifies against its hash', async () => {
  const state = createOAuthState();
  assert.match(state, /^[0-9a-f]{64}$/);
  const hash = await hashOAuthState(state);
  assert.equal(await verifyOAuthState(state, hash), true);
  assert.equal(await verifyOAuthState(`${state.slice(0, 63)}0`, hash), false);
});

void test('oauth: refresh token rotation prefers the response token', () => {
  assert.equal(
    resolveYahooRefreshToken({
      previousRefreshToken: 'old',
      responseRefreshToken: 'new',
    }),
    'new',
  );
  assert.equal(
    resolveYahooRefreshToken({
      previousRefreshToken: 'old',
      responseRefreshToken: null,
    }),
    'old',
  );
  assert.throws(
    () =>
      resolveYahooRefreshToken({
        previousRefreshToken: null,
        responseRefreshToken: null,
      }),
    /refresh token/,
  );
});

void test('oauth: authorize URL carries the required parameters', () => {
  const url = buildYahooAuthorizationUrl({
    clientId: 'client-id',
    redirectUri: 'https://example.com/api/integrations/yahoo/callback',
    state: 'a'.repeat(64),
    language: 'en-us',
  });
  assert.equal(url.origin, 'https://api.login.yahoo.com');
  assert.equal(url.pathname, '/oauth2/request_auth');
  assert.equal(url.searchParams.get('client_id'), 'client-id');
  assert.equal(
    url.searchParams.get('redirect_uri'),
    'https://example.com/api/integrations/yahoo/callback',
  );
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), 'a'.repeat(64));
  assert.equal(url.searchParams.get('language'), 'en-us');
});

void test('config: reads and validates the four Yahoo env values', () => {
  const config = readYahooOAuthConfig({
    YAHOO_CLIENT_ID: 'id',
    YAHOO_CLIENT_SECRET: 'secret',
    YAHOO_REDIRECT_URI: 'https://example.com/callback',
  });
  assert.equal(config.clientId, 'id');
  assert.equal(hasYahooOAuthConfig({ YAHOO_CLIENT_ID: 'id' }), false);
  assert.throws(() => readYahooOAuthConfig({}), /YAHOO_CLIENT_ID/);
});

void test('exchange: posts code with Basic auth and parses the response', async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(
      JSON.stringify({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 3600,
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  const result = await exchangeAuthorizationCode(
    {
      fetchImpl,
      config: {
        clientId: 'cid',
        clientSecret: 'csecret',
        redirectUri: 'https://example.com/callback',
      },
    },
    'auth-code',
  );
  assert.equal(result.accessToken, 'access-1');
  assert.equal(result.refreshToken, 'refresh-1');
  assert.equal(result.expiresInSeconds, 3600);
  assert.equal(seen.length, 1);
  assert.equal(
    seen[0].url,
    'https://api.login.yahoo.com/oauth2/get_token',
  );
  assert.equal(seen[0].init.method, 'POST');
  const headers = seen[0].init.headers as Record<string, string>;
  assert.equal(headers['Authorization'], basicAuthHeader('cid', 'csecret'));
  assert.ok(headers['Authorization'].startsWith('Basic '));
  const body = new URLSearchParams(seen[0].init.body as string);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('code'), 'auth-code');
  assert.equal(body.get('redirect_uri'), 'https://example.com/callback');
});

void test('exchange: rejects non-OK responses and malformed bodies', async () => {
  const badFetch = (async () => new Response('nope', { status: 400 })) as unknown as typeof fetch;
  const deps = {
    fetchImpl: badFetch,
    config: {
      clientId: 'cid',
      clientSecret: 'csecret',
      redirectUri: 'https://example.com/callback',
    },
  };
  await assert.rejects(exchangeAuthorizationCode(deps, 'code'), /rejected/);

  const malformedFetch = (async () =>
    new Response(JSON.stringify({ access_token: '' }), {
      status: 200,
    })) as unknown as typeof fetch;
  await assert.rejects(
    exchangeAuthorizationCode({ ...deps, fetchImpl: malformedFetch }, 'code'),
    /access_token/,
  );
});

void test('refresh: posts grant_type=refresh_token', async () => {
  const seen: { init: RequestInit }[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    seen.push({ init });
    return new Response(
      JSON.stringify({
        access_token: 'access-2',
        refresh_token: 'refresh-2',
        expires_in: 3600,
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  const result = await refreshYahooAccessToken(
    {
      fetchImpl,
      config: {
        clientId: 'cid',
        clientSecret: 'csecret',
        redirectUri: 'https://example.com/callback',
      },
    },
    'refresh-1',
  );
  assert.equal(result.accessToken, 'access-2');
  const body = new URLSearchParams(seen[0].init.body as string);
  assert.equal(body.get('grant_type'), 'refresh_token');
  assert.equal(body.get('refresh_token'), 'refresh-1');
});

void test('repository: OAuth state is single-use, actor-bound, and expiring', async () => {
  const repo = makeRepo();
  const now = FIXED_NOW.toISOString();
  const future = new Date(FIXED_NOW.getTime() + 60_000).toISOString();
  const past = new Date(FIXED_NOW.getTime() - 60_000).toISOString();

  await repo.createYahooOAuthState('owner-1', 'hash-1', future, now);
  assert.equal(await repo.consumeYahooOAuthState('owner-1', 'hash-1', now), true);
  // Single-use: second consume fails.
  assert.equal(
    await repo.consumeYahooOAuthState('owner-1', 'hash-1', now),
    false,
  );

  await repo.createYahooOAuthState('owner-1', 'hash-2', future, now);
  assert.equal(
    await repo.consumeYahooOAuthState('owner-2', 'hash-2', now),
    false,
  );

  await repo.createYahooOAuthState('owner-1', 'hash-3', past, now);
  assert.equal(
    await repo.consumeYahooOAuthState('owner-1', 'hash-3', now),
    false,
  );
});

void test('repository: token rows round-trip per actor', async () => {
  const repo = makeRepo();
  assert.equal(await hasYahooTokens(repo, 'owner-1'), false);
  await repo.saveYahooTokens('owner-1', 'enc-a', 'enc-r', '2030-01-01T00:00:00.000Z', FIXED_NOW.toISOString());
  assert.equal(await hasYahooTokens(repo, 'owner-1'), true);
  const row = await repo.getYahooTokens('owner-1');
  assert.equal(row?.accessTokenEnc, 'enc-a');
  assert.equal(row?.refreshTokenEnc, 'enc-r');
  // Replace on conflict.
  await repo.saveYahooTokens('owner-1', 'enc-a2', 'enc-r2', '2030-01-02T00:00:00.000Z', FIXED_NOW.toISOString());
  assert.equal((await repo.getYahooTokens('owner-1'))?.accessTokenEnc, 'enc-a2');
  await repo.deleteYahooTokens('owner-1');
  assert.equal(await hasYahooTokens(repo, 'owner-1'), false);
});

void test('tokens: fresh access token is returned without refresh', async () => {
  const repo = makeRepo();
  const key = await makeKey();
  const deps = {
    repo,
    key,
    now: () => FIXED_NOW,
    fetchImpl: (async () => {
      throw new Error('must not refresh');
    }) as unknown as typeof fetch,
    config: {
      clientId: 'cid',
      clientSecret: 'csecret',
      redirectUri: 'https://example.com/callback',
    },
  };
  await saveYahooTokens(
    deps,
    'owner-1',
    { accessToken: 'live-access', refreshToken: 'live-refresh', expiresInSeconds: 3600 },
    null,
  );
  assert.equal(await getValidYahooAccessToken(deps, 'owner-1'), 'live-access');
});

void test('tokens: expired token refreshes once and rotates the refresh token', async () => {
  const repo = makeRepo();
  const key = await makeKey();
  const calls: string[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    calls.push(new URLSearchParams(init.body as string).get('grant_type') ?? '');
    return new Response(
      JSON.stringify({
        access_token: 'access-new',
        refresh_token: 'refresh-new',
        expires_in: 3600,
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  const deps = {
    repo,
    key,
    now: () => FIXED_NOW,
    fetchImpl,
    config: {
      clientId: 'cid',
      clientSecret: 'csecret',
      redirectUri: 'https://example.com/callback',
    },
  };
  // Store an already-expired token pair.
  await repo.saveYahooTokens(
    'owner-1',
    await encryptToken(key, 'access-old'),
    await encryptToken(key, 'refresh-old'),
    new Date(FIXED_NOW.getTime() - 1000).toISOString(),
    FIXED_NOW.toISOString(),
  );
  assert.equal(await getValidYahooAccessToken(deps, 'owner-1'), 'access-new');
  assert.deepEqual(calls, ['refresh_token']);
  const row = await repo.getYahooTokens('owner-1');
  assert.ok(row);
  assert.equal(await decryptToken(key, row.accessTokenEnc), 'access-new');
  assert.equal(await decryptToken(key, row.refreshTokenEnc), 'refresh-new');
});

void test('tokens: failed refresh deletes tokens and returns null', async () => {
  const repo = makeRepo();
  const key = await makeKey();
  const fetchImpl = (async () => new Response('denied', { status: 400 })) as unknown as typeof fetch;
  const deps = {
    repo,
    key,
    now: () => FIXED_NOW,
    fetchImpl,
    config: {
      clientId: 'cid',
      clientSecret: 'csecret',
      redirectUri: 'https://example.com/callback',
    },
  };
  await saveYahooTokens(
    deps,
    'owner-1',
    { accessToken: 'access-old', refreshToken: 'refresh-old', expiresInSeconds: 1 },
    null,
  );
  // Force expiry by rewinding the stored row.
  await repo.saveYahooTokens(
    'owner-1',
    await encryptToken(key, 'access-old'),
    await encryptToken(key, 'refresh-old'),
    new Date(FIXED_NOW.getTime() - 1000).toISOString(),
    FIXED_NOW.toISOString(),
  );
  assert.equal(await getValidYahooAccessToken(deps, 'owner-1'), null);
  assert.equal(await hasYahooTokens(repo, 'owner-1'), false);
});

void test('tokens: unknown actor has no access token', async () => {
  const repo = makeRepo();
  const key = await makeKey();
  const deps = {
    repo,
    key,
    now: () => FIXED_NOW,
    fetchImpl: (async () => {
      throw new Error('must not call network');
    }) as unknown as typeof fetch,
    config: {
      clientId: 'cid',
      clientSecret: 'csecret',
      redirectUri: 'https://example.com/callback',
    },
  };
  assert.equal(await getValidYahooAccessToken(deps, 'owner-2'), null);
});
