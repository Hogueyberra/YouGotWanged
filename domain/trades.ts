import { DomainError } from './errors.ts';
import type {
  League,
  LineupAssignment,
  OptimizedLineup,
  Player,
  StartingSlot,
  Team,
  TradeAnalysis,
  TradeRequest,
  TradeSideAnalysis,
} from './types.ts';

const ANALYSIS_VERSION = 'demo-trade-analysis-v1';
const COMPARISON_EPSILON = 0.01;

interface LineupPlan {
  total: number;
  assignments: LineupAssignment[];
}

function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

function parseTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new DomainError(
      'INVALID_TIMESTAMP',
      `${label} must be a valid timestamp.`,
    );
  }
  return timestamp;
}

function isEligible(player: Player, slot: StartingSlot): boolean {
  return player.eligiblePositions.some((position) =>
    slot.eligible.includes(position),
  );
}

function betterPlan(
  candidate: LineupPlan,
  current: LineupPlan | null,
): boolean {
  if (current === null) return true;
  if (candidate.assignments.length !== current.assignments.length) {
    return candidate.assignments.length > current.assignments.length;
  }
  return candidate.total > current.total + Number.EPSILON;
}

/**
 * Finds the exact maximum-projection legal assignment. Missing projections are
 * never coerced to zero, and auction cost is deliberately ignored.
 */
export function optimizeLineup(
  players: readonly Player[],
  slots: readonly StartingSlot[],
): OptimizedLineup {
  const duplicatePlayerId = firstDuplicate(players.map((player) => player.id));
  if (duplicatePlayerId) {
    throw new DomainError(
      'DUPLICATE_PLAYER_ID',
      `Player ${duplicatePlayerId} appears more than once in the lineup pool.`,
    );
  }

  const duplicateSlotId = firstDuplicate(slots.map((slot) => slot.id));
  if (duplicateSlotId) {
    throw new DomainError(
      'DUPLICATE_SLOT_ID',
      `Starting slot ${duplicateSlotId} appears more than once.`,
    );
  }

  const startablePlayers = players.filter(
    (player) =>
      player.status !== 'out' && slots.some((slot) => isEligible(player, slot)),
  );
  const missingProjectionPlayers = startablePlayers.filter(
    (player) =>
      player.weeklyProjection === null ||
      !Number.isFinite(player.weeklyProjection),
  );
  const projectedPlayers = startablePlayers
    .filter(
      (player): player is Player & { weeklyProjection: number } =>
        player.weeklyProjection !== null &&
        Number.isFinite(player.weeklyProjection),
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  if (slots.length > 30) {
    throw new DomainError(
      'INVALID_LEAGUE',
      'The lineup optimizer supports at most 30 starting slots.',
    );
  }

  // The mask tracks occupied slots. Processing one player at a time guarantees
  // that no player can be assigned twice and bounds work by players * 2^slots.
  let plans = new Map<number, LineupPlan>([[0, { total: 0, assignments: [] }]]);
  for (const player of projectedPlayers) {
    const nextPlans = new Map(plans);
    for (const [mask, plan] of plans) {
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const slotBit = 1 << slotIndex;
        if ((mask & slotBit) !== 0 || !isEligible(player, slots[slotIndex])) {
          continue;
        }

        const nextMask = mask | slotBit;
        const candidate: LineupPlan = {
          total: plan.total + player.weeklyProjection,
          assignments: [
            ...plan.assignments,
            {
              slotId: slots[slotIndex].id,
              playerId: player.id,
              points: player.weeklyProjection,
            },
          ],
        };
        const current = nextPlans.get(nextMask) ?? null;
        if (betterPlan(candidate, current)) nextPlans.set(nextMask, candidate);
      }
    }
    plans = nextPlans;
  }

  let best: LineupPlan | null = null;
  for (const plan of plans.values()) {
    if (betterPlan(plan, best)) best = plan;
  }
  const resolvedBest = best ?? { total: 0, assignments: [] };
  const slotOrder = new Map(slots.map((slot, index) => [slot.id, index]));
  resolvedBest.assignments.sort(
    (left, right) =>
      (slotOrder.get(left.slotId) ?? 0) - (slotOrder.get(right.slotId) ?? 0),
  );
  const assignedSlotIds = new Set(
    resolvedBest.assignments.map((assignment) => assignment.slotId),
  );
  const missing = [
    ...missingProjectionPlayers.map(
      (player) => `Projection unavailable for ${player.name} (${player.id}).`,
    ),
    ...slots
      .filter((slot) => !assignedSlotIds.has(slot.id))
      .map(
        (slot) =>
          `No projected legal assignment is available for ${slot.label}.`,
      ),
  ];

  return {
    total: missing.length === 0 ? Number(resolvedBest.total.toFixed(2)) : null,
    assignments: resolvedBest.assignments,
    missing,
  };
}

