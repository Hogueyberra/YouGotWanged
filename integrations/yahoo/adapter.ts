import type {
  CapturedNormalization,
  NormalizationResult,
  ProviderLeague,
  ProviderPlayer,
  ProviderRosterEntry,
  ProviderTeam,
  ProviderTransaction,
  ReadOnlyFantasyProvider,
  YahooLeagueSettings,
  YahooTeamStanding,
} from '../providers/contracts.ts';
import { DEFAULT_YAHOO_RETENTION_HOURS } from '../providers/config.ts';
import { ProviderHttpClient } from '../providers/http.ts';
import {
  normalizeYahooEnvelope,
  normalizeYahooLeagues,
  normalizeYahooPlayers,
  normalizeYahooRoster,
  normalizeYahooSettings,
  normalizeYahooStandings,
  normalizeYahooTeams,
  normalizeYahooTransactions,
} from './normalizer.ts';
import {
  buildYahooFantasyPath,
  YAHOO_FANTASY_ORIGIN,
  type YahooFantasyRequest,
} from './paths.ts';

export interface YahooAdapterOptions {
  accessToken: string;
  httpClient?: ProviderHttpClient;
  now?: () => Date;
  retentionHours?: number;
}

type UnvalidatedYahooRequest = Extract<
  YahooFantasyRequest,
  { kind: 'settings' | 'standings' | 'scoreboard' }
>;

function boundedRetentionHours(value: number | undefined): number {
  const resolved = value ?? DEFAULT_YAHOO_RETENTION_HOURS;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 24) {
    throw new TypeError(
      'Yahoo retentionHours must be an integer from 1 through the provisional 24-hour maximum.',
    );
  }
  return resolved;
}

export class YahooFantasyReadOnlyAdapter implements ReadOnlyFantasyProvider {
  private readonly accessToken: string;
  private readonly httpClient: ProviderHttpClient;
  private readonly now: () => Date;
  private readonly retentionHours: number;

  constructor(options: YahooAdapterOptions) {
    const accessToken = options.accessToken.trim();
    if (!accessToken) throw new TypeError('Yahoo accessToken is required.');

    this.accessToken = accessToken;
    this.httpClient = options.httpClient ?? new ProviderHttpClient();
    this.now = options.now ?? (() => new Date());
    this.retentionHours = boundedRetentionHours(options.retentionHours);
  }

  fetchUserLeagues(): Promise<
    CapturedNormalization<readonly ProviderLeague[]>
  > {
    const request = { kind: 'user-leagues' } as const;
    return this.fetchAndNormalize(request, normalizeYahooLeagues);
  }

  fetchLeague(
    leagueKey: string,
  ): Promise<CapturedNormalization<readonly ProviderLeague[]>> {
    const request = { kind: 'league', leagueKey } as const;
    return this.fetchAndNormalize(request, normalizeYahooLeagues);
  }

  fetchTeams(
    leagueKey: string,
  ): Promise<CapturedNormalization<readonly ProviderTeam[]>> {
    const request = { kind: 'teams', leagueKey } as const;
    return this.fetchAndNormalize(request, normalizeYahooTeams);
  }

  fetchPlayers(
    leagueKey: string,
    options: {
      start?: number;
      count?: number;
      status?: 'A' | 'FA' | 'W';
      sort?: 'OR' | 'AR' | 'PTS';
    } = {},
  ): Promise<CapturedNormalization<readonly ProviderPlayer[]>> {
    const request = { kind: 'players', leagueKey, ...options } as const;
    return this.fetchAndNormalize(request, normalizeYahooPlayers);
  }

  fetchRoster(
    teamKey: string,
    week?: number,
  ): Promise<CapturedNormalization<readonly ProviderRosterEntry[]>> {
    const request = { kind: 'roster', teamKey, week } as const;
    return this.fetchAndNormalize(request, normalizeYahooRoster);
  }

  fetchTransactions(
    leagueKey: string,
  ): Promise<CapturedNormalization<readonly ProviderTransaction[]>> {
    const request = { kind: 'transactions', leagueKey } as const;
    return this.fetchAndNormalize(request, normalizeYahooTransactions);
  }

  fetchSettings(
    leagueKey: string,
  ): Promise<CapturedNormalization<YahooLeagueSettings>> {
    const request = { kind: 'settings', leagueKey } as const;
    return this.fetchAndNormalize(request, normalizeYahooSettings);
  }

  fetchStandings(
    leagueKey: string,
  ): Promise<CapturedNormalization<readonly YahooTeamStanding[]>> {
    const request = { kind: 'standings', leagueKey } as const;
    return this.fetchAndNormalize(request, normalizeYahooStandings);
  }

  /**
   * Fetches an allowlisted Yahoo read resource while validating only its outer
   * envelope. Add a resource-specific normalizer before using its fields in the
   * application domain.
   */
  fetchUnvalidatedResource(
    request: UnvalidatedYahooRequest,
  ): Promise<CapturedNormalization<Record<string, unknown>>> {
    return this.fetchAndNormalize(request, normalizeYahooEnvelope);
  }

  private async fetchAndNormalize<T>(
    request: YahooFantasyRequest,
    normalize: (input: unknown) => NormalizationResult<T>,
  ): Promise<CapturedNormalization<T>> {
    const path = buildYahooFantasyPath(request);
    const response = await this.httpClient.getJson({
      origin: YAHOO_FANTASY_ORIGIN,
      path,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${this.accessToken}`,
      },
    });
    const capturedAt = this.now();
    const retainUntil = new Date(
      capturedAt.getTime() + this.retentionHours * 60 * 60 * 1_000,
    );

    return {
      capture: {
        provider: 'yahoo',
        resource: request.kind,
        requestPath: path,
        capturedAt: capturedAt.toISOString(),
        retainUntil: retainUntil.toISOString(),
      },
      normalization: normalize(response.data),
    };
  }
}
