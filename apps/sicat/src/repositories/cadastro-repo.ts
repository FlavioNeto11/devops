import { query } from '../db/pool.js';

type CadastroRow = {
  id: string;
  integration_account_id: string;
  status: string;
  requested_by: string | null;
  correlation_id: string | null;
  payload: Record<string, unknown> | null;
  external_response: Record<string, unknown> | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type CadastroEntity = {
  id: string;
  integrationAccountId: string;
  status: string;
  requestedBy: string | null;
  correlationId: string | null;
  payload: Record<string, unknown> | null;
  externalResponse: Record<string, unknown> | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type InsertCadastroInput = {
  id: string;
  integrationAccountId: string;
  status: string;
  requestedBy?: string | null;
  correlationId?: string | null;
  payload: Record<string, unknown>;
};

type UpdateCadastroPatch = {
  status?: string | null;
  externalResponse?: Record<string, unknown> | null;
};

function asIsoDate(value: string | Date): string | Date {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function mapRow(row: CadastroRow | undefined): CadastroEntity | undefined {
  return row && {
    id: row.id,
    integrationAccountId: row.integration_account_id,
    status: row.status,
    requestedBy: row.requested_by,
    correlationId: row.correlation_id,
    payload: row.payload,
    externalResponse: row.external_response,
    createdAt: asIsoDate(row.created_at),
    updatedAt: asIsoDate(row.updated_at)
  };
}

export async function insertCadastro(input: InsertCadastroInput): Promise<CadastroEntity | undefined> {
  const result = await query<CadastroRow>(
    `insert into cadastros(id, integration_account_id, status, requested_by, correlation_id, payload)
     values ($1,$2,$3,$4,$5,$6::jsonb)
     returning *`,
    [input.id, input.integrationAccountId, input.status, input.requestedBy, input.correlationId, JSON.stringify(input.payload)]
  );
  return mapRow(result.rows[0]);
}

export async function updateCadastro(id: string, patch: UpdateCadastroPatch): Promise<CadastroEntity | undefined> {
  const result = await query<CadastroRow>(
    `update cadastros
       set status = coalesce($2, status),
           external_response = coalesce($3::jsonb, external_response),
           updated_at = now()
     where id = $1
     returning *`,
    [id, patch.status || null, patch.externalResponse ? JSON.stringify(patch.externalResponse) : null]
  );
  return mapRow(result.rows[0]);
}

export async function findCadastroById(id: string): Promise<CadastroEntity | undefined> {
  const result = await query<CadastroRow>('select * from cadastros where id = $1', [id]);
  return mapRow(result.rows[0]);
}
