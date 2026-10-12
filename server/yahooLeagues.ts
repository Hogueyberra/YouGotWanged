/**
 * Server-side Yahoo league plumbing: shared read-only fetching, sport
 * detection, and conversion of Yahoo league data into the domain League
 * model. Every Yahoo call here is read-only and goes through the allowlisted
 * paths in integrations/yahoo/paths.ts.
 */
import { YahooFantasyReadOnlyAdapter } from '../integrations/yahoo/adapter.ts';
import { importTokenKey } from '../integrations/yahoo/crypto.ts';
import { getServerEnv } from '../integrations/yahoo/serverEnv.ts';
import {
  readYahooOAuthConfig,
  type YahooOAuthConfig,
} from '../integrations/yahoo/tokenExchange.ts';
import { getValidYahooAccessToken } from '../integrations/yahoo/tokens.ts';
import type {
  NormalizationResult,
  ProviderRosterEntry,
  ProviderTeam,
} from '../integrations/providers/contracts.ts';
import type { YahooLeagueDetail } from './yahooLeagueConvert.ts';
import { repository } from './data.ts';
import { AppError } from './errors.ts';

/** Extracts normalized values or fails closed when Yahoo's shape drifts. */
export function valuesOrThrow<T>(result: NormalizationResult<T>): T {
  if (!result.ok)
    throw new AppError(
      'YAHOO_READ_FAILED',
      'Yahoo returned data in an unexpected shape.',
      502,
    );
  return result.value;
}

/**
 * Builds an authenticated read-only Yahoo adapter for the actor. Throws
 * NOT_CONFIGURED (503) when the deployment lacks Yahoo credentials and
 * NOT_CONNECTED (409) when the actor has not linked Yahoo yet.
 */
export async function requireYahooAdapter(
  actorId: string,
): Promise<YahooFantasyReadOnlyAdapter> {
  const serverEnv = getServerEnv();

  const tokenKey = serverEnv['YAHOO_TOKEN_KEY']?.trim();
  if (!tokenKey)
    throw new AppError(
      'NOT_CONFIGURED',
      'Yahoo credentials are not installed on this deployment.',
      503,
    );

  let config: YahooOAuthConfig;
  try {
    config = readYahooOAuthConfig(serverEnv);
  } catch {
    throw new AppError(
      'NOT_CONFIGURED',
      'Yahoo credentials are not installed on this deployment.',
      503,
    );
  }

  const accessToken = await getValidYahooAccessToken(
    {
      fetchImpl: fetch,
      config,
      repo: repository(),
      key: await importTokenKey(tokenKey),
      now: () => new Date(),
    },
    actorId,
  );
  if (!accessToken)
    throw new AppError('NOT_CONNECTED', 'Connect your Yahoo account first.', 409);

  return new YahooFantasyReadOnlyAdapter({ accessToken });
}

export interface YahooTeamSummary {
  key: string;
  name: string;
  managerName: string | null;
  faabBalance: number | null;
  isCurrentLogin: boolean | null;
}

export interface YahooLeagueSnapshot {
  key: string;
  name: string;
  season: number | null;
  currentWeek: number | null;
  myTeam: YahooTeamSummary | null;
  teams: YahooTeamSummary[];
  rosters: Record<string, readonly ProviderRosterEntry[] | null>;
  transactions: Array<{
    type: string | null;
    status: string | null;
    occurredAt: string | null;
    faabBid: number | null;
    playerNames: readonly string[];
  }>;
  waiverWire: Array<{
    name: string;
    displayPosition: string | null;
    eligiblePositions: readonly string[];
    teamAbbreviation: string | null;
    status: string | null;
  }>;
}

function toTeamSummary(team: ProviderTeam): YahooTeamSummary {
  return {
    key: team.providerTeamKey,
    name: team.name,
    managerName: team.managerName,
    faabBalance: team.faabBalance,
    isCurrentLogin: team.isCurrentLogin,
  };
}

