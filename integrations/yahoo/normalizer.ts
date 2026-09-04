import type {
  NormalizationIssue,
  NormalizationResult,
  ProvisionalContract,
  ProviderLeague,
  ProviderPlayer,
  ProviderRosterEntry,
  ProviderTeam,
  ProviderTransaction,
} from '../providers/contracts.ts';

type JsonRecord = Record<string, unknown>;

export const PROVISIONAL_YAHOO_JSON_CONTRACT: ProvisionalContract = {
  id: 'yahoo-fantasy-json-provisional-v1',
  liveValidated: false,
  note: 'Defensive parser based on published examples; validate captured fixtures before enabling live sync.',
};

interface LocatedValue {
  value: unknown;
  path: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function atPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function firstString(
  record: JsonRecord,
  paths: readonly string[],
): string | null {
  for (const path of paths) {
    const value = atPath(record, path);
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function firstNumber(
  record: JsonRecord,
  paths: readonly string[],
): number | null {
  const value = firstString(record, paths);
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstBoolean(
  record: JsonRecord,
  paths: readonly string[],
): boolean | null {
  for (const path of paths) {
    const value = atPath(record, path);
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1' || value === 'true') return true;
    if (value === 0 || value === '0' || value === 'false') return false;
  }
  return null;
}

function mergeFragments(value: unknown): JsonRecord | null {
  if (isRecord(value)) return { ...value };
  if (!Array.isArray(value)) return null;

  const merged: JsonRecord = {};
  let found = false;
  for (const fragment of value) {
    const normalized = mergeFragments(fragment);
    if (normalized !== null) {
      Object.assign(merged, normalized);
      found = true;
    }
  }
  return found ? merged : null;
}

function collectNamedValues(
  value: unknown,
  name: string,
  path: string,
  output: LocatedValue[],
  depth = 0,
): void {
  if (depth > 20) return;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      collectNamedValues(
        value[index],
        name,
        `${path}[${index}]`,
        output,
        depth + 1,
      );
    }
    return;
  }

  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (key === name) {
      output.push({ value: child, path: childPath });
      continue;
    }
    collectNamedValues(child, name, childPath, output, depth + 1);
  }
}

function collectStringsByKey(
  value: unknown,
  keyName: string,
  output: string[],
  depth = 0,
): void {
  if (depth > 10) return;
  if (Array.isArray(value)) {
    for (const child of value) {
      collectStringsByKey(child, keyName, output, depth + 1);
    }
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    if (key === keyName && typeof child === 'string' && child.trim()) {
      output.push(child.trim());
    } else {
      collectStringsByKey(child, keyName, output, depth + 1);
    }
  }
}

function requireFantasyContent(
  input: unknown,
): NormalizationResult<JsonRecord> {
  if (!isRecord(input)) {
    return failure({
      code: 'invalid_root',
      path: '$',
      message: 'Yahoo response root must be an object.',
      severity: 'error',
    });
  }

  const fantasyContent = input.fantasy_content;
  if (!isRecord(fantasyContent)) {
    return failure({
      code: 'unknown_shape',
      path: '$.fantasy_content',
      message: 'Response did not contain the expected fantasy_content object.',
      severity: 'error',
    });
  }

  return success(fantasyContent, []);
}

function success<T>(
  value: T,
  issues: readonly NormalizationIssue[],
): NormalizationResult<T> {
  return {
    ok: true,
    value,
    issues,
    contract: PROVISIONAL_YAHOO_JSON_CONTRACT,
  };
}

function failure(
  ...issues: readonly NormalizationIssue[]
): NormalizationResult<never> {
  return {
    ok: false,
    issues,
    contract: PROVISIONAL_YAHOO_JSON_CONTRACT,
  };
}

function collectionRecords(
  input: unknown,
  resourceName: string,
): NormalizationResult<readonly LocatedValue[]> {
  const root = requireFantasyContent(input);
  if (!root.ok) return root;

  const located: LocatedValue[] = [];
  collectNamedValues(root.value, resourceName, '$.fantasy_content', located);
  if (located.length === 0) {
    return failure({
      code: 'unknown_shape',
      path: '$.fantasy_content',
      message: `No ${resourceName} resource was found in the response.`,
      severity: 'error',
    });
  }
  return success(located, []);
}

function normalizeCollection<T>(
  input: unknown,
  resourceName: string,
  convert: (
    record: JsonRecord,
    path: string,
    issues: NormalizationIssue[],
  ) => T | null,
): NormalizationResult<readonly T[]> {
  const records = collectionRecords(input, resourceName);
  if (!records.ok) return records;

  const issues: NormalizationIssue[] = [];
  const values: T[] = [];
  for (const located of records.value) {
    const record = mergeFragments(located.value);
    if (record === null) {
      issues.push({
        code: 'unknown_shape',
        path: located.path,
        message: `${resourceName} resource was not an object or object fragments.`,
        severity: 'error',
      });
      continue;
    }
    const converted = convert(record, located.path, issues);
    if (converted !== null) values.push(converted);
  }

  if (values.length === 0) {
    return failure(
      ...issues,
      ...(issues.length === 0
        ? [
            {
              code: 'unknown_shape' as const,
              path: '$.fantasy_content',
              message: `No usable ${resourceName} records were found.`,
              severity: 'error' as const,
            },
          ]
        : []),
    );
  }
  return success(values, issues);
}

function missingRequired(
  issues: NormalizationIssue[],
  path: string,
  field: string,
): void {
  issues.push({
    code: 'missing_field',
    path: `${path}.${field}`,
    message: `Required ${field} value was missing.`,
    severity: 'error',
  });
}

function playerFromRecord(
  record: JsonRecord,
  path: string,
  issues: NormalizationIssue[],
): ProviderPlayer | null {
  const key = firstString(record, ['player_key']);
  const name = firstString(record, ['name.full', 'name']);
  if (key === null) missingRequired(issues, path, 'player_key');
  if (name === null) missingRequired(issues, path, 'name.full');
  if (key === null || name === null) return null;

  const eligiblePositions: string[] = [];
  collectStringsByKey(record.eligible_positions, 'position', eligiblePositions);

  return {
    providerPlayerKey: key,
    providerPlayerId: firstString(record, ['player_id']),
    name,
    teamAbbreviation: firstString(record, ['editorial_team_abbr']),
    displayPosition: firstString(record, ['display_position']),
    eligiblePositions: [...new Set(eligiblePositions)],
    status: firstString(record, ['status_full', 'status']),
  };
}

export function normalizeYahooLeagues(
  input: unknown,
): NormalizationResult<readonly ProviderLeague[]> {
  return normalizeCollection(input, 'league', (record, path, issues) => {
    const key = firstString(record, ['league_key']);
    const name = firstString(record, ['name']);
    if (key === null) missingRequired(issues, path, 'league_key');
    if (name === null) missingRequired(issues, path, 'name');
    if (key === null || name === null) return null;

    return {
      providerLeagueKey: key,
      providerLeagueId: firstString(record, ['league_id']),
      name,
      season: firstNumber(record, ['season']),
      currentWeek: firstNumber(record, ['current_week']),
      gameKey: firstString(record, ['game_key']),
      url: firstString(record, ['url']),
      isFinished: firstBoolean(record, ['is_finished']),
    };
  });
}

export function normalizeYahooTeams(
  input: unknown,
): NormalizationResult<readonly ProviderTeam[]> {
  return normalizeCollection(input, 'team', (record, path, issues) => {
    const key = firstString(record, ['team_key']);
    const name = firstString(record, ['name']);
    if (key === null) missingRequired(issues, path, 'team_key');
    if (name === null) missingRequired(issues, path, 'name');
    if (key === null || name === null) return null;

    const managerNames: string[] = [];
    collectStringsByKey(record.managers, 'nickname', managerNames);

    return {
      providerTeamKey: key,
      providerTeamId: firstString(record, ['team_id']),
      name,
      abbreviation: firstString(record, ['team_logos.abbreviation', 'abbrev']),
      url: firstString(record, ['url']),
      managerName: managerNames[0] ?? null,
    };
  });
}

export function normalizeYahooPlayers(
  input: unknown,
): NormalizationResult<readonly ProviderPlayer[]> {
  return normalizeCollection(input, 'player', playerFromRecord);
}

export function normalizeYahooRoster(
  input: unknown,
): NormalizationResult<readonly ProviderRosterEntry[]> {
  return normalizeCollection(input, 'player', (record, path, issues) => {
    const player = playerFromRecord(record, path, issues);
    if (player === null) return null;
    return {
      player,
      selectedPosition: firstString(record, [
        'selected_position.position',
        'selected_position',
      ]),
      week: firstNumber(record, ['selected_position.week', 'week']),
    };
  });
}

function normalizeTimestamp(value: string | null): string | null {
  if (value === null) return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1_000 : numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function normalizeYahooTransactions(
  input: unknown,
): NormalizationResult<readonly ProviderTransaction[]> {
  return normalizeCollection(input, 'transaction', (record, path, issues) => {
    const key = firstString(record, ['transaction_key']);
    if (key === null) {
      missingRequired(issues, path, 'transaction_key');
      return null;
    }

    return {
      providerTransactionKey: key,
      providerTransactionId: firstString(record, ['transaction_id']),
      type: firstString(record, ['type']),
      status: firstString(record, ['status']),
      occurredAt: normalizeTimestamp(firstString(record, ['timestamp'])),
    };
  });
}

/**
 * Validates only the Yahoo envelope. Use for resources whose domain contract has
 * not been implemented yet; callers must not treat the returned object as
 * normalized league data.
 */
export function normalizeYahooEnvelope(
  input: unknown,
): NormalizationResult<JsonRecord> {
  return requireFantasyContent(input);
}
