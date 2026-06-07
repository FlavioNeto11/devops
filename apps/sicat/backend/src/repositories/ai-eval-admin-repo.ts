import { query } from '../db/pool.js';
import { createPrefixedId } from '../lib/ids.js';

type JsonObject = Record<string, unknown>;
type IsoLike = Date | string | null | undefined;

function toIso(value: IsoLike): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

type AiEvalRunRow = {
  id: string;
  run_key: string;
  mode: string;
  status: string;
  started_at: IsoLike;
  finished_at: IsoLike;
  requested_by: string | null;
  summary_json: JsonObject | null;
  langfuse_dataset_run_id: string | null;
  created_at: IsoLike;
};

export type AiEvalRunRecord = {
  id: string;
  runKey: string;
  mode: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  requestedBy: string | null;
  summary: JsonObject;
  langfuseDatasetRunId: string | null;
  createdAt: string | null;
};

function mapAiEvalRun(row: AiEvalRunRow): AiEvalRunRecord {
  return {
    id: row.id,
    runKey: row.run_key,
    mode: row.mode,
    status: row.status,
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at),
    requestedBy: row.requested_by,
    summary: row.summary_json || {},
    langfuseDatasetRunId: row.langfuse_dataset_run_id,
    createdAt: toIso(row.created_at)
  };
}

export async function insertAiEvalRun(input: {
  runKey: string;
  mode: string;
  status?: string;
  requestedBy?: string | null;
  startedAt?: string | null;
}): Promise<AiEvalRunRecord | null> {
  const result = await query<AiEvalRunRow>(
    `insert into ai_eval_runs(id, run_key, mode, status, requested_by, started_at)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [
      createPrefixedId('aieval'),
      input.runKey,
      input.mode,
      input.status || 'queued',
      input.requestedBy ?? null,
      input.startedAt ?? null
    ]
  );
  const row = result.rows[0];
  return row ? mapAiEvalRun(row) : null;
}

export async function updateAiEvalRun(runId: string, patch: {
  status?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  summary?: JsonObject;
  langfuseDatasetRunId?: string | null;
}): Promise<AiEvalRunRecord | null> {
  const result = await query<AiEvalRunRow>(
    `update ai_eval_runs set
       status = coalesce($2, status),
       started_at = coalesce($3, started_at),
       finished_at = coalesce($4, finished_at),
       summary_json = coalesce($5::jsonb, summary_json),
       langfuse_dataset_run_id = coalesce($6, langfuse_dataset_run_id)
     where id = $1
     returning *`,
    [
      runId,
      patch.status ?? null,
      patch.startedAt ?? null,
      patch.finishedAt ?? null,
      patch.summary ? JSON.stringify(patch.summary) : null,
      patch.langfuseDatasetRunId ?? null
    ]
  );
  const row = result.rows[0];
  return row ? mapAiEvalRun(row) : null;
}

export async function getAiEvalRun(runId: string): Promise<AiEvalRunRecord | null> {
  const result = await query<AiEvalRunRow>(`select * from ai_eval_runs where id = $1`, [runId]);
  const row = result.rows[0];
  return row ? mapAiEvalRun(row) : null;
}

export async function listAiEvalRuns(limit = 50): Promise<AiEvalRunRecord[]> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.trunc(limit))) : 50;
  const result = await query<AiEvalRunRow>(
    `select * from ai_eval_runs order by created_at desc limit $1`,
    [safeLimit]
  );
  return result.rows.map(mapAiEvalRun);
}

type AiEvalCaseRow = {
  id: string;
  run_id: string;
  case_id: string;
  category: string | null;
  prompt: string | null;
  expected_json: JsonObject | null;
  actual_json: JsonObject | null;
  score_json: JsonObject | null;
  status: string | null;
  trace_id: string | null;
  created_at: IsoLike;
};

export type AiEvalCaseRecord = {
  id: string;
  runId: string;
  caseId: string;
  category: string | null;
  prompt: string | null;
  expected: JsonObject;
  actual: JsonObject;
  score: JsonObject;
  status: string | null;
  traceId: string | null;
  createdAt: string | null;
};

function mapAiEvalCase(row: AiEvalCaseRow): AiEvalCaseRecord {
  return {
    id: row.id,
    runId: row.run_id,
    caseId: row.case_id,
    category: row.category,
    prompt: row.prompt,
    expected: row.expected_json || {},
    actual: row.actual_json || {},
    score: row.score_json || {},
    status: row.status,
    traceId: row.trace_id,
    createdAt: toIso(row.created_at)
  };
}

export async function insertAiEvalCases(runId: string, cases: Array<{
  caseId: string;
  category?: string | null;
  prompt?: string | null;
  expected?: JsonObject;
  actual?: JsonObject;
  score?: JsonObject;
  status?: string | null;
  traceId?: string | null;
}>): Promise<number> {
  let inserted = 0;
  for (const item of cases) {
    await query(
      `insert into ai_eval_cases(
        id, run_id, case_id, category, prompt, expected_json, actual_json, score_json, status, trace_id
      ) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10)`,
      [
        createPrefixedId('aievalcase'),
        runId,
        item.caseId,
        item.category ?? null,
        item.prompt ?? null,
        JSON.stringify(item.expected || {}),
        JSON.stringify(item.actual || {}),
        JSON.stringify(item.score || {}),
        item.status ?? null,
        item.traceId ?? null
      ]
    );
    inserted += 1;
  }
  return inserted;
}

export async function listAiEvalCases(runId: string, limit = 500): Promise<AiEvalCaseRecord[]> {
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(1000, Math.trunc(limit))) : 500;
  const result = await query<AiEvalCaseRow>(
    `select * from ai_eval_cases where run_id = $1 order by created_at asc limit $2`,
    [runId, safeLimit]
  );
  return result.rows.map(mapAiEvalCase);
}