function validateLeague(league: League): Map<string, Player> {
  const duplicateTeamId = firstDuplicate(league.teams.map((team) => team.id));
  if (duplicateTeamId) {
    throw new DomainError(
      'DUPLICATE_TEAM_ID',
      `Team ${duplicateTeamId} appears more than once in league ${league.id}.`,
    );
  }

  const duplicatePlayerId = firstDuplicate(
    league.players.map((player) => player.id),
  );
  if (duplicatePlayerId) {
    throw new DomainError(
      'DUPLICATE_PLAYER_ID',
      `Player ${duplicatePlayerId} appears more than once in league ${league.id}.`,
    );
  }

  if (league.teamCount !== league.teams.length) {
    throw new DomainError(
      'INVALID_LEAGUE',
      `League ${league.id} declares ${league.teamCount} teams but contains ${league.teams.length}.`,
    );
  }

  if (!league.teams.some((team) => team.id === league.myTeamId)) {
    throw new DomainError(
      'INVALID_LEAGUE',
      `League ${league.id} does not contain its configured current team.`,
    );
  }

  const playersById = new Map(
    league.players.map((player) => [player.id, player]),
  );
  const ownerByPlayerId = new Map<string, string>();

  for (const team of league.teams) {
    const duplicateRosterPlayer = firstDuplicate(team.playerIds);
    if (duplicateRosterPlayer) {
      throw new DomainError(
        'DUPLICATE_PLAYER_ID',
        `Player ${duplicateRosterPlayer} appears twice on team ${team.id}.`,
      );
    }

    for (const playerId of team.playerIds) {
      if (!playersById.has(playerId)) {
        throw new DomainError(
          'UNKNOWN_PLAYER',
          `Team ${team.id} references unknown player ${playerId}.`,
        );
      }

      const existingOwner = ownerByPlayerId.get(playerId);
      if (existingOwner) {
        throw new DomainError(
          'INVALID_LEAGUE',
          `Player ${playerId} is assigned to both ${existingOwner} and ${team.id}.`,
        );
      }
      ownerByPlayerId.set(playerId, team.id);
    }
  }

  return playersById;
}

function requireTeam(league: League, teamId: string): Team {
  const team = league.teams.find((candidate) => candidate.id === teamId);
  if (!team) {
    throw new DomainError(
      'INVALID_TEAM',
      `Team ${teamId} does not belong to league ${league.id}.`,
    );
  }
  return team;
}

