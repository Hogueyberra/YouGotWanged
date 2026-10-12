import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ProviderLeague,
  ProviderRosterEntry,
  ProviderTeam,
} from '../integrations/providers/contracts.ts';
import {
  convertYahooLeagueToDomain,
  detectYahooSport,
  type YahooLeagueDetail,
} from '../server/yahooLeagueConvert.ts';

const CAPTURED_AT = '2026-10-12T12:00:00.000Z';

function basketballDetail(): YahooLeagueDetail {
  const league: ProviderLeague = {
    providerLeagueKey: '418.l.67890',
    providerLeagueId: '67890',
    name: 'Hoops League',
    season: 2025,
    currentWeek: 3,
    gameKey: '418',
    url: 'https://basketball.fantasysports.yahoo.com/nba/67890',
    isFinished: false,
  };
  const teams: ProviderTeam[] = [
    {
      providerTeamKey: '418.l.67890.t.1',
      providerTeamId: '1',
      name: 'Nick Hoops',
      abbreviation: 'NH',
      url: null,
      managerName: 'Nick',
      faabBalance: 87,
      isCurrentLogin: true,
    },
    {
      providerTeamKey: '418.l.67890.t.2',
      providerTeamId: '2',
      name: 'Rival Hoops',
      abbreviation: null,
      url: null,
      managerName: 'Rival',
      faabBalance: 100,
      isCurrentLogin: false,
    },
  ];
  const player = (
    key: string,
    name: string,
    displayPosition: string,
    eligible: string[],
  ): ProviderRosterEntry => ({
    player: {
      providerPlayerKey: key,
      providerPlayerId: key.split('.').pop() ?? null,
      name,
      teamAbbreviation: 'LAL',
      displayPosition,
      eligiblePositions: eligible,
      status: null,
    },
    selectedPosition: displayPosition,
    week: 3,
  });
  return {
    leagueKey: '418.l.67890',
    league,
    settings: {
      draftType: 'snake',
      isAuctionDraft: false,
      rosterPositions: [
        { position: 'PG', positionType: 'O', count: 1 },
        { position: 'SG', positionType: 'O', count: 1 },
        { position: 'SF', positionType: 'O', count: 1 },
        { position: 'PF', positionType: 'O', count: 1 },
        { position: 'C', positionType: 'O', count: 1 },
        { position: 'G', positionType: 'O', count: 1 },
        { position: 'F', positionType: 'O', count: 1 },
        { position: 'UTIL', positionType: 'O', count: 2 },
        { position: 'BN', positionType: 'BN', count: 4 },
        { position: 'IL', positionType: 'IL', count: 1 },
      ],
    },
    standings: [
      {
        teamKey: '418.l.67890.t.1',
        wins: 8,
        losses: 2,
        ties: 0,
        pointsFor: 1234.5,
      },
      {
        teamKey: '418.l.67890.t.2',
        wins: 5,
        losses: 5,
        ties: 0,
        pointsFor: 1100,
      },
    ],
    teams,
    rosters: {
      '418.l.67890.t.1': [
        player('418.p.1', 'Point Guard One', 'PG', ['PG', 'G', 'UTIL']),
        player('418.p.2', 'Shooting Guard One', 'SG', ['SG', 'G', 'UTIL']),
        player('418.p.3', 'Center One', 'C', ['C', 'UTIL']),
      ],
      '418.l.67890.t.2': [
        player('418.p.4', 'Small Forward One', 'SF', ['SF', 'F', 'UTIL']),
        player('418.p.5', 'Power Forward One', 'PF', ['PF', 'F', 'UTIL']),
      ],
    },
    capturedAt: CAPTURED_AT,
  };
}

void test('detectYahooSport prefers the league key, then game key, URL, slots', () => {
  assert.equal(
    detectYahooSport({
      leagueKey: 'xxx.nfl.123',
      gameKey: null,
      url: null,
      rosterPositions: [],
    }),
    'football',
  );
  assert.equal(
    detectYahooSport({
      leagueKey: 'xxx.nba.456',
      gameKey: null,
      url: null,
      rosterPositions: [],
    }),
    'basketball',
  );
  assert.equal(
    detectYahooSport({
      leagueKey: '449.l.12345',
      gameKey: 'nfl',
      url: null,
      rosterPositions: [],
    }),
    'football',
  );
  assert.equal(
    detectYahooSport({
      leagueKey: '418.l.67890',
      gameKey: null,
      url: 'https://basketball.fantasysports.yahoo.com/nba/67890',
      rosterPositions: [],
    }),
    'basketball',
  );
  assert.equal(
    detectYahooSport({
      leagueKey: '999.l.1',
      gameKey: null,
      url: null,
      rosterPositions: ['PG', 'SG', 'UTIL', 'BN'],
    }),
    'basketball',
  );
  assert.equal(
    detectYahooSport({
      leagueKey: '999.l.1',
      gameKey: null,
      url: null,
      rosterPositions: ['QB', 'W/R/T', 'BN'],
    }),
    'football',
  );
  assert.equal(
    detectYahooSport({
      leagueKey: '999.l.1',
      gameKey: null,
      url: null,
      rosterPositions: [],
    }),
    'unknown',
  );
});

