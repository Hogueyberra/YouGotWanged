export const YAHOO_FANTASY_ORIGIN = 'https://fantasysports.yahooapis.com';
export const YAHOO_FANTASY_API_PREFIX = '/fantasy/v2';

export type YahooFantasyRequest =
  | { kind: 'user-leagues' }
  | { kind: 'league'; leagueKey: string }
  | { kind: 'settings'; leagueKey: string }
  | { kind: 'teams'; leagueKey: string }
  | { kind: 'standings'; leagueKey: string }
  | { kind: 'scoreboard'; leagueKey: string; week?: number }
  | {
      kind: 'players';
      leagueKey: string;
      start?: number;
      count?: number;
      /** 'A' = available (free agents + waivers). */
      status?: 'A' | 'FA' | 'W';
      /** 'OR' = ownership rank, 'AR' = average rank, 'PTS' = fantasy points. */
      sort?: 'OR' | 'AR' | 'PTS';
    }
  | { kind: 'roster'; teamKey: string; week?: number }
  | { kind: 'transactions'; leagueKey: string };

const RESOURCE_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

function resourceKey(value: string, label: string): string {
  const trimmed = value.trim();
  if (!RESOURCE_KEY_PATTERN.test(trimmed)) {
    throw new TypeError(`${label} is not a valid Yahoo resource key.`);
  }
  return trimmed;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return value;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
  return value;
}

function withJsonFormat(path: string): string {
  return `${YAHOO_FANTASY_API_PREFIX}${path}?format=json`;
}

/** Builds only the read paths documented by Yahoo Fantasy Sports resources. */
export function buildYahooFantasyPath(request: YahooFantasyRequest): string {
  switch (request.kind) {
    case 'user-leagues':
      return withJsonFormat(
        '/users;use_login=1/games;game_keys=nfl,nba/leagues',
      );
    case 'league':
      return withJsonFormat(
        `/league/${resourceKey(request.leagueKey, 'leagueKey')}`,
      );
    case 'settings':
      return withJsonFormat(
        `/league/${resourceKey(request.leagueKey, 'leagueKey')}/settings`,
      );
    case 'teams':
      return withJsonFormat(
        `/league/${resourceKey(request.leagueKey, 'leagueKey')}/teams`,
      );
    case 'standings':
      return withJsonFormat(
        `/league/${resourceKey(request.leagueKey, 'leagueKey')}/standings`,
      );
    case 'scoreboard': {
      const week =
        request.week === undefined
          ? ''
          : `;week=${positiveInteger(request.week, 'week')}`;
      return withJsonFormat(
        `/league/${resourceKey(request.leagueKey, 'leagueKey')}/scoreboard${week}`,
      );
    }
    case 'players': {
      const filters: string[] = [];
      if (request.start !== undefined) {
        filters.push(`start=${nonNegativeInteger(request.start, 'start')}`);
      }
      if (request.count !== undefined) {
        const count = positiveInteger(request.count, 'count');
        if (count > 25) {
          throw new TypeError('count may not exceed 25.');
        }
        filters.push(`count=${count}`);
      }
      if (request.status !== undefined) {
        if (!['A', 'FA', 'W'].includes(request.status)) {
          throw new TypeError(
            `status must be one of 'A', 'FA', 'W'.`,
          );
        }
        filters.push(`status=${request.status}`);
      }
      if (request.sort !== undefined) {
        if (!['OR', 'AR', 'PTS'].includes(request.sort)) {
          throw new TypeError(`sort must be one of 'OR', 'AR', 'PTS'.`);
        }
        filters.push(`sort=${request.sort}`);
      }
      const suffix = filters.length > 0 ? `;${filters.join(';')}` : '';
      return withJsonFormat(
        `/league/${resourceKey(request.leagueKey, 'leagueKey')}/players${suffix}`,
      );
    }
    case 'roster': {
      const week =
        request.week === undefined
          ? ''
          : `;week=${positiveInteger(request.week, 'week')}`;
      return withJsonFormat(
        `/team/${resourceKey(request.teamKey, 'teamKey')}/roster${week}`,
      );
    }
    case 'transactions':
      return withJsonFormat(
        `/league/${resourceKey(request.leagueKey, 'leagueKey')}/transactions`,
      );
  }
}