function validateRequest(
  league: League,
  request: TradeRequest,
  playersById: ReadonlyMap<string, Player>,
): { fromTeam: Team; toTeam: Team; asOfTimestamp: number } {
  if (request.leagueId !== league.id) {
    throw new DomainError(
      'INVALID_LEAGUE',
      `Trade targets league ${request.leagueId}, not ${league.id}.`,
    );
  }

  const asOfTimestamp = parseTimestamp(request.asOf, 'Trade as_of');
  const snapshotTimestamp = parseTimestamp(
    league.snapshotAt,
    'League snapshotAt',
  );
  if (snapshotTimestamp > asOfTimestamp) {
    throw new DomainError(
      'INVALID_LEAGUE_SNAPSHOT',
      `League snapshot ${league.snapshotAt} is later than trade as_of ${request.asOf}.`,
    );
  }

  const fromTeam = requireTeam(league, request.fromTeamId);
  const toTeam = requireTeam(league, request.toTeamId);
  if (fromTeam.id === toTeam.id) {
    throw new DomainError('SAME_TEAM', 'A trade requires two different teams.');
  }

  if (
    request.givePlayerIds.length === 0 ||
    request.receivePlayerIds.length === 0
  ) {
    throw new DomainError(
      'EMPTY_TRADE',
      'A trade must include at least one player from each team.',
    );
  }

  const duplicateGive = firstDuplicate(request.givePlayerIds);
  const duplicateReceive = firstDuplicate(request.receivePlayerIds);
  if (duplicateGive || duplicateReceive) {
    const duplicate = duplicateGive ?? duplicateReceive;
    throw new DomainError(
      'DUPLICATE_PLAYER_ID',
      `Player ${duplicate} appears more than once on one side of the trade.`,
    );
  }

  const receivingIds = new Set(request.receivePlayerIds);
  const playerOnBothSides = request.givePlayerIds.find((id) =>
    receivingIds.has(id),
  );
  if (playerOnBothSides) {
    throw new DomainError(
      'PLAYER_ON_BOTH_SIDES',
      `Player ${playerOnBothSides} appears on both sides of the trade.`,
    );
  }

  for (const playerId of [
    ...request.givePlayerIds,
    ...request.receivePlayerIds,
  ]) {
    if (!playersById.has(playerId)) {
      throw new DomainError(
        'UNKNOWN_PLAYER',
        `Trade references unknown player ${playerId}.`,
      );
    }
  }

  const fromRoster = new Set(fromTeam.playerIds);
  for (const playerId of request.givePlayerIds) {
    if (!fromRoster.has(playerId)) {
      throw new DomainError(
        'INVALID_OWNERSHIP',
        `${fromTeam.name} does not own player ${playerId}.`,
      );
    }
  }

  const toRoster = new Set(toTeam.playerIds);
  for (const playerId of request.receivePlayerIds) {
    if (!toRoster.has(playerId)) {
      throw new DomainError(
        'INVALID_OWNERSHIP',
        `${toTeam.name} does not own player ${playerId}.`,
      );
    }
  }

  return { fromTeam, toTeam, asOfTimestamp };
}

function postTradeRosterIds(
  team: Team,
  outgoingIds: readonly string[],
  incomingIds: readonly string[],
): string[] {
  const outgoing = new Set(outgoingIds);
  return [
    ...team.playerIds.filter((playerId) => !outgoing.has(playerId)),
    ...incomingIds,
  ];
}

function prepareObservations(
  players: readonly Player[],
  slots: readonly StartingSlot[],
  asOfTimestamp: number,
  missingSignals: Set<string>,
  warnings: Set<string>,
): Map<string, Player> {
  const prepared = new Map<string, Player>();

  for (const player of players) {
    const projectedAt = parseTimestamp(
      player.projectedAt,
      `projectedAt for player ${player.id}`,
    );
    const relevantToLineup = slots.some((slot) => isEligible(player, slot));

    if (projectedAt > asOfTimestamp) {
      if (relevantToLineup) {
        missingSignals.add(
          `${player.name}'s projection was published after as_of and was excluded.`,
        );
      }
      prepared.set(player.id, {
        ...player,
        weeklyProjection: null,
        rosProjection: null,
      });
      continue;
    }

    if (relevantToLineup && player.weeklyProjection === null) {
      missingSignals.add(`${player.name} has no weekly projection.`);
    }
    if (relevantToLineup && player.rosProjection === null) {
      missingSignals.add(`${player.name} has no rest-of-season projection.`);
    }
    if (relevantToLineup && player.status === 'out') {
      warnings.add(
        `${player.name} is marked out in the synthetic demo snapshot.`,
      );
    }

    prepared.set(player.id, player);
  }

  return prepared;
}

