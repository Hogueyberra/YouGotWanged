import type {
  ProviderLeague,
  ProviderRosterEntry,
  ProviderTeam,
  YahooLeagueSettings,
  YahooTeamStanding,
} from '../integrations/providers/contracts.ts';
import type {
  League,
  Player,
  Position,
  Sport,
  StartingSlot,
  Team,
} from '../domain/types.ts';

export type DetectedSport = Sport | 'unknown';

export interface SportDetectionInput {
  leagueKey: string;
  gameKey: string | null;
  url: string | null;
  rosterPositions: readonly string[];
}

/**
 * Detects a Yahoo league's sport from its key, game key, league URL, and
 * roster slots — in that order of confidence. Returns 'unknown' rather than
 * guessing when nothing matches.
 */
export function detectYahooSport(input: SportDetectionInput): DetectedSport {
  const key = input.leagueKey.toLowerCase();
  if (key.includes('.nfl.') || /(^|[._-])nfl([._-]|$)/.test(key))
    return 'football';
  if (key.includes('.nba.') || /(^|[._-])nba([._-]|$)/.test(key))
    return 'basketball';

  const gameKey = (input.gameKey ?? '').toLowerCase();
  if (gameKey.includes('nfl')) return 'football';
  if (gameKey.includes('nba')) return 'basketball';

  const url = (input.url ?? '').toLowerCase();
  if (url.includes('football.fantasysports.yahoo.com')) return 'football';
  if (url.includes('basketball.fantasysports.yahoo.com')) return 'basketball';

  const positions = new Set(
    input.rosterPositions.map((position) => position.trim().toUpperCase()),
  );
  const basketballSlots = ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'UTIL'];
  const footballSlots = [
    'QB',
    'RB',
    'WR',
    'TE',
    'K',
    'DEF',
    'D/ST',
    'W/R/T',
    'Q/W/R/T',
    'FLEX',
  ];
  if (basketballSlots.some((slot) => positions.has(slot))) return 'basketball';
  if (footballSlots.some((slot) => positions.has(slot))) return 'football';

  return 'unknown';
}

/** Slots that never start: bench, injured reserve, and similar designations. */
const NON_STARTER_SLOTS = new Set(['BN', 'IR', 'IL', 'IR+', 'NA', 'DL', 'DTD']);

/**
 * Maps a Yahoo roster position to the domain positions eligible to fill it.
 * Returns null for bench/injured slots and unrecognized positions.
 */
function slotEligiblePositions(position: string): Position[] | null {
  const v = position.trim().toUpperCase();
  if (NON_STARTER_SLOTS.has(v)) return null;
  switch (v) {
    case 'QB':
      return ['QB'];
    case 'RB':
      return ['RB'];
    case 'WR':
      return ['WR'];
    case 'TE':
      return ['TE'];
    case 'K':
      return ['K'];
    case 'DEF':
    case 'D/ST':
      return ['DEF'];
    case 'W/R/T':
    case 'FLEX':
      return ['RB', 'WR', 'TE'];
    case 'Q/W/R/T':
    case 'SUPERFLEX':
      return ['QB', 'RB', 'WR', 'TE'];
    case 'PG':
      return ['PG'];
    case 'SG':
      return ['SG'];
    case 'SF':
      return ['SF'];
    case 'PF':
      return ['PF'];
    case 'C':
      return ['C'];
    case 'G':
      return ['PG', 'SG'];
    case 'F':
      return ['SF', 'PF'];
    case 'UTIL':
      return ['PG', 'SG', 'SF', 'PF', 'C'];
    default:
      return null;
  }
}

function toDomainPosition(value: string | null): Position | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (v === 'D/ST') return 'DEF';
  switch (v) {
    case 'QB':
    case 'RB':
    case 'WR':
    case 'TE':
    case 'K':
    case 'DEF':
    case 'PG':
    case 'SG':
    case 'SF':
    case 'PF':
    case 'C':
      return v;
    default:
      return null;
  }
}

