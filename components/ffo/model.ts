import type { League, TradeAnalysis } from '@/domain/types';
import { optimizeLineup as optimizeDomainLineup } from '@/domain/trades';

export type LeaguePlayer = League['players'][number];
export type LeagueTeam = League['teams'][number];
export type LineupAssignment = {
  slotId: string;
  slotLabel: string;
  player: LeaguePlayer | null;
};
export type DisplayLineup = {
  assignments: LineupAssignment[];
  total: number | null;
  missing: string[];
};

export const compactNumber = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
});

export function formatProjection(value: number | null) {
  return value === null ? '—' : compactNumber.format(value);
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date);
}

export function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function getTeam(league: League, teamId: string) {
  return league.teams.find((team) => team.id === teamId);
}

export function getPlayer(league: League, playerId: string) {
  return league.players.find((player) => player.id === playerId);
}

export function getTeamPlayers(league: League, teamId: string) {
  const team = getTeam(league, teamId);
  if (!team) return [];
  const ids = new Set(team.playerIds);
  return league.players.filter((player) => ids.has(player.id));
}

export function optimizeLineup(
  players: LeaguePlayer[],
  slots: League['startingSlots'],
): DisplayLineup {
  const optimized = optimizeDomainLineup(players, slots);
  const assignedBySlot = new Map(
    optimized.assignments.map((assignment) => [assignment.slotId, assignment]),
  );
  const playersById = new Map(players.map((player) => [player.id, player]));

  return {
    total: optimized.total,
    missing: optimized.missing,
    assignments: slots.map((slot) => {
      const assignment = assignedBySlot.get(slot.id);
      return {
        slotId: slot.id,
        slotLabel: slot.label,
        player: assignment ? playersById.get(assignment.playerId) ?? null : null,
      };
    }),
  };
}

export function lineupTotal(lineup: DisplayLineup) {
  return lineup.total;
}

export function rosterSpend(players: LeaguePlayer[]) {
  return players.reduce((total, player) => total + player.auctionCost, 0);
}

export function rosterStrengths(players: LeaguePlayer[]) {
  const groups = new Map<string, LeaguePlayer[]>();
  for (const player of players) {
    const group = groups.get(player.position) ?? [];
    group.push(player);
    groups.set(player.position, group);
  }

  return [...groups.entries()]
    .map(([position, positionPlayers]) => {
      const projections = positionPlayers.map((player) => player.rosProjection);
      const complete = projections.every((value): value is number => value !== null);
      return {
        position,
        score: complete
          ? projections.reduce((total, value) => total + value, 0) /
            Math.max(1, projections.length)
          : null,
        count: positionPlayers.length,
      };
    })
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
}

export function verdictLabel(verdict: TradeAnalysis['verdict']) {
  switch (verdict) {
    case 'improves':
      return 'Improves your lineup';
    case 'balanced':
      return 'Balanced construction';
    case 'weakens':
      return 'Weakens your lineup';
    default:
      return 'Analysis unavailable';
  }
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
