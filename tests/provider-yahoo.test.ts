import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectYahooConfiguration } from '../integrations/providers/config.ts';
import {
  ProviderHttpClient,
  type FetchLike,
} from '../integrations/providers/http.ts';
import { YahooFantasyReadOnlyAdapter } from '../integrations/yahoo/adapter.ts';
import {
  normalizeYahooLeagues,
  normalizeYahooPlayers,
  normalizeYahooRoster,
  normalizeYahooSettings,
  normalizeYahooStandings,
  normalizeYahooTeams,
  normalizeYahooTransactions,
} from '../integrations/yahoo/normalizer.ts';
import {
  buildYahooAuthorizationUrl,
  createOAuthState,
  hashOAuthState,
  resolveYahooRefreshToken,
  verifyOAuthState,
} from '../integrations/yahoo/oauth.ts';
import { buildYahooFantasyPath } from '../integrations/yahoo/paths.ts';

void test('builds only allowlisted Yahoo Fantasy read paths', () => {
  assert.equal(
    buildYahooFantasyPath({ kind: 'user-leagues' }),
    '/fantasy/v2/users;use_login=1/games;game_keys=nfl,nba/leagues?format=json',
  );
  assert.equal(
    buildYahooFantasyPath({
      kind: 'players',
      leagueKey: '449.l.12345',
      start: 25,
      count: 25,
    }),
    '/fantasy/v2/league/449.l.12345/players;start=25;count=25?format=json',
  );
  assert.equal(
    buildYahooFantasyPath({
      kind: 'roster',
      teamKey: '449.l.12345.t.1',
      week: 7,
    }),
    '/fantasy/v2/team/449.l.12345.t.1/roster;week=7?format=json',
  );
  assert.throws(
    () =>
      buildYahooFantasyPath({
        kind: 'league',
        leagueKey: '../users',
      }),
    /not a valid Yahoo resource key/,
  );
});

