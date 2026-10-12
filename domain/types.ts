export type Position =
  | 'QB'
  | 'RB'
  | 'WR'
  | 'TE'
  | 'K'
  | 'DEF'
  | 'PG'
  | 'SG'
  | 'SF'
  | 'PF'
  | 'C';

export type Sport = 'football' | 'basketball';

export type LeagueSource = 'demo' | 'yahoo';

export interface Player {
  id: string;
  name: string;
  teamAbbr: string;
  position: Position;
  eligiblePositions: Position[];
  weeklyProjection: number | null;
  rosProjection: number | null;
  auctionCost: number;
  status: 'healthy' | 'questionable' | 'out';
  byeWeek: number;
  projectedAt: string;
}

export interface Team {
  id: string;
  name: string;
  manager: string;
  abbreviation: string;
  wins: number;
  losses: number;
  pointsFor: number;
  faabRemaining: number;
  playerIds: string[];
}

export interface StartingSlot {
  id: string;
  label: string;
  eligible: Position[];
}

export interface League {
  id: string;
  name: string;
  sport: Sport;
  season: number;
  week: number;
  teamCount: number;
  scoringLabel: string;
  draftType: 'auction' | 'snake';
  superflex: boolean;
  budget: number;
  rosterLimit: number;
  startingSlots: StartingSlot[];
  myTeamId: string;
  teams: Team[];
  players: Player[];
  source: LeagueSource;
  /** Yahoo league key for provider-backed leagues; absent for demo leagues. */
  providerLeagueKey?: string;
  snapshotAt: string;
}

export interface TradeRequest {
  leagueId: string;
  fromTeamId: string;
  toTeamId: string;
  givePlayerIds: string[];
  receivePlayerIds: string[];
  asOf: string;
}

export interface TradeSideAnalysis {
  before: number | null;
  after: number | null;
  lineupDelta: number | null;
  rosDelta: number | null;
  openRosterSlots: number;
}

export interface TradeAnalysisInputs {
  teams: [Team, Team];
  players: Player[];
  startingSlots: StartingSlot[];
  rosterLimit: number;
  scoringLabel: string;
  week: number;
  season: number;
  source: League['source'];
  snapshotAt: string;
}

export interface TradeAnalysis {
  version: string;
  asOf: string;
  leagueId: string;
  fromTeamId: string;
  toTeamId: string;
  givePlayerIds: string[];
  receivePlayerIds: string[];
  verdict: 'improves' | 'balanced' | 'weakens' | 'unavailable';
  summary: string;
  from: TradeSideAnalysis;
  to: TradeSideAnalysis;
  warnings: string[];
  evidence: {
    source: string;
    capturedAt: string;
  };
  inputs: TradeAnalysisInputs;
  missingSignals: string[];
}

export interface SavedTradeEvent {
  id: string;
  status: SavedTrade['status'];
  at: string;
  note: string;
}

export interface SavedTrade {
  id: string;
  leagueId: string;
  title: string;
  notes: string;
  status:
    | 'idea'
    | 'proposed'
    | 'accepted'
    | 'rejected'
    | 'withdrawn'
    | 'completed';
  request: TradeRequest;
  analysis: TradeAnalysis;
  createdAt: string;
  updatedAt: string;
  revision: number;
  events: SavedTradeEvent[];
}

export interface OverviewPayload {
  leagues: League[];
  trades: SavedTrade[];
  user: {
    displayName: string;
  };
  provider: {
    status: 'pending_approval' | 'connected';
    /** True when the actor has Yahoo OAuth tokens stored. */
    connected: boolean;
    /** True when the deployment has Yahoo OAuth credentials configured. */
    connectEnabled: boolean;
    message: string;
  };
}

export interface LineupAssignment {
  slotId: string;
  playerId: string;
  points: number;
}

export interface OptimizedLineup {
  total: number | null;
  assignments: LineupAssignment[];
  missing: string[];
}