function playersForIds(
  ids: readonly string[],
  players: ReadonlyMap<string, Player>,
): Player[] {
  return ids.map((id) => {
    const player = players.get(id);
    if (!player) {
      // All IDs are validated before this helper is called.
      throw new DomainError('UNKNOWN_PLAYER', `Unknown player ${id}.`);
    }
    return player;
  });
}

function asRosPlayers(players: readonly Player[]): Player[] {
  return players.map((player) => ({
    ...player,
    weeklyProjection: player.rosProjection,
  }));
}

function difference(
  after: number | null,
  before: number | null,
): number | null {
  if (after === null || before === null) return null;
  return Number((after - before).toFixed(2));
}

function recordLineupMissing(
  label: string,
  lineup: OptimizedLineup,
  missingSignals: Set<string>,
): void {
  for (const missing of lineup.missing) {
    missingSignals.add(`${label}: ${missing}`);
  }
}

function analyzeSide(
  beforePlayers: readonly Player[],
  afterPlayers: readonly Player[],
  slots: readonly StartingSlot[],
  rosterLimit: number,
  missingSignals: Set<string>,
  label: string,
): TradeSideAnalysis {
  const beforeWeekly = optimizeLineup(beforePlayers, slots);
  const afterWeekly = optimizeLineup(afterPlayers, slots);
  const beforeRos = optimizeLineup(asRosPlayers(beforePlayers), slots);
  const afterRos = optimizeLineup(asRosPlayers(afterPlayers), slots);

  recordLineupMissing(`${label} before trade`, beforeWeekly, missingSignals);
  recordLineupMissing(`${label} after trade`, afterWeekly, missingSignals);
  recordLineupMissing(`${label} ROS before trade`, beforeRos, missingSignals);
  recordLineupMissing(`${label} ROS after trade`, afterRos, missingSignals);

  return {
    before: beforeWeekly.total,
    after: afterWeekly.total,
    lineupDelta: difference(afterWeekly.total, beforeWeekly.total),
    rosDelta: difference(afterRos.total, beforeRos.total),
    openRosterSlots: Math.max(0, rosterLimit - afterPlayers.length),
  };
}

