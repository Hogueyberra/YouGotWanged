import { AppError } from './errors.ts';
import type { Database } from './repository.ts';

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthStateRecord {
  stateHash: string;
  actorId: string;
  provider: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface YahooConnectionRecord {
  ownerId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  tokenType: string;
  accessTokenExpiresAt: string | null;
  updatedAt: string;
  createdAt: string;
}

type OAuthStateRow = {
  state_hash: string;
  actor_id: string;
  provider: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

type YahooConnectionRow = {
  owner_id: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  token_type: string;
  access_token_expires_at: string | null;
  updated_at: string;
  created_at: string;
};

function mapState(row: OAuthStateRow): OAuthStateRecord {
  return {
    stateHash: row.state_hash,
    actorId: row.actor_id,
    provider: row.provider,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
  };
}

function mapConnection(row: YahooConnectionRow): YahooConnectionRecord {
  return {
    ownerId: row.owner_id,
    encryptedAccessToken: row.encrypted_access_token,
    encryptedRefreshToken: row.encrypted_refresh_token,
    tokenType: row.token_type,
    accessTokenExpiresAt: row.access_token_expires_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

/** Persistence for Yahoo OAuth state hashes and encrypted user tokens. */
export class YahooOAuthRepository {
  private db: Database;
  constructor(db: Database) {
    this.db = db;
  }

  async createState(input: {
    stateHash: string;
    actorId: string;
    now?: Date;
    ttlMs?: number;
  }): Promise<OAuthStateRecord> {
    const now = input.now ?? new Date();
    const expiresAt = new Date(
      now.getTime() + (input.ttlMs ?? OAUTH_STATE_TTL_MS),
    ).toISOString();
    const createdAt = now.toISOString();
    await this.db
      .prepare(
        "INSERT INTO oauth_states (state_hash, actor_id, provider, expires_at, consumed_at, created_at) VALUES (?, ?, 'yahoo', ?, NULL, ?)",
      )
      .bind(input.stateHash, input.actorId, expiresAt, createdAt)
      .all();
    return {
      stateHash: input.stateHash,
      actorId: input.actorId,
      provider: 'yahoo',
      expiresAt,
      consumedAt: null,
      createdAt,
    };
  }

  async getState(stateHash: string): Promise<OAuthStateRecord | null> {
    const rows = await this.db
      .prepare('SELECT * FROM oauth_states WHERE state_hash = ?')
      .bind(stateHash)
      .all<OAuthStateRow>();
    return rows.results[0] ? mapState(rows.results[0]) : null;
  }

  /**
   * Validates actor binding, expiry, and single-use, then marks consumed.
   * Returns the bound actor id on success.
   */
  async consumeValidState(input: {
    stateHash: string;
    actorId: string;
    now?: Date;
  }): Promise<string> {
    const now = input.now ?? new Date();
    const record = await this.getState(input.stateHash);
    if (!record || record.provider !== 'yahoo') {
      throw new AppError(
        'OAUTH_STATE_INVALID',
        'Yahoo authorization state is invalid or unknown.',
        400,
      );
    }
    if (record.actorId !== input.actorId) {
      throw new AppError(
        'OAUTH_STATE_MISMATCH',
        'Yahoo authorization state does not belong to this signed-in user.',
        403,
      );
    }
    if (record.consumedAt) {
      throw new AppError(
        'OAUTH_STATE_USED',
        'Yahoo authorization state was already used.',
        400,
      );
    }
    if (Date.parse(record.expiresAt) <= now.getTime()) {
      throw new AppError(
        'OAUTH_STATE_EXPIRED',
        'Yahoo authorization state has expired. Start connect again.',
        400,
      );
    }

    const consumedAt = now.toISOString();
    const result = await this.db
      .prepare(
        'UPDATE oauth_states SET consumed_at = ? WHERE state_hash = ? AND actor_id = ? AND consumed_at IS NULL AND expires_at > ? RETURNING state_hash',
      )
      .bind(consumedAt, input.stateHash, input.actorId, consumedAt)
      .all<{ state_hash: string }>();
    if (!result.results.length) {
      throw new AppError(
        'OAUTH_STATE_USED',
        'Yahoo authorization state was already used.',
        400,
      );
    }
    return record.actorId;
  }

  async hasConnection(ownerId: string): Promise<boolean> {
    const rows = await this.db
      .prepare(
        'SELECT owner_id FROM yahoo_connections WHERE owner_id = ? LIMIT 1',
      )
      .bind(ownerId)
      .all<{ owner_id: string }>();
    return Boolean(rows.results[0]);
  }

  async getConnection(ownerId: string): Promise<YahooConnectionRecord | null> {
    const rows = await this.db
      .prepare('SELECT * FROM yahoo_connections WHERE owner_id = ?')
      .bind(ownerId)
      .all<YahooConnectionRow>();
    return rows.results[0] ? mapConnection(rows.results[0]) : null;
  }

  async upsertConnection(input: {
    ownerId: string;
    encryptedAccessToken: string;
    encryptedRefreshToken: string;
    tokenType: string;
    accessTokenExpiresAt: string | null;
    now?: Date;
  }): Promise<YahooConnectionRecord> {
    const now = (input.now ?? new Date()).toISOString();
    const existing = await this.getConnection(input.ownerId);
    if (existing) {
      await this.db
        .prepare(
          'UPDATE yahoo_connections SET encrypted_access_token = ?, encrypted_refresh_token = ?, token_type = ?, access_token_expires_at = ?, updated_at = ? WHERE owner_id = ?',
        )
        .bind(
          input.encryptedAccessToken,
          input.encryptedRefreshToken,
          input.tokenType,
          input.accessTokenExpiresAt,
          now,
          input.ownerId,
        )
        .all();
      return {
        ownerId: input.ownerId,
        encryptedAccessToken: input.encryptedAccessToken,
        encryptedRefreshToken: input.encryptedRefreshToken,
        tokenType: input.tokenType,
        accessTokenExpiresAt: input.accessTokenExpiresAt,
        updatedAt: now,
        createdAt: existing.createdAt,
      };
    }

    await this.db
      .prepare(
        'INSERT INTO yahoo_connections (owner_id, encrypted_access_token, encrypted_refresh_token, token_type, access_token_expires_at, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        input.ownerId,
        input.encryptedAccessToken,
        input.encryptedRefreshToken,
        input.tokenType,
        input.accessTokenExpiresAt,
        now,
        now,
      )
      .all();
    return {
      ownerId: input.ownerId,
      encryptedAccessToken: input.encryptedAccessToken,
      encryptedRefreshToken: input.encryptedRefreshToken,
      tokenType: input.tokenType,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      updatedAt: now,
      createdAt: now,
    };
  }

  async deleteConnection(ownerId: string): Promise<boolean> {
    const result = await this.db
      .prepare(
        'DELETE FROM yahoo_connections WHERE owner_id = ? RETURNING owner_id',
      )
      .bind(ownerId)
      .all<{ owner_id: string }>();
    return Boolean(result.results.length);
  }
}
