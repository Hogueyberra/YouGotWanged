export type ProviderId = 'yahoo' | 'news-social-reserved';

export type ProviderReadiness =
  | 'disabled'
  | 'configuration_required'
  | 'approval_required'
  | 'connection_required'
  | 'validation_required'
  | 'ready';

export interface ProviderConfigStatus {
  provider: ProviderId;
  readiness: ProviderReadiness;
  readOnly: true;
  missingConfiguration: readonly string[];
  liveContractValidated: boolean;
  retentionHours: number | null;
  message: string;
}

export type NormalizationIssueCode =
  | 'invalid_root'
  | 'unknown_shape'
  | 'missing_field'
  | 'invalid_field'
  | 'unsupported_value';

export interface NormalizationIssue {
  code: NormalizationIssueCode;
  path: string;
  message: string;
  severity: 'warning' | 'error';
}

export interface ProvisionalContract {
  id: string;
  liveValidated: false;
  note: string;
}

export type NormalizationResult<T> =
  | {
      ok: true;
      value: T;
      issues: readonly NormalizationIssue[];
      contract: ProvisionalContract;
    }
  | {
      ok: false;
      issues: readonly NormalizationIssue[];
      contract: ProvisionalContract;
    };

export interface ProviderCapture {
  provider: ProviderId;
  resource: string;
  requestPath: string;
  capturedAt: string;
  retainUntil: string | null;
}

export interface CapturedNormalization<T> {
  capture: ProviderCapture;
  normalization: NormalizationResult<T>;
}

export interface ReadOnlyFantasyProvider {
  fetchUserLeagues(): Promise<CapturedNormalization<readonly ProviderLeague[]>>;
  fetchLeague(
    leagueKey: string,
  ): Promise<CapturedNormalization<readonly ProviderLeague[]>>;
  fetchTeams(
    leagueKey: string,
  ): Promise<CapturedNormalization<readonly ProviderTeam[]>>;
  fetchPlayers(
    leagueKey: string,
    options?: {
      start?: number;
      count?: number;
      status?: 'A' | 'FA' | 'W';
      sort?: 'OR' | 'AR' | 'PTS';
    },
  ): Promise<CapturedNormalization<readonly ProviderPlayer[]>>;
  fetchRoster(
    teamKey: string,
    week?: number,
  ): Promise<CapturedNormalization<readonly ProviderRosterEntry[]>>;
  fetchTransactions(
    leagueKey: string,
  ): Promise<CapturedNormalization<readonly ProviderTransaction[]>>;
  fetchSettings(
    leagueKey: string,
  ): Promise<CapturedNormalization<YahooLeagueSettings>>;
  fetchStandings(
    leagueKey: string,
  ): Promise<CapturedNormalization<readonly YahooTeamStanding[]>>;
}

export interface ProviderLeague {
  providerLeagueKey: string;
  providerLeagueId: string | null;
  name: string;
  season: number | null;
  currentWeek: number | null;
  gameKey: string | null;
  url: string | null;
  isFinished: boolean | null;
}

export interface ProviderTeam {
  providerTeamKey: string;
  providerTeamId: string | null;
  name: string;
  abbreviation: string | null;
  url: string | null;
  managerName: string | null;
  /** Remaining FAAB budget, when the league uses FAAB waivers. */
  faabBalance: number | null;
  /** True for the team managed by the authenticated Yahoo user. */
  isCurrentLogin: boolean | null;
}

export interface ProviderPlayer {
  providerPlayerKey: string;
  providerPlayerId: string | null;
  name: string;
  teamAbbreviation: string | null;
  displayPosition: string | null;
  eligiblePositions: readonly string[];
  status: string | null;
}

export interface ProviderRosterEntry {
  player: ProviderPlayer;
  selectedPosition: string | null;
  week: number | null;
}

export interface ProviderTransaction {
  providerTransactionKey: string;
  providerTransactionId: string | null;
  type: string | null;
  status: string | null;
  occurredAt: string | null;
  /** Winning FAAB bid for waiver claims, when present. */
  faabBid: number | null;
  /** Full names of players involved in the transaction. */
  playerNames: readonly string[];
}

export interface YahooRosterPositionSetting {
  position: string;
  positionType: string | null;
  count: number;
}

export interface YahooLeagueSettings {
  draftType: string | null;
  isAuctionDraft: boolean | null;
  rosterPositions: YahooRosterPositionSetting[];
}

export interface YahooTeamStanding {
  teamKey: string;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  pointsFor: number | null;
}
