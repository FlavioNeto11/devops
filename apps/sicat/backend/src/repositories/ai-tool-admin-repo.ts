import { query } from '../db/pool.js';
import { createPrefixedId } from '../lib/ids.js';

type JsonObject = Record<string, unknown>;
type IsoLike = Date | string | null | undefined;

function toIso(value: IsoLike): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

type AiToolOverrideRow = {
  id: string;
  tool_name: string;
  category: string | null;
  objective: string | null;
  dependencies: unknown;
  schema_json: JsonObject | null;
  default_policy_json: JsonObject | null;
  enabled: boolean;
  source: string;
  active_version_id: string | null;
  created_at: IsoLike;
  updated_at: IsoLike;
};

export type AiToolOverrideRecord = {
  id: string;
  toolName: string;
  category: string | null;
  objective: string | null;
  dependencies: string[];
  schemaJson: JsonObject | null;
  defaultPolicyJson: JsonObject;
  enabled: boolean;
  source: string;
  activeVersionId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function mapAiToolOverride(row: AiToolOverrideRow): AiToolOverrideRecord {
  return {
    id: row.id,
    toolName: row.tool_name,
    category: row.category,
    objective: row.objective,
    dependencies: toStringArray(row.dependencies),
    schemaJson: row.schema_json,
    defaultPolicyJson: row.default_policy_json || {},
    enabled: row.enabled,
    source: row.source,
    activeVersionId: row.active_version_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export async function listAiToolOverrides(): Promise<AiToolOverrideRecord[]> {
  const result = await query<AiToolOverrideRow>(`select * from ai_tools order by tool_name asc`);
  return result.rows.map(mapAiToolOverride);
}

export async function findAiToolOverride(toolName: string): Promise<AiToolOverrideRecord | null> {
  const result = await query<AiToolOverrideRow>(`select * from ai_tools where tool_name = $1`, [toolName]);
  const row = result.rows[0];
  return row ? mapAiToolOverride(row) : null;
}

export type UpsertAiToolInput = {
  toolName: string;
  category?: string | null;
  objective?: string | null;
  dependencies?: string[];
  schemaJson?: JsonObject | null;
  defaultPolicyJson?: JsonObject;
  enabled?: boolean;
  source?: string;
  activeVersionId?: string | null;
};

export async function upsertAiToolOverride(input: UpsertAiToolInput): Promise<AiToolOverrideRecord | null> {
  const result = await query<AiToolOverrideRow>(
    `insert into ai_tools(
      id, tool_name, category, objective, dependencies, schema_json,
      default_policy_json, enabled, source, active_version_id
    ) values ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9,$10)
    on conflict (tool_name) do update set
      category = coalesce(excluded.category, ai_tools.category),
      objective = coalesce(excluded.objective, ai_tools.objective),
      dependencies = coalesce(excluded.dependencies, ai_tools.dependencies),
      schema_json = coalesce(excluded.schema_json, ai_tools.schema_json),
      default_policy_json = excluded.default_policy_json,
      enabled = excluded.enabled,
      source = excluded.source,
      active_version_id = coalesce(excluded.active_version_id, ai_tools.active_version_id),
      updated_at = now()
    returning *`,
    [
      createPrefixedId('aitool'),
      input.toolName,
      input.category ?? null,
      input.objective ?? null,
      input.dependencies ? JSON.stringify(input.dependencies) : null,
      input.schemaJson ? JSON.stringify(input.schemaJson) : null,
      JSON.stringify(input.defaultPolicyJson || {}),
      input.enabled ?? true,
      input.source || 'db',
      input.activeVersionId ?? null
    ]
  );
  const row = result.rows[0];
  return row ? mapAiToolOverride(row) : null;
}

type AiToolVersionRow = {
  id: string;
  tool_id: string;
  version: string;
  schema_json: JsonObject | null;
  policy_json: JsonObject | null;
  changelog: string | null;
  created_by: string | null;
  created_at: IsoLike;
  activated_at: IsoLike;
};

export type AiToolVersionRecord = {
  id: string;
  toolId: string;
  version: string;
  schemaJson: JsonObject | null;
  policyJson: JsonObject;
  changelog: string | null;
  createdBy: string | null;
  createdAt: string | null;
  activatedAt: string | null;
};

function mapAiToolVersion(row: AiToolVersionRow): AiToolVersionRecord {
  return {
    id: row.id,
    toolId: row.tool_id,
    version: row.version,
    schemaJson: row.schema_json,
    policyJson: row.policy_json || {},
    changelog: row.changelog,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    activatedAt: toIso(row.activated_at)
  };
}

export async function insertAiToolVersion(input: {
  toolId: string;
  version: string;
  schemaJson?: JsonObject | null;
  policyJson?: JsonObject;
  changelog?: string | null;
  createdBy?: string | null;
}): Promise<AiToolVersionRecord | null> {
  const result = await query<AiToolVersionRow>(
    `insert into ai_tool_versions(id, tool_id, version, schema_json, policy_json, changelog, created_by)
     values ($1,$2,$3,$4,$5::jsonb,$6,$7) returning *`,
    [
      createPrefixedId('aitoolver'),
      input.toolId,
      input.version,
      input.schemaJson ? JSON.stringify(input.schemaJson) : null,
      JSON.stringify(input.policyJson || {}),
      input.changelog ?? null,
      input.createdBy ?? null
    ]
  );
  const row = result.rows[0];
  return row ? mapAiToolVersion(row) : null;
}

export async function listAiToolVersions(toolId: string): Promise<AiToolVersionRecord[]> {
  const result = await query<AiToolVersionRow>(
    `select * from ai_tool_versions where tool_id = $1 order by created_at desc limit 100`,
    [toolId]
  );
  return result.rows.map(mapAiToolVersion);
}

// ─── Agents ──────────────────────────────────────────────────────────────--

type AiAgentRow = {
  id: string;
  agent_name: string;
  description: string | null;
  specialist_type: string | null;
  tool_names: unknown;
  prompt_name: string | null;
  enabled: boolean;
  config_json: JsonObject | null;
  created_at: IsoLike;
  updated_at: IsoLike;
};

export type AiAgentRecord = {
  id: string;
  agentName: string;
  description: string | null;
  specialistType: string | null;
  toolNames: string[];
  promptName: string | null;
  enabled: boolean;
  config: JsonObject;
  createdAt: string | null;
  updatedAt: string | null;
};

function mapAiAgent(row: AiAgentRow): AiAgentRecord {
  return {
    id: row.id,
    agentName: row.agent_name,
    description: row.description,
    specialistType: row.specialist_type,
    toolNames: toStringArray(row.tool_names),
    promptName: row.prompt_name,
    enabled: row.enabled,
    config: row.config_json || {},
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export async function listAiAgentOverrides(): Promise<AiAgentRecord[]> {
  const result = await query<AiAgentRow>(`select * from ai_agents order by agent_name asc`);
  return result.rows.map(mapAiAgent);
}

export async function findAiAgentOverride(agentName: string): Promise<AiAgentRecord | null> {
  const result = await query<AiAgentRow>(`select * from ai_agents where agent_name = $1`, [agentName]);
  const row = result.rows[0];
  return row ? mapAiAgent(row) : null;
}

export async function upsertAiAgentOverride(input: {
  agentName: string;
  description?: string | null;
  specialistType?: string | null;
  toolNames?: string[];
  promptName?: string | null;
  enabled?: boolean;
  config?: JsonObject;
}): Promise<AiAgentRecord | null> {
  const result = await query<AiAgentRow>(
    `insert into ai_agents(
      id, agent_name, description, specialist_type, tool_names, prompt_name, enabled, config_json
    ) values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb)
    on conflict (agent_name) do update set
      description = coalesce(excluded.description, ai_agents.description),
      specialist_type = coalesce(excluded.specialist_type, ai_agents.specialist_type),
      tool_names = coalesce(excluded.tool_names, ai_agents.tool_names),
      prompt_name = coalesce(excluded.prompt_name, ai_agents.prompt_name),
      enabled = excluded.enabled,
      config_json = excluded.config_json,
      updated_at = now()
    returning *`,
    [
      createPrefixedId('aiagent'),
      input.agentName,
      input.description ?? null,
      input.specialistType ?? null,
      input.toolNames ? JSON.stringify(input.toolNames) : null,
      input.promptName ?? null,
      input.enabled ?? true,
      JSON.stringify(input.config || {})
    ]
  );
  const row = result.rows[0];
  return row ? mapAiAgent(row) : null;
}