function formatDelta(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}`;
}

function determineVerdict(
  side: TradeSideAnalysis,
  capacityExceeded: boolean,
): TradeAnalysis['verdict'] {
  if (capacityExceeded || side.lineupDelta === null || side.rosDelta === null) {
    return 'unavailable';
  }

  const weekly = side.lineupDelta;
  const ros = side.rosDelta;
  const weeklyPositive = weekly > COMPARISON_EPSILON;
  const weeklyNegative = weekly < -COMPARISON_EPSILON;
  const rosPositive = ros > COMPARISON_EPSILON;
  const rosNegative = ros < -COMPARISON_EPSILON;

  if ((weeklyPositive && !rosNegative) || (rosPositive && !weeklyNegative)) {
    return 'improves';
  }
  if ((weeklyNegative && !rosPositive) || (rosNegative && !weeklyPositive)) {
    return 'weakens';
  }
  return 'balanced';
}

function buildSummary(
  verdict: TradeAnalysis['verdict'],
  side: TradeSideAnalysis,
): string {
  if (
    verdict === 'unavailable' ||
    side.lineupDelta === null ||
    side.rosDelta === null
  ) {
    return 'The trade cannot be graded because the available pre-trade evidence is incomplete or the resulting roster requires an unspecified drop.';
  }

  const weekly = formatDelta(side.lineupDelta);
  const ros = formatDelta(side.rosDelta);
  if (verdict === 'improves') {
    return `The synthetic projections improve the best legal lineup by ${weekly} weekly points and ${ros} rest-of-season starter points.`;
  }
  if (verdict === 'weakens') {
    return `The synthetic projections weaken the best legal lineup by ${weekly} weekly points and ${ros} rest-of-season starter points.`;
  }
  return `The synthetic projections show a balanced or mixed trade-off: ${weekly} weekly lineup points and ${ros} rest-of-season starter points.`;
}

export function analyzeTrade(
  league: League,
  request: TradeRequest,
): TradeAnalysis {
  const playersById = validateLeague(league);
  const { fromTeam, toTeam, asOfTimestamp } = validateRequest(
    league,
    request,
    playersById,
  );

  const fromAfterIds = postTradeRosterIds(
    fromTeam,
    request.givePlayerIds,
    request.receivePlayerIds,
  );
  const toAfterIds = postTradeRosterIds(
    toTeam,
    request.receivePlayerIds,
    request.givePlayerIds,
  );
  const relevantIds = new Set([
    ...fromTeam.playerIds,
    ...toTeam.playerIds,
    ...fromAfterIds,
    ...toAfterIds,
  ]);
  const relevantPlayers = [...relevantIds].map((id) => {
    const player = playersById.get(id);
    if (!player)
      throw new DomainError('UNKNOWN_PLAYER', `Unknown player ${id}.`);
    return player;
  });

  const warnings = new Set<string>([
    'Synthetic demo projections are invented for product testing and are not current NFL facts.',
    'Auction draft prices are historical costs and are not used as current trade value.',
  ]);
  const missingSignals = new Set<string>();
  const observations = prepareObservations(
    relevantPlayers,
    league.startingSlots,
    asOfTimestamp,
    missingSignals,
    warnings,
  );

  const fromCapacityExceeded = fromAfterIds.length > league.rosterLimit;
  const toCapacityExceeded = toAfterIds.length > league.rosterLimit;
  if (fromCapacityExceeded) {
    warnings.add(
      `${fromTeam.name} would be ${fromAfterIds.length - league.rosterLimit} player(s) over the roster limit; a drop is not modeled.`,
    );
    missingSignals.add(`${fromTeam.name} requires a post-trade drop decision.`);
  }
  if (toCapacityExceeded) {
    warnings.add(
      `${toTeam.name} would be ${toAfterIds.length - league.rosterLimit} player(s) over the roster limit; a drop is not modeled.`,
    );
    missingSignals.add(`${toTeam.name} requires a post-trade drop decision.`);
  }

  const from = analyzeSide(
    playersForIds(fromTeam.playerIds, observations),
    playersForIds(fromAfterIds, observations),
    league.startingSlots,
    league.rosterLimit,
    missingSignals,
    fromTeam.name,
  );
  const to = analyzeSide(
    playersForIds(toTeam.playerIds, observations),
    playersForIds(toAfterIds, observations),
    league.startingSlots,
    league.rosterLimit,
    missingSignals,
    toTeam.name,
  );
  const verdict = determineVerdict(from, fromCapacityExceeded);
  const inputs = structuredClone({
    teams: [fromTeam, toTeam] as [Team, Team],
    players: [...observations.values()],
    startingSlots: league.startingSlots,
    rosterLimit: league.rosterLimit,
    scoringLabel: league.scoringLabel,
    week: league.week,
    season: league.season,
    source: league.source,
    snapshotAt: league.snapshotAt,
  });

  return {
    version: ANALYSIS_VERSION,
    asOf: request.asOf,
    leagueId: league.id,
    fromTeamId: fromTeam.id,
    toTeamId: toTeam.id,
    givePlayerIds: [...request.givePlayerIds],
    receivePlayerIds: [...request.receivePlayerIds],
    verdict,
    summary: buildSummary(verdict, from),
    from,
    to,
    warnings: [...warnings],
    evidence: {
      source:
        'Synthetic demo data (invented projections; not Yahoo or live NFL data)',
      capturedAt: league.snapshotAt,
    },
    inputs,
    missingSignals: [...missingSignals],
  };
}
