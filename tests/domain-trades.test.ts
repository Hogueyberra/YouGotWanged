import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainError } from '../domain/errors.ts';
import { analyzeTrade, optimizeLineup } from '../domain/trades.ts';
import type {
  League,
  Player,
  Position,
  StartingSlot,
  TradeRequest,
} from '../domain/types.ts';

const SNAPSHOT_AT = '2026-09-04T12:00:00.000Z';

function makePlayer(
  id: string,
  position: Position,
  weeklyProjection: number | null,
  rosProjection: number | null = weeklyProjection === null
    ? null
    : weeklyProjection * 10,
): Player {
  return {
    id,
    name: id
      .split('-')
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' '),
    teamAbbr: 'SYN',
    position,
    eligiblePositions: [position],
    weeklyProjection,
    rosProjection,
    auctionCost: 1,
    status: 'healthy',
    byeWeek: 8,
    projectedAt: SNAPSHOT_AT,
  };
}

function makeTradeLeague(): League {
  const players = [
    makePlayer('from-alpha', 'RB', 12, 120),
    makePlayer('from-bravo', 'WR', 11, 110),
    makePlayer('from-charlie', 'WR', 10, 100),
    makePlayer('to-star', 'RB', 20, 200),
    makePlayer('to-echo', 'WR', 9, 90),
    makePlayer('to-foxtrot', 'RB', 1, 10),
  ];

  return {
    id: 'test-league',
    name: 'Synthetic Test League',
    season: 2026,
    week: 1,
    teamCount: 2,
    scoringLabel: 'Synthetic scoring',
    draftType: 'auction',
    superflex: true,
    budget: 200,
    rosterLimit: 3,
    startingSlots: [
      { id: 'rb', label: 'RB', eligible: ['RB'] },
      { id: 'flex', label: 'FLEX', eligible: ['RB', 'WR', 'TE'] },
    ],
    myTeamId: 'from-team',
    teams: [
      {
        id: 'from-team',
        name: 'From Team',
        manager: 'Manager From',
        abbreviation: 'FRM',
        wins: 0,
        losses: 0,
        pointsFor: 0,
        faabRemaining: 100,
        playerIds: ['from-alpha', 'from-bravo', 'from-charlie'],
      },
      {
        id: 'to-team',
        name: 'To Team',
        manager: 'Manager To',
        abbreviation: 'TO',
        wins: 0,
        losses: 0,
        pointsFor: 0,
        faabRemaining: 100,
        playerIds: ['to-star', 'to-echo', 'to-foxtrot'],
      },
    ],
    players,
    source: 'demo',
    snapshotAt: SNAPSHOT_AT,
  };
}

function makeRequest(overrides: Partial<TradeRequest> = {}): TradeRequest {
  return {
    leagueId: 'test-league',
    fromTeamId: 'from-team',
    toTeamId: 'to-team',
    givePlayerIds: ['from-alpha', 'from-bravo'],
    receivePlayerIds: ['to-star'],
    asOf: SNAPSHOT_AT,
    ...overrides,
  };
}

function expectDomainError(
  code: DomainError['code'],
  action: () => unknown,
): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof DomainError);
    assert.equal(error.code, code);
    return true;
  });
}

void test('lineup optimizer solves a non-greedy FLEX assignment exactly', () => {
  const slots: StartingSlot[] = [
    { id: 'flex', label: 'FLEX', eligible: ['RB', 'WR', 'TE'] },
    { id: 'rb', label: 'RB', eligible: ['RB'] },
  ];
  const players = [
    makePlayer('rb-best', 'RB', 10),
    makePlayer('rb-backup', 'RB', 1),
    makePlayer('wr-best', 'WR', 9),
  ];

  const result = optimizeLineup(players, slots);

  assert.equal(result.total, 19);
  assert.deepEqual(result.assignments, [
    { slotId: 'flex', playerId: 'wr-best', points: 9 },
    { slotId: 'rb', playerId: 'rb-best', points: 10 },
  ]);
});

void test('lineup optimizer never assigns one player twice', () => {
  const player = makePlayer('one-rb', 'RB', 10);
  const slots: StartingSlot[] = [
    { id: 'rb', label: 'RB', eligible: ['RB'] },
    { id: 'flex', label: 'FLEX', eligible: ['RB', 'WR', 'TE'] },
  ];

  const result = optimizeLineup([player], slots);

  assert.equal(result.total, null);
  assert.equal(result.assignments.length, 1);
  assert.equal(
    new Set(result.assignments.map((item) => item.playerId)).size,
    1,
  );
  assert.match(result.missing.join(' '), /No projected legal assignment/);
});

void test('lineup optimizer preserves missing projection uncertainty', () => {
  const known = makePlayer('known-rb', 'RB', 8);
  const unknown = makePlayer('unknown-rb', 'RB', null);
  const slots: StartingSlot[] = [{ id: 'rb', label: 'RB', eligible: ['RB'] }];

  const result = optimizeLineup([known, unknown], slots);

  assert.equal(result.total, null);
  assert.deepEqual(result.assignments, [
    { slotId: 'rb', playerId: 'known-rb', points: 8 },
  ]);
  assert.match(result.missing.join(' '), /unknown-rb/i);
});

