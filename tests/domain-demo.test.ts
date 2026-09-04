import assert from 'node:assert/strict';
import test from 'node:test';

import { DEMO_LEAGUES, DEMO_TIMESTAMP } from '../domain/demo.ts';
import { optimizeLineup } from '../domain/trades.ts';

void test('demo leagues are isolated, complete auction fixtures', () => {
  assert.deepEqual(
    DEMO_LEAGUES.map((league) => league.name),
    ['Neighborhood League', 'Friday Night Lights'],
  );
  assert.deepEqual(
    DEMO_LEAGUES.map((league) => league.teamCount),
    [8, 10],
  );

  const allLeagueIds = new Set(DEMO_LEAGUES.map((league) => league.id));
  const allTeamIds = new Set<string>();
  const allPlayerIds = new Set<string>();
  assert.equal(allLeagueIds.size, DEMO_LEAGUES.length);

  for (const league of DEMO_LEAGUES) {
    assert.equal(league.source, 'demo');
    assert.equal(league.snapshotAt, DEMO_TIMESTAMP);
    assert.equal(league.draftType, 'auction');
    assert.equal(league.superflex, true);
    assert.equal(league.budget, 200);
    assert.equal(league.rosterLimit, 14);
    assert.equal(league.startingSlots.length, 8);
    assert.equal(league.teams.length, league.teamCount);
    assert.equal(league.players.length, league.teamCount * league.rosterLimit);

    const playersById = new Map(
      league.players.map((player) => [player.id, player]),
    );
    for (const player of league.players) {
      assert.equal(player.projectedAt, DEMO_TIMESTAMP);
      assert.equal(
        allPlayerIds.has(player.id),
        false,
        `duplicate player ID ${player.id}`,
      );
      allPlayerIds.add(player.id);
    }

    for (const team of league.teams) {
      assert.equal(
        allTeamIds.has(team.id),
        false,
        `duplicate team ID ${team.id}`,
      );
      allTeamIds.add(team.id);
      assert.equal(team.playerIds.length, league.rosterLimit);

      const roster = team.playerIds.map((playerId) => {
        const player = playersById.get(playerId);
        assert.ok(player, `missing player ${playerId}`);
        return player;
      });
      const auctionSpend = roster.reduce(
        (total, player) => total + player.auctionCost,
        0,
      );
      assert.ok(
        auctionSpend <= league.budget,
        `${team.name} exceeds the auction budget`,
      );

      const lineup = optimizeLineup(roster, league.startingSlots);
      assert.notEqual(lineup.total, null);
      assert.equal(lineup.assignments.length, league.startingSlots.length);
      assert.equal(
        new Set(lineup.assignments.map((assignment) => assignment.playerId))
          .size,
        lineup.assignments.length,
      );
    }
  }
});
