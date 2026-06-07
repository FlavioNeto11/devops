import { query } from '../db/pool.js';

type SessionContextRow = {
  id: string;
  integration_account_id: string;
  status: string;
  partner_document: string | null;
  partner_type: string | null;
  partner_code: string | null;
  user_access_code: string | null;
  user_name: string | null;
  email: string | null;
  auth_mode: string | null;
  jwt_token_ref: string | null;
  jwt_token: string | null;
  expires_at: string | Date | null;
  last_validated_at: string | Date | null;
  metadata: Record<string, unknown> | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type SessionContextEntity = {
  id: string;
  integrationAccountId: string;
  status: string;
  partnerDocument: string | null;
  partnerType: string | null;
  partnerCode: string | null;
  userAccessCode: string | null;
  userName: string | null;
  email: string | null;
  authMode: string | null;
  jwtTokenRef: string | null;
  jwtToken: string | null;
  expiresAt: string | Date | null;
  lastValidatedAt: string | Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type InsertSessionContextInput = {
  id: string;
  integrationAccountId: string;
  status: string;
  partnerDocument?: string | null;
  partnerType?: string | null;
  partnerCode?: string | null;
  userAccessCode?: string | null;
  userName?: string | null;
  email?: string | null;
  authMode?: string | null;
  jwtToken?: string | null;
  jwtTokenRef?: string | null;
  expiresAt?: string | Date | null;
  lastValidatedAt?: string | Date | null;
  metadata?: Record<string, unknown>;
};

type UpdateSessionContextPatch = {
  status?: string | null;
  partnerDocument?: string | null;
  partnerType?: string | null;
  partnerCode?: string | null;
  userAccessCode?: string | null;
  userName?: string | null;
  email?: string | null;
  authMode?: string | null;
  jwtToken?: string | null;
  jwtTokenRef?: string | null;
  expiresAt?: string | Date | null;
  lastValidatedAt?: string | Date | null;
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

function mapRow(row: SessionContextRow): SessionContextEntity {
  return {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    status: row.status,
    partnerDocument: row.partner_document,
    partnerType: row.partner_type,
    partnerCode: row.partner_code,
    userAccessCode: row.user_access_code,
    userName: row.user_name,
    email: row.email,
    authMode: row.auth_mode,
    jwtTokenRef: row.jwt_token_ref,
    jwtToken: row.jwt_token,
    expiresAt: asIsoDate(row.expires_at),
    lastValidatedAt: asIsoDate(row.last_validated_at),
    metadata: row.metadata,
    createdAt: asIsoDateRequired(row.created_at),
    updatedAt: asIsoDateRequired(row.updated_at)
  };
}

export async function insertSessionContext(input: InsertSessionContextInput): Promise<SessionContextEntity | undefined> {
  const result = await query<SessionContextRow>(
    `insert into session_contexts(
      id, integration_account_id, status, partner_document, partner_type, partner_code,
      user_access_code, user_name, email, auth_mode, jwt_token, jwt_token_ref,
      expires_at, last_validated_at, metadata
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
    returning *`,
    [
      input.id,
      input.integrationAccountId,
      input.status,
      input.partnerDocument,
      input.partnerType,
      input.partnerCode,
      input.userAccessCode,
      input.userName,
      input.email,
      input.authMode,
      input.jwtToken,
      input.jwtTokenRef,
      input.expiresAt,
      input.lastValidatedAt,
      JSON.stringify(input.metadata || {})
    ]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}

export async function updateSessionContext(id: string, patch: UpdateSessionContextPatch): Promise<SessionContextEntity | undefined> {
  const result = await query<SessionContextRow>(
    `update session_contexts set
       status = coalesce($2, status),
       partner_document = coalesce($3, partner_document),
       partner_type = coalesce($4, partner_type),
       partner_code = coalesce($5, partner_code),
       user_access_code = coalesce($6, user_access_code),
       user_name = coalesce($7, user_name),
       email = coalesce($8, email),
       auth_mode = coalesce($9, auth_mode),
       jwt_token = coalesce($10, jwt_token),
       jwt_token_ref = coalesce($11, jwt_token_ref),
       expires_at = coalesce($12, expires_at),
       last_validated_at = coalesce($13, last_validated_at),
       metadata = coalesce($14::jsonb, metadata),
       updated_at = now()
     where id = $1
     returning *`,
    [
      id,
      patch.status ?? null,
      patch.partnerDocument ?? null,
      patch.partnerType ?? null,
      patch.partnerCode ?? null,
      patch.userAccessCode ?? null,
      patch.userName ?? null,
      patch.email ?? null,
      patch.authMode ?? null,
      patch.jwtToken ?? null,
      patch.jwtTokenRef ?? null,
      patch.expiresAt ?? null,
      patch.lastValidatedAt ?? null,
      patch.metadata !== undefined ? JSON.stringify(patch.metadata) : null
    ]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}

export async function findSessionContextById(id: string): Promise<SessionContextEntity | undefined> {
  const result = await query<SessionContextRow>('select * from session_contexts where id = $1', [id]);
  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}

export async function findLatestActiveSessionContextByIntegrationAccount(integrationAccountId: string): Promise<SessionContextEntity | undefined> {
  const result = await query<SessionContextRow>(
    `select * from session_contexts
     where integration_account_id = $1 and status in ('active', 'pending_auth')
     order by updated_at desc, created_at desc
     limit 1`,
    [integrationAccountId]
  );
  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}
