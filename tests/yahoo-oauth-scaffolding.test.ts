import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import test from 'node:test';

import { inspectYahooConfiguration } from '../integrations/providers/config.ts';
import {
  createOAuthState,
  hashOAuthState,
  resolveYahooRefreshToken,
} from '../integrations/yahoo/oauth.ts';
import { AppError } from '../server/errors.ts';
import type {
  Database,
  QueryResult,
  Statement,
} from '../server/repository.ts';
import {
  decryptSecret,
  encryptSecret,
  hasTokenEncryptionKey,
} from '../server/token-crypto.ts';
import {
  beginYahooConnect,
  completeYahooCallback,
  disconnectYahoo,
  readYahooStatus,
  requireAuthenticatedActor,
} from '../server/yahoo-oauth.ts';
import { YahooOAuthRepository } from '../server/yahoo-oauth-repository.ts';

const MIGRATION_0 = readFileSync(
  new URL('../drizzle/0000_stormy_valkyrie.sql', import.meta.url),
  'utf8',
);
const MIGRATION_1 = readFileSync(
  new URL('../drizzle/0001_yahoo_oauth_scaffolding.sql', import.meta.url),
  'utf8',
);

const ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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
    return this.execute<T>();
  }

  execute<T = Record<string, unknown>>(): QueryResult<T> {
    const results = this.statement.all(...this.values) as T[];
    const changes = this.database.changes();
    return { results, meta: { changes } };
  }
}

class SQLiteDatabase implements Database {
  private readonly database = new DatabaseSync(':memory:');

  constructor() {
    this.database.exec('PRAGMA foreign_keys = ON');
    for (const migration of [MIGRATION_0, MIGRATION_1]) {
      for (const statement of migration.split('--> statement-breakpoint')) {
        if (statement.trim()) this.database.exec(statement);
      }
    }
  }

  prepare(sql: string): Statement {
    return new SQLiteStatement(this, this.database.prepare(sql));
  }

  async batch<T = Record<string, unknown>>(
    statements: Statement[],
  ): Promise<QueryResult<T>[]> {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map((statement) => {
        if (!(statement instanceof SQLiteStatement)) {
          throw new TypeError('Statement belongs to a different test database.');
        }
        return statement.execute<T>();
      });
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  changes(): number {
    const row = this.database.prepare('SELECT changes() AS count').get() as {
      count: number;
    };
    return Number(row.count);
  }

  close(): void {
    this.database.close();
  }
}

function env(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    YAHOO_CLIENT_ID: 'test-client-id',
    YAHOO_CLIENT_SECRET: 'test-client-secret',
    YAHOO_REDIRECT_URI: 'https://temporary.example/api/integrations/yahoo/callback',
    YAHOO_TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY,
    YAHOO_APPLICATION_APPROVED: 'false',
    YAHOO_LIVE_CONTRACT_VALIDATED: 'false',
    ...overrides,
  };
}

void test('rejects unauthenticated Yahoo OAuth actions', async () => {
  assert.throws(
    () => requireAuthenticatedActor(null),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'UNAUTHENTICATED');
      assert.equal(error.status, 401);
      return true;
    },
  );

  const database = new SQLiteDatabase();
  const repository = new YahooOAuthRepository(database);
  await assert.rejects(
    beginYahooConnect({
      actor: null,
      repository,
      environment: env(),
    }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'UNAUTHENTICATED');
      return true;
    },
  );
  await assert.rejects(
    readYahooStatus({
      actor: null,
      repository,
      environment: env(),
    }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'UNAUTHENTICATED');
      return true;
    },
  );
  await assert.rejects(
    disconnectYahoo({ actor: null, repository }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'UNAUTHENTICATED');
      return true;
    },
  );
  database.close();
});

void test('binds OAuth state to actor and enforces single-use and expiry', async () => {
  const database = new SQLiteDatabase();
  const repository = new YahooOAuthRepository(database);
  const now = new Date('2026-09-09T12:00:00.000Z');
  const state = createOAuthState();
  const stateHash = await hashOAuthState(state);
  await repository.createState({
    stateHash,
    actorId: 'actor-a',
    now,
    ttlMs: 60_000,
  });

  await assert.rejects(
    repository.consumeValidState({
      stateHash,
      actorId: 'actor-b',
      now,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'OAUTH_STATE_MISMATCH');
      return true;
    },
  );

  await assert.rejects(
    repository.consumeValidState({
      stateHash,
      actorId: 'actor-a',
      now: new Date('2026-09-09T12:02:00.000Z'),
    }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'OAUTH_STATE_EXPIRED');
      return true;
    },
  );

  const freshState = createOAuthState();
  const freshHash = await hashOAuthState(freshState);
  await repository.createState({
    stateHash: freshHash,
    actorId: 'actor-a',
    now,
    ttlMs: 60_000,
  });
  const actorId = await repository.consumeValidState({
    stateHash: freshHash,
    actorId: 'actor-a',
    now: new Date('2026-09-09T12:00:30.000Z'),
  });
  assert.equal(actorId, 'actor-a');
  await assert.rejects(
    repository.consumeValidState({
      stateHash: freshHash,
      actorId: 'actor-a',
      now: new Date('2026-09-09T12:00:45.000Z'),
    }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'OAUTH_STATE_USED');
      return true;
    },
  );
  database.close();
});

