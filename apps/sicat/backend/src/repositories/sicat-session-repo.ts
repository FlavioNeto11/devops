import { query } from '../db/pool.js';

type SicatSessionRow = {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  expires_at: string | Date;
  revoked_at: string | Date | null;
  metadata: Record<string, unknown> | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type SicatSessionEntity = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: string | Date;
  revokedAt: string | Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type InsertSicatSessionInput = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: string | Date;
  revokedAt?: string | Date | null;
  metadata?: Record<string, unknown>;
};

function asIsoDate(value: string | Date | null): string | Date | null {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function asIsoDateRequired(value: string | Date): string | Date {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapRow(row: SicatSessionRow): SicatSessionEntity {
  return {
    id: row.id,
    userId: row.user_id,
    refreshTokenHash: row.refresh_token_hash,
    expiresAt: asIsoDateRequired(row.expires_at),
    revokedAt: asIsoDate(row.revoked_at),
    metadata: row.metadata,
    createdAt: asIsoDateRequired(row.created_at),
    updatedAt: asIsoDateRequired(row.updated_at)
  };
}

export async function insert(input: InsertSicatSessionInput): Promise<SicatSessionEntity | undefined> {
  const result = await query<SicatSessionRow>(
    `insert into sicat_sessions(id, user_id, refresh_token_hash, expires_at, revoked_at, metadata)
     values ($1,$2,$3,$4,$5,$6::jsonb)
     returning *`,
    [
      input.id,
      input.userId,
      input.refreshTokenHash,
      input.expiresAt,
      input.revokedAt ?? null,
      JSON.stringify(input.metadata || {})
    ]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}

export async function findByRefreshTokenHash(refreshTokenHash: string): Promise<SicatSessionEntity | undefined> {
  const result = await query<SicatSessionRow>(
    'select * from sicat_sessions where refresh_token_hash = $1',
    [refreshTokenHash]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}

export async function revokeById(id: string): Promise<SicatSessionEntity | undefined> {
  const result = await query<SicatSessionRow>(
    `update sicat_sessions
        set revoked_at = now(),
            updated_at = now()
      where id = $1
      returning *`,
    [id]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}

export async function revokeActiveByUserId(userId: string): Promise<{ revokedCount: number }> {
  const result = await query(
    `update sicat_sessions
        set revoked_at = now(),
            updated_at = now()
      where user_id = $1
        and revoked_at is null
      returning id`,
    [userId]
  );

  return {
    revokedCount: result.rowCount || 0
  };
}
