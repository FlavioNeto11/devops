import { query } from '../db/pool.js';
import { createPrefixedId } from '../lib/ids.js';

type JsonObject = Record<string, unknown>;
type IsoLike = Date | string | null | undefined;

function toIso(value: IsoLike): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toIntOrNull(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

type AiPromptRow = {
  id: string;
  prompt_name: string;
  description: string | null;
  provider_source: string;
  active_version_id: string | null;
  created_at: IsoLike;
  updated_at: IsoLike;
};

export type AiPromptRecord = {
  id: string;
  promptName: string;
  description: string | null;
  providerSource: string;
  activeVersionId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function mapAiPrompt(row: AiPromptRow): AiPromptRecord {
  return {
    id: row.id,
    promptName: row.prompt_name,
    description: row.description,
    providerSource: row.provider_source,
    activeVersionId: row.active_version_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export async function listAiPrompts(): Promise<AiPromptRecord[]> {
  const result = await query<AiPromptRow>(`select * from ai_prompts order by prompt_name asc`);
  return result.rows.map(mapAiPrompt);
}

export async function findAiPrompt(promptName: string): Promise<AiPromptRecord | null> {
  const result = await query<AiPromptRow>(`select * from ai_prompts where prompt_name = $1`, [promptName]);
  const row = result.rows[0];
  return row ? mapAiPrompt(row) : null;
}

export async function upsertAiPrompt(input: {
  promptName: string;
  description?: string | null;
  providerSource?: string;
}): Promise<AiPromptRecord | null> {
  const result = await query<AiPromptRow>(
    `insert into ai_prompts(id, prompt_name, description, provider_source)
     values ($1,$2,$3,$4)
     on conflict (prompt_name) do update set
       description = coalesce(excluded.description, ai_prompts.description),
       provider_source = excluded.provider_source,
       updated_at = now()
     returning *`,
    [createPrefixedId('aiprompt'), input.promptName, input.description ?? null, input.providerSource || 'local']
  );
  const row = result.rows[0];
  return row ? mapAiPrompt(row) : null;
}

export async function setAiPromptActiveVersion(promptId: string, versionId: string | null): Promise<void> {
  await query(
    `update ai_prompts set active_version_id = $2, updated_at = now() where id = $1`,
    [promptId, versionId]
  );
}

type AiPromptVersionRow = {
  id: string;
  prompt_id: string;
  version: string;
  label: string | null;
  model: string | null;
  prompt_text: string;
  prompt_config_json: JsonObject | null;
  langfuse_prompt_id: string | null;
  langfuse_version: number | null;
  created_by: string | null;
  created_at: IsoLike;
  activated_at: IsoLike;
};

export type AiPromptVersionRecord = {
  id: string;
  promptId: string;
  version: string;
  label: string | null;
  model: string | null;
  promptText: string;
  promptConfig: JsonObject;
  langfusePromptId: string | null;
  langfuseVersion: number | null;
  createdBy: string | null;
  createdAt: string | null;
  activatedAt: string | null;
};

function mapAiPromptVersion(row: AiPromptVersionRow): AiPromptVersionRecord {
  return {
    id: row.id,
    promptId: row.prompt_id,
    version: row.version,
    label: row.label,
    model: row.model,
    promptText: row.prompt_text,
    promptConfig: row.prompt_config_json || {},
    langfusePromptId: row.langfuse_prompt_id,
    langfuseVersion: toIntOrNull(row.langfuse_version),
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    activatedAt: toIso(row.activated_at)
  };
}

export async function listAiPromptVersions(promptId: string): Promise<AiPromptVersionRecord[]> {
  const result = await query<AiPromptVersionRow>(
    `select * from ai_prompt_versions where prompt_id = $1 order by created_at desc limit 100`,
    [promptId]
  );
  return result.rows.map(mapAiPromptVersion);
}

export async function findAiPromptVersionById(versionId: string): Promise<AiPromptVersionRecord | null> {
  const result = await query<AiPromptVersionRow>(`select * from ai_prompt_versions where id = $1`, [versionId]);
  const row = result.rows[0];
  return row ? mapAiPromptVersion(row) : null;
}

export async function insertAiPromptVersion(input: {
  promptId: string;
  version: string;
  label?: string | null;
  model?: string | null;
  promptText: string;
  promptConfig?: JsonObject;
  langfusePromptId?: string | null;
  langfuseVersion?: number | null;
  createdBy?: string | null;
}): Promise<AiPromptVersionRecord | null> {
  const result = await query<AiPromptVersionRow>(
    `insert into ai_prompt_versions(
      id, prompt_id, version, label, model, prompt_text, prompt_config_json,
      langfuse_prompt_id, langfuse_version, created_by
    ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) returning *`,
    [
      createPrefixedId('aipromptver'),
      input.promptId,
      input.version,
      input.label ?? null,
      input.model ?? null,
      input.promptText,
      JSON.stringify(input.promptConfig || {}),
      input.langfusePromptId ?? null,
      input.langfuseVersion ?? null,
      input.createdBy ?? null
    ]
  );
  const row = result.rows[0];
  return row ? mapAiPromptVersion(row) : null;
}

export async function markAiPromptVersionActivated(versionId: string): Promise<void> {
  await query(`update ai_prompt_versions set activated_at = now() where id = $1`, [versionId]);
}

/** Versão ativa de um prompt (join prompt + active version). Usado para resolver prompt em runtime. */
export async function findActivePromptVersionByName(promptName: string): Promise<AiPromptVersionRecord | null> {
  const result = await query<AiPromptVersionRow>(
    `select v.* from ai_prompt_versions v
       join ai_prompts p on p.active_version_id = v.id
      where p.prompt_name = $1
      limit 1`,
    [promptName]
  );
  const row = result.rows[0];
  return row ? mapAiPromptVersion(row) : null;
}
