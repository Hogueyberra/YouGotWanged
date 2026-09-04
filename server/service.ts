import { DEMO_LEAGUES } from '../domain/demo.ts';
import { analyzeTrade } from '../domain/trades.ts';
import type { OverviewPayload, TradeRequest } from '../domain/types.ts';
import { AppError } from './errors.ts';
import { textField } from './http.ts';
import type { TradeRepository } from './repository.ts';

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

export function parseTrade(value: unknown): TradeRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AppError('INVALID_TRADE', 'Trade details are required.');
  const body = value as Record<string, unknown>;
  const league = leagueById(body.leagueId);
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

export function evaluate(value: unknown) {
  const request = parseTrade(value);
  return {
    request,
    analysis: analyzeTrade(leagueById(request.leagueId), request),
  };
}

export async function overview(
  repo: TradeRepository,
  actor: { id: string; displayName: string },
): Promise<OverviewPayload> {
  return {
    leagues: DEMO_LEAGUES,
    trades: await repo.list(actor.id),
    user: { displayName: actor.displayName },
    provider: {
      status: 'pending_approval',
      message:
        'Yahoo approval is pending. These two leagues and all players are fictional demo data; no Yahoo account is connected.',
    },
  };
}
