import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  unique,
  check,
  foreignKey,
} from 'drizzle-orm/sqlite-core';

export const trades = sqliteTable(
  'trades',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    leagueId: text('league_id').notNull(),
    title: text('title').notNull(),
    notes: text('notes').notNull().default(''),
    status: text('status').notNull().default('idea'),
    requestJson: text('request_json').notNull(),
    analysisJson: text('analysis_json').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    revision: integer('revision').notNull().default(1),
    lastMutationId: text('last_mutation_id').notNull(),
  },
  (t) => [
    unique('trades_identity').on(t.id, t.ownerId, t.leagueId),
    index('trades_owner_league_created').on(t.ownerId, t.leagueId, t.createdAt),
    check(
      'trades_status',
      sql`${t.status} IN ('idea','proposed','accepted','rejected','withdrawn','completed')`,
    ),
    check(
      'trades_json',
      sql`json_valid(${t.requestJson}) AND json_valid(${t.analysisJson})`,
    ),
    check('trades_revision', sql`${t.revision} >= 1`),
  ],
);

export const tradeEvents = sqliteTable(
  'trade_events',
  {
    id: text('id').primaryKey(),
    tradeId: text('trade_id').notNull(),
    ownerId: text('owner_id').notNull(),
    leagueId: text('league_id').notNull(),
    status: text('status').notNull(),
    eventAt: text('event_at').notNull(),
    note: text('note').notNull().default(''),
    revision: integer('revision').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.tradeId, t.ownerId, t.leagueId],
      foreignColumns: [trades.id, trades.ownerId, trades.leagueId],
    }).onDelete('cascade'),
    unique('events_trade_revision').on(t.tradeId, t.revision),
    index('events_owner_league').on(t.ownerId, t.leagueId, t.tradeId),
  ],
);


export const oauthStates = sqliteTable(
  'oauth_states',
  {
    stateHash: text('state_hash').primaryKey(),
    actorId: text('actor_id').notNull(),
    provider: text('provider').notNull().default('yahoo'),
    expiresAt: text('expires_at').notNull(),
    consumedAt: text('consumed_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('oauth_states_actor').on(t.actorId),
    index('oauth_states_expires').on(t.expiresAt),
    check(
      'oauth_states_provider',
      sql`${t.provider} IN ('yahoo')`,
    ),
  ],
);

export const yahooConnections = sqliteTable(
  'yahoo_connections',
  {
    ownerId: text('owner_id').primaryKey(),
    encryptedAccessToken: text('encrypted_access_token').notNull(),
    encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
    tokenType: text('token_type').notNull().default('Bearer'),
    accessTokenExpiresAt: text('access_token_expires_at'),
    updatedAt: text('updated_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('yahoo_connections_updated').on(t.updatedAt)],
);
