import assert from 'node:assert/strict';
import test from 'node:test';

import { DEMO_LEAGUES, DEMO_TIMESTAMP } from '../domain/demo.ts';
import { AppError } from '../server/errors.ts';
import type { TradeRepository } from '../server/repository.ts';
import {
  evaluate,
  leagueById,
  overview,
  parseTrade,
} from '../server/service.ts';

function validTradeInput(): Record<string, unknown> {
  const league = DEMO_LEAGUES[0];
  const fromTeam = league.teams.find((team) => team.id === league.myTeamId);
  const toTeam = league.teams.find((team) => team.id !== league.myTeamId);
  assert.ok(fromTeam);
  assert.ok(toTeam);

  return {
    leagueId: league.id,
    fromTeamId: fromTeam.id,
    toTeamId: toTeam.id,
    givePlayerIds: [fromTeam.playerIds[0]],
    receivePlayerIds: [toTeam.playerIds[0]],
    asOf: DEMO_TIMESTAMP,
  };
}

function expectAppError(code: string, action: () => unknown): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    return true;
  });
}

function expectDomainRejection(action: () => unknown): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'DomainError');
    return true;
  });
}

void test('leagueById returns only configured synthetic leagues', () => {
  assert.equal(leagueById(DEMO_LEAGUES[0].id), DEMO_LEAGUES[0]);
  expectAppError('LEAGUE_NOT_FOUND', () => leagueById('not-a-league'));
  expectAppError('LEAGUE_NOT_FOUND', () => leagueById(undefined));
});

void test('service rejects serialized JSON and non-object trade inputs', () => {
  expectAppError('INVALID_TRADE', () => parseTrade(null));
  expectAppError('INVALID_TRADE', () => parseTrade([]));
  expectAppError('INVALID_TRADE', () =>
    parseTrade(JSON.stringify(validTradeInput())),
  );
});

void test("service validates the selected league and current user's team", () => {
  const input = validTradeInput();
  expectAppError('LEAGUE_NOT_FOUND', () =>
    parseTrade({ ...input, leagueId: 'another-league' }),
  );
  expectAppError('INVALID_TEAM', () =>
    parseTrade({ ...input, fromTeamId: input.toTeamId }),
  );
  expectAppError('INVALID_TEAM', () =>
    parseTrade({ ...input, fromTeamId: undefined }),
  );
});

void test('service rejects malformed player ID collections', () => {
  const input = validTradeInput();
  expectAppError('INVALID_PLAYERS', () =>
    parseTrade({ ...input, givePlayerIds: 'not-an-array' }),
  );
  expectAppError('INVALID_PLAYERS', () =>
    parseTrade({
      ...input,
      receivePlayerIds: Array.from({ length: 17 }, (_, i) => `p-${i}`),
    }),
  );
  expectAppError('INVALID_PLAYERS', () =>
    parseTrade({ ...input, givePlayerIds: [3] }),
  );
  expectAppError('INVALID_PLAYERS', () =>
    parseTrade({ ...input, givePlayerIds: ['x'.repeat(100)] }),
  );
});

void test('domain validation rejects empty, duplicate, blank, and wrongly owned IDs', () => {
  const input = validTradeInput();
  expectDomainRejection(() => evaluate({ ...input, givePlayerIds: [] }));
  expectDomainRejection(() =>
    evaluate({
      ...input,
      givePlayerIds: [
        (input.givePlayerIds as string[])[0],
        (input.givePlayerIds as string[])[0],
      ],
    }),
  );
  expectDomainRejection(() => evaluate({ ...input, givePlayerIds: [' '] }));
  expectDomainRejection(() =>
    evaluate({ ...input, givePlayerIds: input.receivePlayerIds }),
  );
  expectDomainRejection(() => evaluate({ ...input, toTeamId: ' ' }));
});

void test('service rejects invalid and future decision timestamps', () => {
  const input = validTradeInput();
  expectAppError('INVALID_TIME', () =>
    parseTrade({ ...input, asOf: 'not-a-date' }),
  );
  expectAppError('INVALID_TIME', () =>
    parseTrade({ ...input, asOf: '2999-01-01T00:00:00.000Z' }),
  );
  expectAppError('INVALID_FIELD', () => parseTrade({ ...input, asOf: 123 }));
});

void test('valid input is normalized and evaluated only from demo evidence', () => {
  const input = validTradeInput();
  const { request, analysis } = evaluate({
    ...input,
    asOf: '2026-09-04T05:00:00-07:00',
  });

  assert.equal(request.asOf, DEMO_TIMESTAMP);
  assert.equal(request.leagueId, DEMO_LEAGUES[0].id);
  assert.equal(analysis.asOf, DEMO_TIMESTAMP);
  assert.equal(analysis.evidence.capturedAt, DEMO_TIMESTAMP);
  assert.match(analysis.evidence.source, /Synthetic demo data/);
  assert.ok(
    analysis.warnings.some((warning) =>
      warning.includes('not current NFL facts'),
    ),
  );
});

void test('overview scopes saved trades to the server-derived actor', async () => {
  let listedOwner: string | undefined;
  const repository = {
    async list(ownerId: string) {
      listedOwner = ownerId;
      return [];
    },
    async getYahooTokens() {
      return null;
    },
  } as unknown as TradeRepository;

  const result = await overview(repository, {
    id: 'authenticated-owner',
    displayName: 'Front Office User',
  });

  assert.equal(listedOwner, 'authenticated-owner');
  assert.equal(result.user.displayName, 'Front Office User');
  assert.equal(result.provider.status, 'pending_approval');
  assert.match(result.provider.message, /fictional demo data/i);
  assert.equal(result.leagues, DEMO_LEAGUES);
  assert.deepEqual(result.trades, []);
});
