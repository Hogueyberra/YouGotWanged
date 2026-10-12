import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import type { TradeAnalysis, TradeRequest } from '../domain/types.ts';
import { AppError } from '../server/errors.ts';
import {
  TradeRepository,
  type Database,
  type QueryResult,
  type Statement,
} from '../server/repository.ts';

const SNAPSHOT_AT = '2026-09-04T12:00:00.000Z';
const MIGRATION_FILES = readdirSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle'),
)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) =>
    readFileSync(
      new URL(`../drizzle/${file}`, import.meta.url),
      'utf8',
    ),
  );

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
    for (const migration of MIGRATION_FILES) {
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
          throw new TypeError(
            'Statement belongs to a different test database.',
          );
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

  exec(sql: string): void {
    this.database.exec(sql);
  }

  count(table: 'trades' | 'trade_events', ownerId?: string): number {
    const statement = ownerId
      ? this.database.prepare(
          `SELECT COUNT(*) AS count FROM ${table} WHERE owner_id = ?`,
        )
      : this.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`);
    const row = (ownerId ? statement.get(ownerId) : statement.get()) as {
      count: number;
    };
    return Number(row.count);
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

function snapshot(leagueId: string): {
  request: TradeRequest;
  analysis: TradeAnalysis;
} {
  const request: TradeRequest = {
    leagueId,
    fromTeamId: `${leagueId}-mine`,
    toTeamId: `${leagueId}-theirs`,
    givePlayerIds: [`${leagueId}-give`],
    receivePlayerIds: [`${leagueId}-receive`],
    asOf: SNAPSHOT_AT,
  };
  const analysis: TradeAnalysis = {
    version: 'test-v1',
    asOf: request.asOf,
    leagueId,
    fromTeamId: request.fromTeamId,
    toTeamId: request.toTeamId,
    givePlayerIds: [...request.givePlayerIds],
    receivePlayerIds: [...request.receivePlayerIds],
    verdict: 'balanced',
    summary: 'Frozen deterministic test analysis.',
    from: {
      before: 100,
      after: 100,
      lineupDelta: 0,
      rosDelta: 0,
      openRosterSlots: 0,
    },
    to: {
      before: 100,
      after: 100,
      lineupDelta: 0,
      rosDelta: 0,
      openRosterSlots: 0,
    },
    warnings: ['Synthetic test evidence.'],
    evidence: { source: 'synthetic_test', capturedAt: SNAPSHOT_AT },
    inputs: {
      teams: [
        {
          id: request.fromTeamId,
          name: 'From team',
          manager: 'From manager',
          abbreviation: 'FRM',
          wins: 0,
          losses: 0,
          pointsFor: 0,
          faabRemaining: 100,
          playerIds: [...request.givePlayerIds],
        },
        {
          id: request.toTeamId,
          name: 'To team',
          manager: 'To manager',
          abbreviation: 'TO',
          wins: 0,
          losses: 0,
          pointsFor: 0,
          faabRemaining: 100,
          playerIds: [...request.receivePlayerIds],
        },
      ],
      players: [],
      startingSlots: [],
      rosterLimit: 14,
      scoringLabel: 'Synthetic scoring',
      week: 1,
      season: 2026,
      source: 'demo',
      snapshotAt: SNAPSHOT_AT,
    },
    missingSignals: [],
  };
  return { request, analysis };
}

function setup(): { database: SQLiteDatabase; repository: TradeRepository } {
  const database = new SQLiteDatabase();
  return { database, repository: new TradeRepository(database) };
}

function isAppError(error: unknown, code: string): boolean {
  assert.ok(error instanceof AppError);
  assert.equal(error.code, code);
  return true;
}

void test('repository CRUD remains isolated by owner and league', async (context) => {
  const { database, repository } = setup();
  context.after(() => database.close());
  const leagueA = snapshot('league-a');
  const leagueB = snapshot('league-b');

  const ownerALeagueA = await repository.create(
    'owner-a',
    leagueA.request,
    leagueA.analysis,
    'A in league A',
    'private note A',
  );
  const ownerALeagueB = await repository.create(
    'owner-a',
    leagueB.request,
    leagueB.analysis,
    'A in league B',
    'private note B',
  );
  const ownerBLeagueA = await repository.create(
    'owner-b',
    leagueA.request,
    leagueA.analysis,
    'B in league A',
    'private note C',
  );

  assert.deepEqual(
    new Set((await repository.list('owner-a')).map((trade) => trade.id)),
    new Set([ownerALeagueA.id, ownerALeagueB.id]),
  );
  assert.deepEqual(
    (await repository.list('owner-b')).map((trade) => trade.id),
    [ownerBLeagueA.id],
  );
  await assert.rejects(
    repository.get('owner-a', 'league-b', ownerALeagueA.id),
    (error) => isAppError(error, 'NOT_FOUND'),
  );
  await assert.rejects(
    repository.delete('owner-b', 'league-a', ownerALeagueA.id),
    (error) => isAppError(error, 'NOT_FOUND'),
  );

  await repository.delete('owner-a', 'league-a', ownerALeagueA.id);
  await assert.rejects(
    repository.get('owner-a', 'league-a', ownerALeagueA.id),
    (error) => isAppError(error, 'NOT_FOUND'),
  );
  assert.equal((await repository.list('owner-a')).length, 1);
  assert.equal((await repository.list('owner-b')).length, 1);
});

void test('decision-time request and analysis remain frozen', async (context) => {
  const { database, repository } = setup();
  context.after(() => database.close());
  const original = snapshot('league-a');
  const saved = await repository.create(
    'owner-a',
    original.request,
    original.analysis,
    'Frozen',
    'Original',
  );

  original.request.givePlayerIds.push('late-mutation');
  original.analysis.summary = 'Mutated after persistence';
  const proposed = await repository.transition(
    'owner-a',
    'league-a',
    saved.id,
    'proposed',
    1,
    'Sent outside the app',
  );

  assert.deepEqual(proposed.request.givePlayerIds, ['league-a-give']);
  assert.equal(
    proposed.analysis.summary,
    'Frozen deterministic test analysis.',
  );
  assert.throws(
    () =>
      database.exec(
        `UPDATE trades SET analysis_json = '{"changed":true}' WHERE id = '${saved.id}'`,
      ),
    /immutable/i,
  );
  assert.equal(
    (await repository.get('owner-a', 'league-a', saved.id)).analysis.summary,
    'Frozen deterministic test analysis.',
  );
});

void test('legal status transitions append revisioned events', async (context) => {
  const { database, repository } = setup();
  context.after(() => database.close());
  const trade = snapshot('league-a');
  const created = await repository.create(
    'owner-a',
    trade.request,
    trade.analysis,
    'Lifecycle',
    '',
  );

  const proposed = await repository.transition(
    'owner-a',
    'league-a',
    created.id,
    'proposed',
    1,
    'Offer sent manually',
  );
  const accepted = await repository.transition(
    'owner-a',
    'league-a',
    created.id,
    'accepted',
    2,
    'Accepted in Yahoo',
  );
  const completed = await repository.transition(
    'owner-a',
    'league-a',
    created.id,
    'completed',
    3,
    'Yahoo shows complete',
  );

  assert.equal(proposed.revision, 2);
  assert.equal(accepted.revision, 3);
  assert.equal(completed.revision, 4);
  assert.deepEqual(
    completed.events.map((event) => event.status),
    ['idea', 'proposed', 'accepted', 'completed'],
  );
  await assert.rejects(
    repository.transition(
      'owner-a',
      'league-a',
      created.id,
      'withdrawn',
      4,
      'Too late',
    ),
    (error) => isAppError(error, 'INVALID_TRANSITION'),
  );
});

void test('concurrent transitions allow one winner and reject the stale revision', async (context) => {
  const { database, repository } = setup();
  context.after(() => database.close());
  const trade = snapshot('league-a');
  const created = await repository.create(
    'owner-a',
    trade.request,
    trade.analysis,
    'Concurrent',
    '',
  );

  const attempts = await Promise.allSettled([
    repository.transition(
      'owner-a',
      'league-a',
      created.id,
      'proposed',
      1,
      'First tab',
    ),
    repository.transition(
      'owner-a',
      'league-a',
      created.id,
      'withdrawn',
      1,
      'Second tab',
    ),
  ]);

  assert.equal(
    attempts.filter((result) => result.status === 'fulfilled').length,
    1,
  );
  const rejected = attempts.find((result) => result.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.ok(rejected.reason instanceof AppError);
  assert.equal(rejected.reason.code, 'STALE_REVISION');

  const persisted = await repository.get('owner-a', 'league-a', created.id);
  assert.equal(persisted.revision, 2);
  assert.equal(persisted.events.length, 2);
});

void test('a failed event insert rolls back its status update atomically', async (context) => {
  const { database, repository } = setup();
  context.after(() => database.close());
  const trade = snapshot('league-a');
  const created = await repository.create(
    'owner-a',
    trade.request,
    trade.analysis,
    'Atomic',
    '',
  );
  database.exec(`
    CREATE TRIGGER fail_proposed_event
    BEFORE INSERT ON trade_events
    WHEN NEW.status = 'proposed'
    BEGIN
      SELECT RAISE(ABORT, 'synthetic event failure');
    END;
  `);

  await assert.rejects(
    repository.transition(
      'owner-a',
      'league-a',
      created.id,
      'proposed',
      1,
      'Must roll back',
    ),
    /synthetic event failure/,
  );

  const persisted = await repository.get('owner-a', 'league-a', created.id);
  assert.equal(persisted.status, 'idea');
  assert.equal(persisted.revision, 1);
  assert.deepEqual(
    persisted.events.map((event) => event.status),
    ['idea'],
  );
});

void test('deleting a trade cascades to its event history', async (context) => {
  const { database, repository } = setup();
  context.after(() => database.close());
  const trade = snapshot('league-a');
  const created = await repository.create(
    'owner-a',
    trade.request,
    trade.analysis,
    'Cascade',
    '',
  );
  await repository.transition(
    'owner-a',
    'league-a',
    created.id,
    'proposed',
    1,
    'Event two',
  );
  assert.equal(database.count('trade_events'), 2);

  await repository.delete('owner-a', 'league-a', created.id);

  assert.equal(database.count('trades'), 0);
  assert.equal(database.count('trade_events'), 0);
});

void test("deleteAll erases only the authenticated owner's data", async (context) => {
  const { database, repository } = setup();
  context.after(() => database.close());
  const leagueA = snapshot('league-a');
  const leagueB = snapshot('league-b');
  await repository.create(
    'owner-a',
    leagueA.request,
    leagueA.analysis,
    'A1',
    '',
  );
  await repository.create(
    'owner-a',
    leagueB.request,
    leagueB.analysis,
    'A2',
    '',
  );
  const retained = await repository.create(
    'owner-b',
    leagueA.request,
    leagueA.analysis,
    'B1',
    '',
  );

  await repository.deleteAll('owner-a');

  assert.equal(database.count('trades', 'owner-a'), 0);
  assert.equal(database.count('trade_events', 'owner-a'), 0);
  assert.equal(database.count('trades', 'owner-b'), 1);
  assert.equal(database.count('trade_events', 'owner-b'), 1);
  assert.equal(
    (await repository.get('owner-b', 'league-a', retained.id)).title,
    'B1',
  );
});