void test('converts a basketball league without inventing projections', () => {
  const converted = convertYahooLeagueToDomain(basketballDetail());

  assert.equal(converted.ok, true);
  if (!converted.ok) return;
  const league = converted.league;

  assert.equal(league.id, '418.l.67890');
  assert.equal(league.sport, 'basketball');
  assert.equal(league.source, 'yahoo');
  assert.equal(league.providerLeagueKey, '418.l.67890');
  assert.equal(league.draftType, 'snake');
  assert.equal(league.superflex, false);
  assert.equal(league.season, 2025);
  assert.equal(league.week, 3);
  assert.equal(league.teamCount, 2);
  assert.equal(league.myTeamId, '418.l.67890.t.1');
  assert.equal(league.snapshotAt, CAPTURED_AT);

  // PG + SG + SF + PF + C + G + F + 2 UTIL = 9 starting slots; BN/IL excluded.
  assert.equal(league.startingSlots.length, 9);
  const slotById = new Map(league.startingSlots.map((s) => [s.id, s]));
  assert.deepEqual(slotById.get('yahoo-pg-1')?.eligible, ['PG']);
  assert.deepEqual(slotById.get('yahoo-g-1')?.eligible, ['PG', 'SG']);
  assert.deepEqual(slotById.get('yahoo-f-1')?.eligible, ['SF', 'PF']);
  assert.deepEqual(slotById.get('yahoo-util-1')?.eligible, [
    'PG',
    'SG',
    'SF',
    'PF',
    'C',
  ]);
  assert.ok(
    league.startingSlots.every((slot) => !slot.id.includes('bn')),
    'bench slots must not start',
  );

  // Teams carry standings, FAAB, and roster membership.
  const myTeam = league.teams.find((t) => t.id === league.myTeamId);
  assert.equal(myTeam?.name, 'Nick Hoops');
  assert.equal(myTeam?.manager, 'Nick');
  assert.equal(myTeam?.wins, 8);
  assert.equal(myTeam?.losses, 2);
  assert.equal(myTeam?.pointsFor, 1234.5);
  assert.equal(myTeam?.faabRemaining, 87);
  assert.deepEqual(myTeam?.playerIds, ['418.p.1', '418.p.2', '418.p.3']);

  // Players keep real positions; projections stay null — never invented.
  assert.equal(league.players.length, 5);
  const pg = league.players.find((p) => p.id === '418.p.1');
  assert.equal(pg?.position, 'PG');
  assert.deepEqual(pg?.eligiblePositions, ['PG']);
  assert.equal(pg?.teamAbbr, 'LAL');
  assert.equal(pg?.weeklyProjection, null);
  assert.equal(pg?.rosProjection, null);
  assert.equal(pg?.auctionCost, 0);
  assert.equal(pg?.projectedAt, CAPTURED_AT);

  // Roster size counts every slot including bench.
  assert.equal(league.rosterLimit, 14);
});