/** Fetches full rosters for every team, in small batches, tolerating failures. */
export async function fetchTeamRosters(
  adapter: YahooFantasyReadOnlyAdapter,
  teamKeys: readonly string[],
): Promise<Record<string, readonly ProviderRosterEntry[] | null>> {
  const rosters: Record<string, readonly ProviderRosterEntry[] | null> = {};
  for (let i = 0; i < teamKeys.length; i += 4) {
    const batch = await Promise.all(
      teamKeys.slice(i, i + 4).map(async (teamKey) => {
        try {
          const roster = await adapter.fetchRoster(teamKey);
          return { teamKey, entries: valuesOrThrow(roster.normalization) };
        } catch {
          return { teamKey, entries: null };
        }
      }),
    );
    for (const { teamKey, entries } of batch) rosters[teamKey] = entries;
  }
  return rosters;
}

/**
 * Read-only snapshot of one Yahoo league: teams (+ FAAB balances), full
 * rosters, recent transactions, and the top available players. This is the
 * shared implementation behind /api/integrations/yahoo/snapshot.
 */
export async function fetchLeagueSnapshot(
  adapter: YahooFantasyReadOnlyAdapter,
  leagueKey: string,
): Promise<YahooLeagueSnapshot> {
  const [leagueRes, teamsRes, transactionsRes, wirePage1, wirePage2] =
    await Promise.all([
      adapter.fetchLeague(leagueKey),
      adapter.fetchTeams(leagueKey),
      adapter.fetchTransactions(leagueKey),
      adapter.fetchPlayers(leagueKey, { status: 'A', sort: 'OR', count: 25 }),
      adapter.fetchPlayers(leagueKey, {
        status: 'A',
        sort: 'OR',
        start: 25,
        count: 25,
      }),
    ]);

  const league = valuesOrThrow(leagueRes.normalization)[0];
  const teams = valuesOrThrow(teamsRes.normalization).map(toTeamSummary);
  const myTeam = teams.find((team) => team.isCurrentLogin === true) ?? null;
  const rosters = await fetchTeamRosters(
    adapter,
    teams.map((team) => team.key),
  );

  return {
    key: leagueKey,
    name: league?.name ?? leagueKey,
    season: league?.season ?? null,
    currentWeek: league?.currentWeek ?? null,
    myTeam,
    teams,
    rosters,
    transactions: valuesOrThrow(transactionsRes.normalization).map((tx) => ({
      type: tx.type,
      status: tx.status,
      occurredAt: tx.occurredAt,
      faabBid: tx.faabBid,
      playerNames: tx.playerNames,
    })),
    waiverWire: [
      ...valuesOrThrow(wirePage1.normalization),
      ...valuesOrThrow(wirePage2.normalization),
    ].map((player) => ({
      name: player.name,
      displayPosition: player.displayPosition,
      eligiblePositions: player.eligiblePositions,
      teamAbbreviation: player.teamAbbreviation,
      status: player.status,
    })),
  };
}

/**
 * Fetches everything needed to convert one Yahoo league into the domain
 * model: league, settings (roster slots + draft format), standings, teams,
 * and full rosters.
 */
export async function fetchYahooLeagueDetail(
  adapter: YahooFantasyReadOnlyAdapter,
  leagueKey: string,
  now: () => Date = () => new Date(),
): Promise<YahooLeagueDetail> {
  const [leagueRes, settingsRes, standingsRes, teamsRes] = await Promise.all([
    adapter.fetchLeague(leagueKey),
    adapter.fetchSettings(leagueKey),
    adapter.fetchStandings(leagueKey),
    adapter.fetchTeams(leagueKey),
  ]);

  const league = valuesOrThrow(leagueRes.normalization)[0];
  if (!league)
    throw new AppError(
      'YAHOO_READ_FAILED',
      'Yahoo did not return this league.',
      502,
    );
  const teams = valuesOrThrow(teamsRes.normalization);
  const rosters = await fetchTeamRosters(
    adapter,
    teams.map((team) => team.providerTeamKey),
  );

  return {
    leagueKey,
    league,
    settings: valuesOrThrow(settingsRes.normalization),
    standings: valuesOrThrow(standingsRes.normalization),
    teams,
    rosters,
    capturedAt: now().toISOString(),
  };
}

