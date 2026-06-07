import { query } from '../db/pool.js';

type SicatUserRow = {
  id: string;
  email: string;
  password_hash: string;
  password_expires_at: string | Date | null;
  name: string | null;
  is_active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

type SicatUserEntity = {
  id: string;
  email: string;
  passwordHash: string;
  passwordExpiresAt: string | Date | null;
  name: string | null;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type InsertSicatUserInput = {
  id: string;
  email: string;
  passwordHash: string;
  passwordExpiresAt?: string | Date | null;
  name?: string | null;
  isActive?: boolean;
};

type UpdateSicatPasswordInput = {
  userId: string;
  passwordHash: string;
  passwordExpiresAt?: string | Date | null;
};

function asIsoDate(value: string | Date | null): string | Date | null {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function asIsoDateRequired(value: string | Date): string | Date {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapRow(row: SicatUserRow): SicatUserEntity {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    passwordExpiresAt: asIsoDate(row.password_expires_at),
    name: row.name,
    isActive: row.is_active,
    createdAt: asIsoDateRequired(row.created_at),
    updatedAt: asIsoDateRequired(row.updated_at)
  };
}

export async function findByEmail(email: string): Promise<SicatUserEntity | undefined> {
  const result = await query<SicatUserRow>('select * from sicat_users where email = $1', [email]);
  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}

export async function findById(id: string): Promise<SicatUserEntity | undefined> {
  const result = await query<SicatUserRow>('select * from sicat_users where id = $1', [id]);
  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}

export async function insert(input: InsertSicatUserInput): Promise<SicatUserEntity | undefined> {
  const result = await query<SicatUserRow>(
    `insert into sicat_users(id, email, password_hash, password_expires_at, name, is_active)
     values ($1,$2,$3,$4,$5,$6)
     returning *`,
    [
      input.id,
      input.email,
      input.passwordHash,
      input.passwordExpiresAt ?? null,
      input.name ?? null,
      input.isActive ?? true
    ]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}

export async function updatePassword(input: UpdateSicatPasswordInput): Promise<SicatUserEntity | undefined> {
  const result = await query<SicatUserRow>(
    `update sicat_users
        set password_hash = $2,
            password_expires_at = $3,
            updated_at = now()
      where id = $1
      returning *`,
    [
      input.userId,
      input.passwordHash,
      input.passwordExpiresAt ?? null
    ]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}

export async function updatePasswordExpiration(userId: string, passwordExpiresAt: string | Date | null): Promise<SicatUserEntity | undefined> {
  const result = await query<SicatUserRow>(
    `update sicat_users
        set password_expires_at = $2,
            updated_at = now()
      where id = $1
      returning *`,
    [userId, passwordExpiresAt]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : undefined;
}