void test('converts a football league with flex and superflex slots', () => {
  const detail = basketballDetail();
  detail.leagueKey = '449.l.12345';
  detail.league = {
    ...detail.league,
    providerLeagueKey: '449.l.12345',
    name: 'HB KIDS',
    url: 'https://football.fantasysports.yahoo.com/f1/12345',
  };
  detail.settings = {
    draftType: 'auction',
    isAuctionDraft: true,
    rosterPositions: [
      { position: 'QB', positionType: 'O', count: 1 },
      { position: 'RB', positionType: 'O', count: 2 },
      { position: 'WR', positionType: 'O', count: 2 },
      { position: 'TE', positionType: 'O', count: 1 },
      { position: 'W/R/T', positionType: 'O', count: 1 },
      { position: 'Q/W/R/T', positionType: 'O', count: 1 },
      { position: 'K', positionType: 'O', count: 1 },
      { position: 'DEF', positionType: 'O', count: 1 },
      { position: 'BN', positionType: 'BN', count: 6 },
    ],
  };
  const qbEntry: ProviderRosterEntry = {
    player: {
      providerPlayerKey: '449.p.100',
      providerPlayerId: '100',
      name: 'Example Quarterback',
      teamAbbreviation: 'SEA',
      displayPosition: 'QB',
      eligiblePositions: ['QB', 'Q/W/R/T', 'BN'],
      status: 'Q',
    },
    selectedPosition: 'QB',
    week: 7,
  };
  detail.teams = detail.teams.map((team, index) => ({
    ...team,
    providerTeamKey: `449.l.12345.t.${index + 1}`,
    // Keep the first team as the current login after remapping keys.
    isCurrentLogin: index === 0,
  }));
  detail.standings = detail.standings.map((standing, index) => ({
    ...standing,
    teamKey: `449.l.12345.t.${index + 1}`,
  }));
  detail.rosters = { '449.l.12345.t.1': [qbEntry], '449.l.12345.t.2': [] };

  const converted = convertYahooLeagueToDomain(detail);

  assert.equal(converted.ok, true);
  if (!converted.ok) return;
  const league = converted.league;

  assert.equal(league.sport, 'football');
  assert.equal(league.draftType, 'auction');
  assert.equal(league.superflex, true);
  assert.equal(league.startingSlots.length, 10);

  const flex = league.startingSlots.find((s) => s.id === 'yahoo-wrt-1');
  assert.deepEqual(flex?.eligible, ['RB', 'WR', 'TE']);
  const superflex = league.startingSlots.find((s) => s.id === 'yahoo-qwrt-1');
  assert.deepEqual(superflex?.eligible, ['QB', 'RB', 'WR', 'TE']);

  const qb = league.players.find((p) => p.id === '449.p.100');
  assert.equal(qb?.position, 'QB');
  assert.deepEqual(qb?.eligiblePositions, ['QB']);
  assert.equal(qb?.status, 'questionable');
  assert.equal(league.myTeamId, '449.l.12345.t.1');
});

void test('conversion fails gracefully without a determinable sport', () => {
  const detail = basketballDetail();
  detail.leagueKey = '999.l.1';
  detail.league = { ...detail.league, providerLeagueKey: '999.l.1', url: null };
  detail.settings = { ...detail.settings, rosterPositions: [] };

  const converted = convertYahooLeagueToDomain(detail);

  assert.equal(converted.ok, false);
  if (converted.ok) return;
  assert.match(converted.issues[0] ?? '', /sport/i);
});

void test('conversion fails gracefully without an identified user team', () => {
  const detail = basketballDetail();
  detail.teams = detail.teams.map((team) => ({
    ...team,
    isCurrentLogin: false,
  }));

  const converted = convertYahooLeagueToDomain(detail);

  assert.equal(converted.ok, false);
  if (converted.ok) return;
  assert.match(converted.issues[0] ?? '', /current user's team/i);
});

void test('conversion fails gracefully without usable starting slots', () => {
  const detail = basketballDetail();
  detail.settings = {
    draftType: 'snake',
    isAuctionDraft: false,
    rosterPositions: [{ position: 'BN', positionType: 'BN', count: 6 }],
  };

  const converted = convertYahooLeagueToDomain(detail);

  assert.equal(converted.ok, false);
  if (converted.ok) return;
  assert.match(converted.issues[0] ?? '', /starting slots/i);
});

void test('conversion tolerates missing rosters and unknown positions', () => {
  const detail = basketballDetail();
  detail.rosters = {
    '418.l.67890.t.1': null,
    '418.l.67890.t.2': [
      {
        player: {
          providerPlayerKey: '418.p.9',
          providerPlayerId: '9',
          name: 'Mystery Player',
          teamAbbreviation: null,
          displayPosition: 'XX',
          eligiblePositions: ['XX'],
          status: null,
        },
        selectedPosition: null,
        week: null,
      },
    ],
  };

  const converted = convertYahooLeagueToDomain(detail);

  assert.equal(converted.ok, true);
  if (!converted.ok) return;
  // Unknown position is skipped; the team keeps an empty roster.
  assert.equal(converted.league.players.length, 0);
  const team = converted.league.teams.find(
    (t) => t.id === '418.l.67890.t.1',
  );
  assert.deepEqual(team?.playerIds, []);
});