/**
 * Reduces Yahoo eligible-position strings to the base domain positions the
 * player can actually play. Slot aliases (W/R/T, UTIL, BN, …) are not player
 * positions — slot eligibility is enforced on the slot side — so they are
 * dropped rather than expanded.
 */
function expandEligiblePositions(values: readonly string[]): Position[] {
  const out = new Set<Position>();
  for (const raw of values) {
    const direct = toDomainPosition(raw.trim().toUpperCase());
    if (direct) out.add(direct);
  }
  return [...out];
}

function toPlayerStatus(value: string | null): Player['status'] {
  if (!value) return 'healthy';
  const v = value.trim().toUpperCase();
  if (v === 'Q' || v === 'QUESTIONABLE' || v === 'D' || v === 'DOUBTFUL')
    return 'questionable';
  if (
    v === 'O' ||
    v === 'OUT' ||
    v === 'IR' ||
    v === 'INJURED RESERVE' ||
    v === 'SUS' ||
    v === 'SUSPENDED' ||
    v === 'NA' ||
    v === 'NOT ACTIVE' ||
    v === 'PUP' ||
    v === 'DNP'
  )
    return 'out';
  return 'healthy';
}

function teamAbbreviation(name: string, fallback: string | null): string {
  if (fallback && fallback.trim()) return fallback.trim().toUpperCase();
  const initials = name
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
  return initials || '—';
}

function mapStartingSlots(
  settings: YahooLeagueSettings,
  issues: string[],
): StartingSlot[] {
  const slots: StartingSlot[] = [];
  for (const setting of settings.rosterPositions) {
    const eligible = slotEligiblePositions(setting.position);
    if (eligible === null) continue;
    const count = Math.max(0, setting.count);
    if (count === 0) {
      issues.push(
        `Roster position ${setting.position} has no count; skipped.`,
      );
      continue;
    }
    if (count > 10) {
      issues.push(
        `Roster position ${setting.position} has an implausible count of ${count}; skipped.`,
      );
      continue;
    }
    const slug = setting.position
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 12);
    for (let i = 0; i < count; i += 1) {
      const label =
        count === 1 ? setting.position : `${setting.position} ${i + 1}`;
      slots.push({
        id: `yahoo-${slug}-${i + 1}`,
        label,
        eligible: [...eligible],
      });
    }
  }
  return slots;
}

export interface YahooLeagueDetail {
  leagueKey: string;
  league: ProviderLeague;
  settings: YahooLeagueSettings;
  standings: readonly YahooTeamStanding[];
  teams: readonly ProviderTeam[];
  rosters: Record<string, readonly ProviderRosterEntry[] | null>;
  capturedAt: string;
}

export type YahooLeagueConversion =
  | { ok: true; league: League }
  | { ok: false; issues: string[] };

/**
 * Converts fetched Yahoo league data into the domain League model.
 * Projections are never invented: weekly and rest-of-season projections stay
 * null, and auction costs stay 0. Per-league failures return issues instead
 * of throwing so one bad league never kills a league list.
 */