void test('encrypts and decrypts Yahoo tokens and fails closed without a key', async () => {
  assert.equal(hasTokenEncryptionKey({}), false);
  await assert.rejects(
    encryptSecret('access-token', {}),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'ENCRYPTION_KEY_MISSING');
      return true;
    },
  );

  const ciphertext = await encryptSecret('access-token', env());
  assert.notEqual(ciphertext, 'access-token');
  assert.match(ciphertext, /^v1\./);
  assert.equal(await decryptSecret(ciphertext, env()), 'access-token');
  assert.doesNotMatch(ciphertext, /access-token/);
});

void test('callback persists rotated refresh tokens without returning secrets', async () => {
  const database = new SQLiteDatabase();
  const repository = new YahooOAuthRepository(database);
  const actor = { id: 'actor-a', displayName: 'Owner' };
  const now = new Date('2026-09-09T15:00:00.000Z');
  const environment = env();

  const { state } = await beginYahooConnect({
    actor,
    repository,
    environment,
    now,
  });

  const fetchImpl: typeof fetch = async (_input, init) => {
    const authorization = new Headers(init?.headers).get('authorization') ?? '';
    assert.match(authorization, /^Basic /);
    assert.doesNotMatch(authorization, /access-token|refresh-token/);
    return new Response(
      JSON.stringify({
        access_token: 'access-token-1',
        refresh_token: 'refresh-token-1',
        token_type: 'bearer',
        expires_in: 3600,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const result = await completeYahooCallback({
    actor,
    repository,
    environment,
    code: 'auth-code',
    state,
    now,
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.liveIngestEnabled, false);
  assert.doesNotMatch(JSON.stringify(result), /access-token|refresh-token/);

  const stored = await repository.getConnection(actor.id);
  assert.ok(stored);
  assert.equal(await decryptSecret(stored.encryptedAccessToken, environment), 'access-token-1');
  assert.equal(
    await decryptSecret(stored.encryptedRefreshToken, environment),
    'refresh-token-1',
  );

  assert.equal(
    resolveYahooRefreshToken({
      previousRefreshToken: 'refresh-token-1',
      responseRefreshToken: 'refresh-token-2',
    }),
    'refresh-token-2',
  );
  assert.equal(
    resolveYahooRefreshToken({ previousRefreshToken: 'refresh-token-1' }),
    'refresh-token-1',
  );

  const status = await readYahooStatus({ actor, repository, environment });
  assert.equal(status.hasStoredUserToken, true);
  assert.equal(status.liveIngestEnabled, false);
  assert.equal(status.status.readiness, 'approval_required');
  assert.doesNotMatch(
    JSON.stringify(status),
    /access-token|refresh-token|test-client-secret|0123456789abcdef/,
  );

  const disconnected = await disconnectYahoo({ actor, repository });
  assert.equal(disconnected.deleted, true);
  assert.equal(await repository.hasConnection(actor.id), false);
  database.close();
});

void test('inspectYahooConfiguration readiness paths remain unchanged', () => {
  assert.equal(
    inspectYahooConfiguration({}).readiness,
    'configuration_required',
  );
  assert.equal(
    inspectYahooConfiguration({
      clientId: 'client',
      clientSecret: 'secret',
      redirectUri: 'https://temporary.example/callback',
    }).readiness,
    'approval_required',
  );
  assert.equal(
    inspectYahooConfiguration({
      clientId: 'client',
      clientSecret: 'secret',
      redirectUri: 'https://temporary.example/callback',
      applicationApproved: true,
    }).readiness,
    'connection_required',
  );
  assert.equal(
    inspectYahooConfiguration({
      clientId: 'client',
      clientSecret: 'secret',
      redirectUri: 'https://temporary.example/callback',
      applicationApproved: true,
      hasStoredUserToken: true,
    }).readiness,
    'validation_required',
  );
  assert.equal(
    inspectYahooConfiguration({
      clientId: 'client',
      clientSecret: 'secret',
      redirectUri: 'https://temporary.example/callback',
      applicationApproved: true,
      hasStoredUserToken: true,
      liveContractValidated: true,
    }).readiness,
    'ready',
  );
});
