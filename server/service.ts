import { DEMO_LEAGUES } from '../domain/demo.ts';
import { analyzeTrade } from '../domain/trades.ts';
import type {
  League,
  OverviewPayload,
  TradeRequest,
} from '../domain/types.ts';
import { hasYahooTokens } from '../integrations/yahoo/tokens.ts';
import { AppError } from './errors.ts';
import { textField } from './http.ts';
import type { TradeRepository } from './repository.ts';
import { convertYahooLeagueToDomain } from './yahooLeagueConvert.ts';

export function leagueById(value: unknown) {
  const league = DEMO_LEAGUES.find((item) => item.id === value);
  if (!league)
    throw new AppError(
      'LEAGUE_NOT_FOUND',
      'Select a league in your workspace.',
      404,
    );
  return league;
}

const YAHOO_LEAGUE_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Resolves a league id to a domain League: demo leagues resolve locally,
 * Yahoo league keys (e.g. "449.l.12345") resolve via a fresh read-only
 * Yahoo snapshot for the actor. Throws NOT_CONNECTED when Yahoo isn't
 * linked.
 */
export async function leagueByIdAsync(
  value: unknown,
  actorId: string,
): Promise<League> {
  if (typeof value === 'string') {
    const demo = DEMO_LEAGUES.find((item) => item.id === value);
    if (demo) return demo;
    if (YAHOO_LEAGUE_KEY_PATTERN.test(value) && value.includes('.')) {
      // Loaded lazily: the Yahoo I/O module pulls in Cloudflare runtime
      // bindings that are unavailable outside the worker.
      const { requireYahooAdapter, fetchYahooLeagueDetail } = await import(
        './yahooLeagues.ts'
      );
      const adapter = await requireYahooAdapter(actorId);
      const detail = await fetchYahooLeagueDetail(adapter, value);
      const converted = convertYahooLeagueToDomain(detail);
      if (!converted.ok)
        throw new AppError(
          'YAHOO_LEAGUE_UNAVAILABLE',
          converted.issues[0] ?? 'Could not load this Yahoo league.',
          502,
        );
      return converted.league;
    }
  }
  throw new AppError('LEAGUE_NOT_FOUND', 'Select a league in your workspace.', 404);
}

function ids(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 16 ||
    !value.every(
      (id) => typeof id === 'string' && id.length > 0 && id.length < 100,
    )
  ) {
    throw new AppError(
      'INVALID_PLAYERS',
      'Select a valid list of up to 16 players.',
    );
  }
  return value;
}

function buildTradeRequest(
  body: Record<string, unknown>,
  league: League,
): TradeRequest {
  const fromTeamId = textField(body.fromTeamId, 'Your team', 100);
  if (fromTeamId !== league.myTeamId)
    throw new AppError(
      'INVALID_TEAM',
      'Start a trade from your team in this league.',
    );
  const asOf = textField(body.asOf, 'Decision time', 50);
  const stamp = Date.parse(asOf);
  if (!Number.isFinite(stamp) || stamp > Date.now())
    throw new AppError(
      'INVALID_TIME',
      'Decision time must be a valid time that is not in the future.',
    );
  return {
    leagueId: league.id,
    fromTeamId,
    toTeamId: textField(body.toTeamId, 'Partner team', 100),
    givePlayerIds: ids(body.givePlayerIds),
    receivePlayerIds: ids(body.receivePlayerIds),
    asOf: new Date(stamp).toISOString(),
  };
}

function tradeBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AppError('INVALID_TRADE', 'Trade details are required.');
  return value as Record<string, unknown>;
}

export function parseTrade(value: unknown): TradeRequest {
  const body = tradeBody(value);
  return buildTradeRequest(body, leagueById(body.leagueId));
}

export async function parseTradeAsync(
  value: unknown,
  actorId: string,
): Promise<TradeRequest> {
  const body = tradeBody(value);
  return buildTradeRequest(body, await leagueByIdAsync(body.leagueId, actorId));
}

export function evaluate(value: unknown) {
  const request = parseTrade(value);
  return {
    request,
    analysis: analyzeTrade(leagueById(request.leagueId), request),
  };
}

export async function evaluateAsync(value: unknown, actorId: string) {
  const request = await parseTradeAsync(value, actorId);
  return {
    request,
    analysis: analyzeTrade(
      await leagueByIdAsync(request.leagueId, actorId),
      request,
    ),
  };
}

export interface OverviewOptions {
  /** True when the deployment has Yahoo OAuth credentials configured. */
  yahooConnectEnabled?: boolean;
}

export async function overview(
  repo: TradeRepository,
  actor: { id: string; displayName: string },
  options: OverviewOptions = {},
): Promise<OverviewPayload> {
  const yahooConnected = await hasYahooTokens(repo, actor.id);
  const connectEnabled = options.yahooConnectEnabled === true;
  return {
    leagues: DEMO_LEAGUES,
    trades: await repo.list(actor.id),
    user: { displayName: actor.displayName },
    provider: {
      status: yahooConnected ? 'connected' : 'pending_approval',
      connected: yahooConnected,
      connectEnabled,
      message: yahooConnected
        ? 'Your Yahoo account is connected. Live Yahoo reads stay disabled until the provider contract is validated; these two leagues and all players remain fictional demo data.'
        : 'Yahoo has approved the Fantasy Sports API. Connect your Yahoo account to link it; until the provider contract is validated these two leagues and all players are fictional demo data and no Yahoo account is connected.',
    },
  };
}
