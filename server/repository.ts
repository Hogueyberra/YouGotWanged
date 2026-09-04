import type {
  SavedTrade,
  SavedTradeEvent,
  TradeAnalysis,
  TradeRequest,
} from '../domain/types.ts';
import { AppError } from './errors.ts';

export interface QueryResult<T = Record<string, unknown>> {
  results: T[];
  meta?: { changes?: number };
}
export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  all<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch<T = Record<string, unknown>>(
    statements: Statement[],
  ): Promise<QueryResult<T>[]>;
}
type Row = {
  id: string;
  owner_id: string;
  league_id: string;
  title: string;
  notes: string;
  status: SavedTrade['status'];
  request_json: string;
  analysis_json: string;
  created_at: string;
  updated_at: string;
  revision: number;
};
type EventRow = {
  id: string;
  trade_id: string;
  status: SavedTrade['status'];
  event_at: string;
  note: string;
};

export const STATUS_TRANSITIONS: Record<
  SavedTrade['status'],
  readonly SavedTrade['status'][]
> = {
  idea: ['proposed', 'withdrawn'],
  proposed: ['accepted', 'rejected', 'withdrawn'],
  accepted: ['completed', 'withdrawn'],
  rejected: [],
  withdrawn: [],
  completed: [],
};

function mapRow(row: Row, events: EventRow[]): SavedTrade {
  return {
    id: row.id,
    leagueId: row.league_id,
    title: row.title,
    notes: row.notes,
    status: row.status,
    request: JSON.parse(row.request_json) as TradeRequest,
    analysis: JSON.parse(row.analysis_json) as TradeAnalysis,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    events: events
      .filter((event) => event.trade_id === row.id)
      .map(
        (event): SavedTradeEvent => ({
          id: event.id,
          status: event.status,
          at: event.event_at,
          note: event.note,
        }),
      ),
  };
}

/** All persistence is scoped to server-derived actor identity and league. */
export class TradeRepository {
  private db: Database;
  constructor(db: Database) {
    this.db = db;
  }

  async list(ownerId: string): Promise<SavedTrade[]> {
    const rows = await this.db
      .prepare(
        'SELECT * FROM trades WHERE owner_id = ? ORDER BY created_at DESC, id DESC',
      )
      .bind(ownerId)
      .all<Row>();
    const events = await this.db
      .prepare(
        'SELECT * FROM trade_events WHERE owner_id = ? ORDER BY revision ASC',
      )
      .bind(ownerId)
      .all<EventRow>();
    return rows.results.map((row) => mapRow(row, events.results));
  }

  async get(
    ownerId: string,
    leagueId: string,
    id: string,
  ): Promise<SavedTrade> {
    const rows = await this.db
      .prepare(
        'SELECT * FROM trades WHERE id = ? AND owner_id = ? AND league_id = ?',
      )
      .bind(id, ownerId, leagueId)
      .all<Row>();
    if (!rows.results[0])
      throw new AppError(
        'NOT_FOUND',
        'Saved trade not found in this league.',
        404,
      );
    const events = await this.db
      .prepare(
        'SELECT * FROM trade_events WHERE trade_id = ? AND owner_id = ? AND league_id = ? ORDER BY revision ASC',
      )
      .bind(id, ownerId, leagueId)
      .all<EventRow>();
    return mapRow(rows.results[0], events.results);
  }

  async create(
    ownerId: string,
    request: TradeRequest,
    analysis: TradeAnalysis,
    title: string,
    notes: string,
  ): Promise<SavedTrade> {
    const id = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO trades (id, owner_id, league_id, title, notes, status, request_json, analysis_json, created_at, updated_at, revision, last_mutation_id) VALUES (?, ?, ?, ?, ?, 'idea', ?, ?, ?, ?, 1, ?)",
        )
        .bind(
          id,
          ownerId,
          request.leagueId,
          title,
          notes,
          JSON.stringify(request),
          JSON.stringify(analysis),
          now,
          now,
          eventId,
        ),
      this.db
        .prepare(
          "INSERT INTO trade_events (id, trade_id, owner_id, league_id, status, event_at, note, revision) VALUES (?, ?, ?, ?, 'idea', ?, ?, 1)",
        )
        .bind(
          eventId,
          id,
          ownerId,
          request.leagueId,
          now,
          'Decision-time analysis saved; no offer was sent to Yahoo.',
        ),
    ]);
    return this.get(ownerId, request.leagueId, id);
  }

  async transition(
    ownerId: string,
    leagueId: string,
    id: string,
    status: SavedTrade['status'],
    revision: number,
    note: string,
  ): Promise<SavedTrade> {
    const previous = await this.get(ownerId, leagueId, id);
    if (previous.revision !== revision)
      throw new AppError(
        'STALE_REVISION',
        'This trade changed elsewhere. Refresh before updating it.',
        409,
      );
    if (!STATUS_TRANSITIONS[previous.status].includes(status))
      throw new AppError(
        'INVALID_TRANSITION',
        `Cannot move a ${previous.status} trade to ${status}.`,
        422,
      );
    const mutationId = crypto.randomUUID();
    const now = new Date().toISOString();
    const result = await this.db.batch<{ id: string }>([
      this.db
        .prepare(
          'UPDATE trades SET status = ?, updated_at = ?, revision = revision + 1, last_mutation_id = ? WHERE id = ? AND owner_id = ? AND league_id = ? AND revision = ? AND status = ? RETURNING id',
        )
        .bind(
          status,
          now,
          mutationId,
          id,
          ownerId,
          leagueId,
          revision,
          previous.status,
        ),
      this.db
        .prepare(
          'INSERT INTO trade_events (id, trade_id, owner_id, league_id, status, event_at, note, revision) SELECT ?, id, owner_id, league_id, status, ?, ?, revision FROM trades WHERE id = ? AND owner_id = ? AND league_id = ? AND last_mutation_id = ?',
        )
        .bind(mutationId, now, note, id, ownerId, leagueId, mutationId),
    ]);
    if (!result[0]?.results.length)
      throw new AppError(
        'STALE_REVISION',
        'This trade changed elsewhere. Refresh before updating it.',
        409,
      );
    return this.get(ownerId, leagueId, id);
  }

  async delete(ownerId: string, leagueId: string, id: string): Promise<void> {
    const result = await this.db
      .prepare(
        'DELETE FROM trades WHERE id = ? AND owner_id = ? AND league_id = ? RETURNING id',
      )
      .bind(id, ownerId, leagueId)
      .all();
    if (!result.results.length)
      throw new AppError(
        'NOT_FOUND',
        'Saved trade not found in this league.',
        404,
      );
  }

  async deleteAll(ownerId: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM trades WHERE owner_id = ?')
      .bind(ownerId)
      .all();
  }
}
