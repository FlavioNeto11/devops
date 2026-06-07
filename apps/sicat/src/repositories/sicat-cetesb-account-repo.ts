import { query } from '../db/pool.js';

type UsageSummary = {
  manifestsCreated: number;
  manifestsSubmitted: number;
  manifestsPrinted: number;
  manifestsCancelled: number;
};

type SicatCetesbAccountRow = {
  id: string;
  user_id: string;
  partner_code: string | null;
  partner_document: string | null;
  partner_name: string | null;
  account_type: string;
  cetesb_login: string | null;
  cetesb_email: string | null;
  cetesb_password_ciphertext: string | null;
  cetesb_password_iv: string | null;
  cetesb_password_tag: string | null;
  last_connection_at: string | Date | null;
  last_usage_at: string | Date | null;
  usage_summary: UsageSummary | null;
  is_active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

type SicatCetesbAccountEntity = {
  id: string;
  userId: string;
  partnerCode: string | null;
  partnerDocument: string | null;
  partnerName: string | null;
  accountType: string;
  cetesbLogin: string | null;
  cetesbEmail: string | null;
  cetesbPasswordCiphertext: string | null;
  cetesbPasswordIv: string | null;
  cetesbPasswordTag: string | null;
  lastConnectionAt: string | Date | null;
  lastUsageAt: string | Date | null;
  usageSummary: UsageSummary | null;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type InsertSicatCetesbAccountInput = {
  id: string;
  userId: string;
  partnerCode?: string | null;
  partnerDocument?: string | null;
  partnerName?: string | null;
  accountType?: string | null;
  cetesbLogin?: string | null;
  cetesbEmail?: string | null;
  cetesbPasswordCiphertext?: string | null;
  cetesbPasswordIv?: string | null;
  cetesbPasswordTag?: string | null;
  lastConnectionAt?: string | Date | null;
  lastUsageAt?: string | Date | null;
  usageSummary?: UsageSummary | null;
  isActive?: boolean;
};

function asIsoDate(value: string | Date | null): string | Date | null {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function asIsoDateRequired(value: string | Date): string | Date {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapRow(row: SicatCetesbAccountRow): SicatCetesbAccountEntity {
  return {
    id: row.id,
    userId: row.user_id,
    partnerCode: row.partner_code,
    partnerDocument: row.partner_document,
    partnerName: row.partner_name,
    accountType: row.account_type,
    cetesbLogin: row.cetesb_login,
    cetesbEmail: row.cetesb_email,
    cetesbPasswordCiphertext: row.cetesb_password_ciphertext,
    cetesbPasswordIv: row.cetesb_password_iv,
    cetesbPasswordTag: row.cetesb_password_tag,
    lastConnectionAt: asIsoDate(row.last_connection_at),
    lastUsageAt: asIsoDate(row.last_usage_at),
    usageSummary: row.usage_summary,
    isActive: row.is_active,
    createdAt: asIsoDateRequired(row.created_at),
    updatedAt: asIsoDateRequired(row.updated_at)
  };
}

export async function listByUserId(userId: string): Promise<SicatCetesbAccountEntity[]> {
  const result = await query<SicatCetesbAccountRow>(
    `select * from sicat_cetesb_accounts
     where user_id = $1
     order by is_active desc, last_usage_at desc nulls last, created_at desc`,
    [userId]
  );

  return result.rows.map((row) => mapRow(row));
}

export async function insert(input: InsertSicatCetesbAccountInput): Promise<SicatCetesbAccountEntity | undefined> {
  const result = await query<SicatCetesbAccountRow>(
    `insert into sicat_cetesb_accounts(
      id, user_id, partner_code, partner_document, partner_name, account_type,
      cetesb_login, cetesb_email, cetesb_password_ciphertext, cetesb_password_iv, cetesb_password_tag,
      last_connection_at, last_usage_at, usage_summary, is_active
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)
    returning *`,
    [
      input.id,
      input.userId,
      input.partnerCode ?? null,
      input.partnerDocument ?? null,
      input.partnerName ?? null,
      input.accountType || 'unknown',
      input.cetesbLogin ?? null,
      input.cetesbEmail ?? null,
      input.cetesbPasswordCiphertext ?? null,
      input.cetesbPasswordIv ?? null,
      input.cetesbPasswordTag ?? null,
      input.lastConnectionAt ?? null,
      input.lastUsageAt ?? null,
      JSON.stringify(input.usageSummary || {
        manifestsCreated: 0,
        manifestsSubmitted: 0,
        manifestsPrinted: 0,
        manifestsCancelled: 0
      }),
      input.isActive ?? true
    ]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}

export async function findByIdAndUserId(id: string, userId: string): Promise<SicatCetesbAccountEntity | undefined> {
  const result = await query<SicatCetesbAccountRow>(
    'select * from sicat_cetesb_accounts where id = $1 and user_id = $2',
    [id, userId]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}

export async function findById(id: string): Promise<SicatCetesbAccountEntity | undefined> {
  const result = await query<SicatCetesbAccountRow>(
    'select * from sicat_cetesb_accounts where id = $1',
    [id]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}

export async function deactivateAllByUserId(userId: string): Promise<SicatCetesbAccountEntity[]> {
  const result = await query<SicatCetesbAccountRow>(
    `update sicat_cetesb_accounts
        set is_active = false,
            updated_at = now()
      where user_id = $1
      returning *`,
    [userId]
  );

  return result.rows.map((row) => mapRow(row));
}

export async function activateById(id: string): Promise<SicatCetesbAccountEntity | undefined> {
  const result = await query<SicatCetesbAccountRow>(
    `update sicat_cetesb_accounts
        set is_active = true,
            last_connection_at = now(),
            last_usage_at = now(),
            updated_at = now()
      where id = $1
      returning *`,
    [id]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}

export async function deleteByIdAndUserId(id: string, userId: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    `delete from sicat_cetesb_accounts
      where id = $1 and user_id = $2
      returning id`,
    [id, userId]
  );

  return (result.rowCount ?? 0) > 0;
}