void test('normalizes nested Yahoo league fragments without claiming live validation', () => {
  const payload = {
    fantasy_content: {
      users: {
        0: {
          user: [
            { guid: 'private-guid' },
            {
              games: {
                0: {
                  game: [
                    { game_key: '449' },
                    {
                      leagues: {
                        0: {
                          league: [
                            {
                              league_key: '449.l.12345',
                              league_id: '12345',
                              name: 'Neighborhood League',
                              season: '2026',
                            },
                            { current_week: '7', is_finished: 0 },
                          ],
                        },
                        count: 1,
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    },
  };

  const result = normalizeYahooLeagues(payload);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.contract.liveValidated, false);
  assert.deepEqual(result.value, [
    {
      providerLeagueKey: '449.l.12345',
      providerLeagueId: '12345',
      name: 'Neighborhood League',
      season: 2026,
      currentWeek: 7,
      gameKey: null,
      url: null,
      isFinished: false,
    },
  ]);
});

void test('rejects unknown Yahoo shapes rather than returning empty validated data', () => {
  const result = normalizeYahooLeagues({ data: [] });

  assert.equal(result.ok, false);
  assert.equal(result.contract.liveValidated, false);
  assert.equal(result.issues[0]?.code, 'unknown_shape');
});

void test('normalizes player and roster fragments while preserving missing values', () => {
  const payload = {
    fantasy_content: {
      team: [
        { team_key: '449.l.12345.t.1' },
        {
          roster: {
            players: {
              0: {
                player: [
                  {
                    player_key: '449.p.30123',
                    player_id: '30123',
                    name: { full: 'Example Quarterback' },
                    editorial_team_abbr: 'SEA',
                    display_position: 'QB',
                  },
                  {
                    eligible_positions: [
                      { position: 'QB' },
                      { position: 'Q/W/R/T' },
                    ],
                    selected_position: { position: 'QB', week: '7' },
                  },
                ],
              },
              count: 1,
            },
          },
        },
      ],
    },
  };

  const players = normalizeYahooPlayers(payload);
  assert.equal(players.ok, true);
  if (players.ok) {
    assert.equal(players.value[0]?.status, null);
    assert.deepEqual(players.value[0]?.eligiblePositions, ['QB', 'Q/W/R/T']);
  }

  const roster = normalizeYahooRoster(payload);
  assert.equal(roster.ok, true);
  if (roster.ok) {
    assert.equal(roster.value[0]?.selectedPosition, 'QB');
    assert.equal(roster.value[0]?.week, 7);
  }
});

void test('normalizes Yahoo transaction timestamps as immutable observations', () => {
  const result = normalizeYahooTransactions({
    fantasy_content: {
      league: [
        { league_key: '449.l.12345' },
        {
          transactions: {
            0: {
              transaction: [
                {
                  transaction_key: '449.l.12345.tr.9',
                  transaction_id: '9',
                  type: 'add/drop',
                  status: 'successful',
                  timestamp: '1788480000',
                },
              ],
            },
          },
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value[0]?.providerTransactionId, '9');
    assert.match(result.value[0]?.occurredAt ?? '', /^2026-/);
  }
});

void test('reports Yahoo readiness without exposing credentials', () => {
  const status = inspectYahooConfiguration({
    clientId: 'client-value',
    clientSecret: 'secret-value',
    redirectUri: 'https://temporary.example/callback',
    applicationApproved: true,
    hasStoredUserToken: false,
  });

  assert.equal(status.readiness, 'connection_required');
  assert.equal(status.readOnly, true);
  assert.equal(status.liveContractValidated, false);
  assert.doesNotMatch(JSON.stringify(status), /client-value|secret-value/);
});

void test('does not report Yahoo ready before live contract validation', () => {
  const pending = inspectYahooConfiguration({
    clientId: 'client-value',
    clientSecret: 'secret-value',
    redirectUri: 'https://temporary.example/callback',
    applicationApproved: true,
    hasStoredUserToken: true,
  });
  const ready = inspectYahooConfiguration({
    clientId: 'client-value',
    clientSecret: 'secret-value',
    redirectUri: 'https://temporary.example/callback',
    applicationApproved: true,
    hasStoredUserToken: true,
    liveContractValidated: true,
  });

  assert.equal(pending.readiness, 'validation_required');
  assert.equal(ready.readiness, 'ready');
  assert.equal(ready.liveContractValidated, true);
});

void test('Yahoo adapter captures provenance and provisional retention', async () => {
  let authorization = '';
  const fetch: FetchLike = (_input, init) => {
    authorization = new Headers(init?.headers).get('authorization') ?? '';
    return Promise.resolve(
      new Response(
        JSON.stringify({
          fantasy_content: {
            league: [
              {
                league_key: '449.l.12345',
                league_id: '12345',
                name: 'Neighborhood League',
              },
            ],
          },
        }),
      ),
    );
  };
  const adapter = new YahooFantasyReadOnlyAdapter({
    accessToken: 'private-access-token',
    httpClient: new ProviderHttpClient({}, { fetch }),
    now: () => new Date('2026-09-04T12:00:00.000Z'),
  });

  const result = await adapter.fetchLeague('449.l.12345');

  assert.equal(authorization, 'Bearer private-access-token');
  assert.equal(result.capture.provider, 'yahoo');
  assert.equal(result.capture.capturedAt, '2026-09-04T12:00:00.000Z');
  assert.equal(result.capture.retainUntil, '2026-09-05T12:00:00.000Z');
  assert.equal(result.normalization.contract.liveValidated, false);
});

void test('builds an authorization URL and verifies hashed state', async () => {
  const state = createOAuthState();
  const stateHash = await hashOAuthState(state);
  const url = buildYahooAuthorizationUrl({
    clientId: 'client-id',
    redirectUri: 'https://temporary.example/yahoo/callback',
    state,
  });

  assert.equal(url.origin, 'https://api.login.yahoo.com');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), state);
  assert.equal(await verifyOAuthState(state, stateHash), true);
  assert.equal(await verifyOAuthState(`${state}0`, stateHash), false);
});

void test('uses a rotated Yahoo refresh token and otherwise retains the prior token', () => {
  assert.equal(
    resolveYahooRefreshToken({
      previousRefreshToken: 'old-token',
      responseRefreshToken: 'new-token',
    }),
    'new-token',
  );
  assert.equal(
    resolveYahooRefreshToken({ previousRefreshToken: 'old-token' }),
    'old-token',
  );
  assert.throws(() => resolveYahooRefreshToken({}), /refresh token/);
});

void test('builds Yahoo player paths with status and sort filters', () => {
  assert.equal(
    buildYahooFantasyPath({
      kind: 'players',
      leagueKey: '449.l.12345',
      status: 'A',
      sort: 'OR',
      count: 25,
    }),
    '/fantasy/v2/league/449.l.12345/players;count=25;status=A;sort=OR?format=json',
  );
  assert.throws(
    () =>
      buildYahooFantasyPath({
        kind: 'players',
        leagueKey: '449.l.12345',
        status: 'X' as 'A',
      }),
    /status must be one of/,
  );
});

void test('normalizes Yahoo team FAAB balance and current-login manager', () => {
  const result = normalizeYahooTeams({
    fantasy_content: {
      league: [
        { league_key: '449.l.12345' },
        {
          teams: {
            0: {
              team: [
                {
                  team_key: '449.l.12345.t.1',
                  team_id: '1',
                  name: 'Ladd to the Bone',
                  faab_balance: '87',
                },
                {
                  managers: {
                    0: {
                      manager: { nickname: 'Nick', is_current_login: '1' },
                    },
                  },
                },
              ],
            },
            1: {
              team: [
                {
                  team_key: '449.l.12345.t.2',
                  team_id: '2',
                  name: 'Breeces Pieces',
                },
                {
                  managers: {
                    0: { manager: { nickname: 'Breeces' } },
                  },
                },
              ],
            },
          },
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value[0]?.faabBalance, 87);
    assert.equal(result.value[0]?.isCurrentLogin, true);
    assert.equal(result.value[1]?.faabBalance, null);
    assert.equal(result.value[1]?.isCurrentLogin, null);
  }
});

void test('normalizes Yahoo transaction FAAB bids and player names', () => {
  const result = normalizeYahooTransactions({
    fantasy_content: {
      league: [
        { league_key: '449.l.12345' },
        {
          transactions: {
            0: {
              transaction: [
                {
                  transaction_key: '449.l.12345.tr.10',
                  transaction_id: '10',
                  type: 'add/drop',
                  status: 'successful',
                  timestamp: '1788480000',
                  faab_bid: '23',
                  players: {
                    0: {
                      player: [
                        {
                          player_key: '449.p.9999',
                          name: { full: 'Tetairoa McMillan' },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value[0]?.faabBid, 23);
    assert.deepEqual(result.value[0]?.playerNames, ['Tetairoa McMillan']);
  }
});

void test('normalizes NBA leagues alongside NFL leagues from game_keys=nfl,nba', () => {
  const payload = {
    fantasy_content: {
      users: {
        0: {
          user: [
            { guid: 'private-guid' },
            {
              games: {
                0: {
                  game: [
                    { game_key: '449' },
                    {
                      leagues: {
                        0: {
                          league: [
                            {
                              league_key: '449.l.12345',
                              league_id: '12345',
                              name: 'HB KIDS',
                              season: '2025',
                            },
                            { current_week: '7', is_finished: 0 },
                          ],
                        },
                        count: 1,
                      },
                    },
                  ],
                },
                1: {
                  game: [
                    { game_key: '418' },
                    {
                      leagues: {
                        0: {
                          league: [
                            {
                              league_key: '418.l.67890',
                              league_id: '67890',
                              name: 'Hoops League',
                              season: '2025',
                              url: 'https://basketball.fantasysports.yahoo.com/nba/67890',
                            },
                            { current_week: '3', is_finished: 0 },
                          ],
                        },
                        count: 1,
                      },
                    },
                  ],
                },
                count: 2,
              },
            },
          ],
        },
      },
    },
  };

  const result = normalizeYahooLeagues(payload);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.length, 2);
  const keys = result.value.map((league) => league.providerLeagueKey);
  assert.ok(keys.includes('449.l.12345'));
  assert.ok(keys.includes('418.l.67890'));
  const nba = result.value.find(
    (league) => league.providerLeagueKey === '418.l.67890',
  );
  assert.equal(nba?.name, 'Hoops League');
  assert.equal(nba?.season, 2025);
  assert.equal(nba?.currentWeek, 3);
  assert.equal(
    nba?.url,
    'https://basketball.fantasysports.yahoo.com/nba/67890',
  );
});

void test('normalizes NBA roster positions without claiming live validation', () => {
  const payload = {
    fantasy_content: {
      team: [
        { team_key: '418.l.67890.t.1' },
        {
          roster: {
            players: {
              0: {
                player: [
                  {
                    player_key: '418.p.1234',
                    player_id: '1234',
                    name: { full: 'Example Point Guard' },
                    editorial_team_abbr: 'LAL',
                    display_position: 'PG',
                  },
                  {
                    eligible_positions: [
                      { position: 'PG' },
                      { position: 'G' },
                      { position: 'UTIL' },
                    ],
                    selected_position: { position: 'PG', week: '3' },
                  },
                ],
              },
              count: 1,
            },
          },
        },
      ],
    },
  };

  const players = normalizeYahooPlayers(payload);
  assert.equal(players.ok, true);
  if (players.ok) {
    assert.equal(players.value[0]?.displayPosition, 'PG');
    assert.deepEqual(players.value[0]?.eligiblePositions, [
      'PG',
      'G',
      'UTIL',
    ]);
  }

  const roster = normalizeYahooRoster(payload);
  assert.equal(roster.ok, true);
  if (roster.ok) {
    assert.equal(roster.value[0]?.selectedPosition, 'PG');
    assert.equal(roster.value[0]?.week, 3);
  }
});

void test('normalizes basketball league settings roster positions', () => {
  const payload = {
    fantasy_content: {
      league: [
        { league_key: '418.l.67890' },
        {
          settings: [
            { draft_type: 'snake', is_auction_draft: '0' },
            {
              roster_positions: [
                {
                  roster_position: {
                    position: 'PG',
                    position_type: 'O',
                    count: 2,
                  },
                },
                {
                  roster_position: {
                    position: 'UTIL',
                    position_type: 'O',
                    count: 2,
                  },
                },
                {
                  roster_position: {
                    position: 'BN',
                    position_type: 'BN',
                    count: 4,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const result = normalizeYahooSettings(payload);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.draftType, 'snake');
  assert.equal(result.value.isAuctionDraft, false);
  assert.deepEqual(
    result.value.rosterPositions.map((p) => [p.position, p.count]),
    [
      ['PG', 2],
      ['UTIL', 2],
      ['BN', 4],
    ],
  );
});

void test('rejects settings payloads without roster positions', () => {
  const result = normalizeYahooSettings({
    fantasy_content: { league: [{ league_key: '418.l.67890' }] },
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues[0]?.code, 'unknown_shape');
});

void test('normalizes Yahoo team standings', () => {
  const payload = {
    fantasy_content: {
      league: [
        { league_key: '418.l.67890' },
        {
          standings: [
            {
              teams: {
                0: {
                  team: [
                    {
                      team_key: '418.l.67890.t.1',
                      team_id: '1',
                      name: 'Nick Hoops',
                    },
                    {
                      team_standings: {
                        rank: '1',
                        outcome_totals: {
                          wins: '8',
                          losses: '2',
                          ties: '0',
                        },
                        points_for: '1234.5',
                      },
                    },
                  ],
                },
                count: 1,
              },
            },
          ],
        },
      ],
    },
  };

  const result = normalizeYahooStandings(payload);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, [
    {
      teamKey: '418.l.67890.t.1',
      wins: 8,
      losses: 2,
      ties: 0,
      pointsFor: 1234.5,
    },
  ]);
});