void test('unequal trades include bench replacement value and capacity warnings', () => {
  const analysis = analyzeTrade(makeTradeLeague(), makeRequest());

  // Giving 23 raw starter points for 20 still improves the legal lineup because
  // the 10-point bench receiver replaces the second outgoing starter.
  assert.equal(analysis.from.before, 23);
  assert.equal(analysis.from.after, 30);
  assert.equal(analysis.from.lineupDelta, 7);
  assert.equal(analysis.from.rosDelta, 70);
  assert.equal(analysis.from.openRosterSlots, 1);
  assert.equal(analysis.to.openRosterSlots, 0);
  assert.equal(analysis.verdict, 'improves');
  assert.ok(
    analysis.warnings.some((warning) =>
      warning.includes('over the roster limit'),
    ),
  );
  assert.ok(
    analysis.warnings.some((warning) =>
      warning.includes('Auction draft prices'),
    ),
  );
  assert.match(analysis.evidence.source, /Synthetic demo data/);
});

void test('auction price changes do not change trade analysis', () => {
  const league = makeTradeLeague();
  const baseline = analyzeTrade(league, makeRequest());
  const repriced: League = {
    ...league,
    players: league.players.map((player, index) => ({
      ...player,
      auctionCost: index % 2 === 0 ? 0 : 199,
    })),
  };
  const afterRepricing = analyzeTrade(repriced, makeRequest());

  assert.deepEqual(afterRepricing.from, baseline.from);
  assert.deepEqual(afterRepricing.to, baseline.to);
  assert.equal(afterRepricing.verdict, baseline.verdict);
});

void test('trade analysis deep-copies its complete decision-time inputs', () => {
  const league = makeTradeLeague();
  const analysis = analyzeTrade(league, makeRequest());
  const capturedTeamName = analysis.inputs.teams[0].name;
  const capturedProjection = analysis.inputs.players.find(
    (player) => player.id === 'from-alpha',
  )?.weeklyProjection;
  const capturedEligibility = [...analysis.inputs.startingSlots[0].eligible];

  assert.equal(analysis.inputs.players.length, 6);
  assert.equal(analysis.inputs.rosterLimit, league.rosterLimit);
  assert.equal(analysis.inputs.scoringLabel, league.scoringLabel);
  assert.equal(analysis.inputs.week, league.week);
  assert.equal(analysis.inputs.season, league.season);
  assert.equal(analysis.inputs.source, 'demo');
  assert.equal(analysis.inputs.snapshotAt, SNAPSHOT_AT);

  league.teams[0].name = 'Mutated after analysis';
  league.players[0].weeklyProjection = 999;
  league.startingSlots[0].eligible.push('WR');

  assert.equal(analysis.inputs.teams[0].name, capturedTeamName);
  assert.equal(
    analysis.inputs.players.find((player) => player.id === 'from-alpha')
      ?.weeklyProjection,
    capturedProjection,
  );
  assert.deepEqual(
    analysis.inputs.startingSlots[0].eligible,
    capturedEligibility,
  );
});

void test('trade validation rejects league mismatch, duplicates, and bad ownership', () => {
  const league = makeTradeLeague();

  expectDomainError('INVALID_LEAGUE', () =>
    analyzeTrade(league, makeRequest({ leagueId: 'other-league' })),
  );
  expectDomainError('DUPLICATE_PLAYER_ID', () =>
    analyzeTrade(
      league,
      makeRequest({ givePlayerIds: ['from-alpha', 'from-alpha'] }),
    ),
  );
  expectDomainError('INVALID_OWNERSHIP', () =>
    analyzeTrade(league, makeRequest({ givePlayerIds: ['to-echo'] })),
  );
});

void test('trade validation rejects players on both sides and duplicate league IDs', () => {
  const league = makeTradeLeague();
  expectDomainError('PLAYER_ON_BOTH_SIDES', () =>
    analyzeTrade(
      league,
      makeRequest({
        givePlayerIds: ['from-alpha'],
        receivePlayerIds: ['from-alpha'],
      }),
    ),
  );

  const duplicateTeamLeague: League = {
    ...league,
    teams: [league.teams[0], { ...league.teams[1], id: league.teams[0].id }],
  };
  expectDomainError('DUPLICATE_TEAM_ID', () =>
    analyzeTrade(duplicateTeamLeague, makeRequest()),
  );

  const duplicatePlayerLeague: League = {
    ...league,
    players: [...league.players, { ...league.players[0] }],
  };
  expectDomainError('DUPLICATE_PLAYER_ID', () =>
    analyzeTrade(duplicatePlayerLeague, makeRequest()),
  );
});

void test('future projections are excluded instead of leaking into an as_of result', () => {
  const league = makeTradeLeague();
  const withFutureProjection: League = {
    ...league,
    players: league.players.map((player) =>
      player.id === 'from-charlie'
        ? {
            ...player,
            weeklyProjection: 99,
            rosProjection: 999,
            projectedAt: '2026-09-05T12:00:00.000Z',
          }
        : player,
    ),
  };

  const analysis = analyzeTrade(withFutureProjection, makeRequest());

  assert.equal(analysis.verdict, 'unavailable');
  assert.equal(analysis.from.before, null);
  assert.ok(
    analysis.missingSignals.some((signal) =>
      signal.includes('published after as_of'),
    ),
  );
  assert.equal(
    analysis.inputs.players.find((player) => player.id === 'from-charlie')
      ?.weeklyProjection,
    null,
  );
  assert.equal(analysis.evidence.capturedAt, SNAPSHOT_AT);
});

void test('a league snapshot newer than as_of is rejected', () => {
  const league: League = {
    ...makeTradeLeague(),
    snapshotAt: '2026-09-05T12:00:00.000Z',
  };

  expectDomainError('INVALID_LEAGUE_SNAPSHOT', () =>
    analyzeTrade(league, makeRequest()),
  );
});