export function convertYahooLeagueToDomain(
  detail: YahooLeagueDetail,
): YahooLeagueConversion {
  const issues: string[] = [];
  const { league, settings, standings, teams, rosters } = detail;

  const sport = detectYahooSport({
    leagueKey: detail.leagueKey,
    gameKey: league.gameKey,
    url: league.url,
    rosterPositions: settings.rosterPositions.map((p) => p.position),
  });
  if (sport === 'unknown') {
    return {
      ok: false,
      issues: [
        `Could not determine the sport for Yahoo league ${detail.leagueKey}.`,
      ],
    };
  }

  const startingSlots = mapStartingSlots(settings, issues);
  if (startingSlots.length === 0) {
    return {
      ok: false,
      issues: [
        `Yahoo league ${detail.leagueKey} has no usable starting slots.`,
        ...issues,
      ],
    };
  }

  const draftType: League['draftType'] =
    settings.isAuctionDraft === true ||
    (settings.draftType ?? '').toLowerCase() === 'auction'
      ? 'auction'
      : 'snake';
  const superflex =
    sport === 'football' &&
    startingSlots.some(
      (slot) => slot.eligible.includes('QB') && slot.eligible.length > 1,
    );

  const standingsByTeamKey = new Map(
    standings.map((standing) => [standing.teamKey, standing]),
  );

  const myTeam = teams.find((team) => team.isCurrentLogin === true) ?? null;
  if (!myTeam) {
    return {
      ok: false,
      issues: [
        `Yahoo did not identify the current user's team in league ${detail.leagueKey}.`,
      ],
    };
  }

  const players: Player[] = [];
  const seenPlayerKeys = new Set<string>();
  const domainTeams: Team[] = [];

  for (const team of teams) {
    const entries = rosters[team.providerTeamKey] ?? null;
    if (entries === null) {
      issues.push(
        `Roster for team ${team.name} (${team.providerTeamKey}) was unavailable; the team will show no players.`,
      );
    }
    const playerIds: string[] = [];
    for (const entry of entries ?? []) {
      const providerPlayer = entry.player;
      const key = providerPlayer.providerPlayerKey;
      if (seenPlayerKeys.has(key)) {
        issues.push(
          `Player ${providerPlayer.name} (${key}) appears on more than one roster; keeping the first.`,
        );
        continue;
      }
      const position =
        toDomainPosition(providerPlayer.displayPosition) ??
        expandEligiblePositions(providerPlayer.eligiblePositions)[0] ??
        null;
      if (position === null) {
        issues.push(
          `Player ${providerPlayer.name} (${key}) has an unrecognized position "${providerPlayer.displayPosition ?? 'none'}"; skipped.`,
        );
        continue;
      }
      const eligible = expandEligiblePositions(
        providerPlayer.eligiblePositions,
      );
      seenPlayerKeys.add(key);
      playerIds.push(key);
      players.push({
        id: key,
        name: providerPlayer.name,
        teamAbbr: providerPlayer.teamAbbreviation?.trim() || '—',
        position,
        eligiblePositions: eligible.length > 0 ? eligible : [position],
        weeklyProjection: null,
        rosProjection: null,
        auctionCost: 0,
        status: toPlayerStatus(providerPlayer.status),
        byeWeek: 0,
        projectedAt: detail.capturedAt,
      });
    }

    const standing = standingsByTeamKey.get(team.providerTeamKey);
    domainTeams.push({
      id: team.providerTeamKey,
      name: team.name,
      manager: team.managerName?.trim() || 'Unknown manager',
      abbreviation: teamAbbreviation(team.name, team.abbreviation),
      wins: standing?.wins ?? 0,
      losses: standing?.losses ?? 0,
      pointsFor: standing?.pointsFor ?? 0,
      faabRemaining: team.faabBalance ?? 0,
      playerIds,
    });
  }

  const rosterLimit = settings.rosterPositions.reduce(
    (total, setting) => total + Math.max(0, setting.count),
    0,
  );

  return {
    ok: true,
    league: {
      id: detail.leagueKey,
      name: league.name,
      sport,
      season: league.season ?? new Date().getFullYear(),
      week: league.currentWeek ?? 1,
      teamCount: domainTeams.length,
      scoringLabel: `Yahoo ${sport === 'football' ? 'Football' : 'Basketball'} · ${draftType === 'auction' ? 'Auction' : 'Snake'}`,
      draftType,
      superflex,
      budget: draftType === 'auction' ? 200 : 0,
      rosterLimit,
      startingSlots,
      myTeamId: myTeam.providerTeamKey,
      teams: domainTeams,
      players,
      source: 'yahoo',
      providerLeagueKey: detail.leagueKey,
      snapshotAt: detail.capturedAt,
    },
  };
}
