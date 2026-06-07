/**
 * Administração de evals/smoke. Reaproveita scripts/ai-smoke/run-sicat-ai-smoke.mjs.
 * - dry-run: seguro (não chama backend/LLM);
 * - sample/category: requer servidor + token + OpenAI (capturado no summary);
 * - full: BLOQUEADO salvo AI_CONTROL_ALLOW_FULL_SMOKE=true;
 * - mutações sempre desabilitadas (SICAT_AI_SMOKE_ALLOW_MUTATIONS=false).
 * Persiste ai_eval_runs/ai_eval_cases e emite eventos SSE eval.started/eval.done.
 */
import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppError } from '../../lib/problem.js';
import { getAiControlConfig } from './ai-control-config.js';
import { emitAiControlStreamEvent } from './ai-control-observability-service.js';
import {
  insertAiEvalRun,
  updateAiEvalRun,
  getAiEvalRun,
  listAiEvalRuns,
  insertAiEvalCases,
  listAiEvalCases,
  type AiEvalRunRecord
} from '../../repositories/ai-eval-admin-repo.js';
import type {
  AiEvalBattery,
  AiEvalCase,
  AiEvalMode,
  AiEvalRun,
  AiEvalStatus,
  AiEvalSummary
} from './ai-control-types.js';

const execFileAsync = promisify(execFile);
const SAMPLE_CATALOG = 'docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl';
const FULL_CATALOG = 'docs/ai-chat/intents/sicat-chat-intent-catalog.jsonl';
const OUTPUT_DIR = process.env.SICAT_AI_SMOKE_OUTPUT_DIR || 'artifacts/ai-smoke';

type SmokeReasonCode = { code?: unknown; count?: unknown };
type SmokeCategoryCount = { category?: unknown; count?: unknown };
type SmokeResult = {
  scenario?: {
    id?: string;
    category?: string;
    prompt?: string;
    minimum_score?: number;
    must_contain_any?: unknown;
  };
  pass?: boolean;
  actualText?: string;
  backendResponse?: { llm?: { provider?: string } };
  judgement?: { score?: number; pass?: boolean; findings?: unknown };
};
type SmokeReport = {
  total?: number;
  passed?: number;
  failed?: number;
  passRate?: number;
  topReasonCodes?: SmokeReasonCode[];
  failedCategories?: SmokeCategoryCount[];
  results?: SmokeResult[];
};

async function countCatalogLines(path: string): Promise<number> {
  try {
    const raw = await fs.readFile(resolve(process.cwd(), path), 'utf8');
    return raw.split('\n').filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

export async function listEvalBatteries(): Promise<AiEvalBattery[]> {
  const sample = await countCatalogLines(SAMPLE_CATALOG);
  const full = await countCatalogLines(FULL_CATALOG);
  const allowFull = getAiControlConfig().allowFullSmoke;
  return [
    {
      key: 'dry-run',
      label: 'Smoke dry-run (amostra, sem backend)',
      mode: 'dry-run',
      catalog: SAMPLE_CATALOG,
      totalScenarios: sample,
      description: 'Valida o pipeline sem chamar backend/LLM. Todos passam (score=1). Sempre liberado.',
      blockedByDefault: false
    },
    {
      key: 'sample',
      label: 'Smoke sample',
      mode: 'sample',
      catalog: SAMPLE_CATALOG,
      totalScenarios: sample,
      description: 'Bateria amostral contra /v1/conversations/turns + juiz LLM. Requer servidor + token + OpenAI.',
      blockedByDefault: false
    },
    {
      key: 'category',
      label: 'Smoke por categoria',
      mode: 'category',
      catalog: FULL_CATALOG,
      totalScenarios: full,
      description: 'Filtra o catálogo completo por categoria.',
      blockedByDefault: false
    },
    {
      key: 'full',
      label: 'Smoke completo',
      mode: 'full',
      catalog: FULL_CATALOG,
      totalScenarios: full,
      description: 'Bateria completa. Custosa; bloqueada por padrão (AI_CONTROL_ALLOW_FULL_SMOKE).',
      blockedByDefault: !allowFull
    }
  ];
}

function buildSmokeArgs(input: RunEvalInput): string[] {
  const args: string[] = [];
  if (input.mode === 'full') {
    args.push('--catalog', FULL_CATALOG, '--no-fail-fast');
  } else if (input.mode === 'category') {
    args.push('--catalog', FULL_CATALOG, '--category', input.category || '', '--no-fail-fast');
  } else if (input.mode === 'dry-run') {
    args.push('--catalog', SAMPLE_CATALOG, '--dry-run');
  } else {
    args.push('--catalog', SAMPLE_CATALOG, '--no-fail-fast');
  }
  if (input.max && input.max > 0) {
    args.push('--max', String(Math.trunc(input.max)));
  }
  return args;
}

async function readLatestReport(): Promise<SmokeReport | null> {
  try {
    const dir = resolve(process.cwd(), OUTPUT_DIR);
    const files = (await fs.readdir(dir)).filter((file) => file.startsWith('sicat-ai-smoke-') && file.endsWith('.json'));
    let latest: { file: string; mtime: number } | null = null;
    for (const file of files) {
      const stat = await fs.stat(resolve(dir, file));
      if (!latest || stat.mtimeMs > latest.mtime) {
        latest = { file, mtime: stat.mtimeMs };
      }
    }
    if (!latest) return null;
    const raw = await fs.readFile(resolve(dir, latest.file), 'utf8');
    return JSON.parse(raw) as SmokeReport;
  } catch {
    return null;
  }
}

function summarizeReport(report: SmokeReport): AiEvalSummary {
  const results = Array.isArray(report.results) ? report.results : [];
  const scores = results
    .map((result) => (typeof result.judgement?.score === 'number' ? result.judgement.score : null))
    .filter((score): score is number => score !== null);
  const avgScore = scores.length > 0 ? scores.reduce((acc, value) => acc + value, 0) / scores.length : null;

  return {
    total: report.total ?? results.length,
    passed: report.passed ?? results.filter((result) => result.pass).length,
    failed: report.failed ?? results.filter((result) => !result.pass).length,
    passRate: typeof report.passRate === 'number' ? report.passRate : null,
    avgScore: avgScore !== null ? Number(avgScore.toFixed(3)) : null,
    regressions: null,
    toolAccuracy: null,
    policyAccuracy: null,
    topReasonCodes: Array.isArray(report.topReasonCodes)
      ? report.topReasonCodes.map((entry) => ({ code: String(entry.code ?? 'UNKNOWN'), count: Number(entry.count) || 0 }))
      : [],
    failedCategories: Array.isArray(report.failedCategories)
      ? report.failedCategories.map((entry) => ({ category: String(entry.category ?? 'unknown'), count: Number(entry.count) || 0 }))
      : []
  };
}

function toEvalRunDto(record: AiEvalRunRecord): AiEvalRun {
  const hasSummary = record.summary && Object.keys(record.summary).length > 0;
  return {
    runId: record.id,
    runKey: record.runKey,
    mode: record.mode as AiEvalMode,
    status: record.status as AiEvalStatus,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    requestedBy: record.requestedBy,
    summary: hasSummary ? (record.summary as unknown as AiEvalSummary) : null,
    langfuseDatasetRunId: record.langfuseDatasetRunId,
    createdAt: record.createdAt
  };
}

export type RunEvalInput = {
  mode: AiEvalMode;
  category?: string | null;
  max?: number | null;
  requestedBy: string;
};

export async function runEval(input: RunEvalInput): Promise<AiEvalRun> {
  const config = getAiControlConfig();
  if (input.mode === 'full' && !config.allowFullSmoke) {
    throw new AppError(
      409,
      'Full Smoke Blocked',
      'Execucao full do smoke esta bloqueada. Defina AI_CONTROL_ALLOW_FULL_SMOKE=true para liberar.',
      { code: 'FULL_SMOKE_BLOCKED' }
    );
  }
  if (input.mode === 'category' && !(input.category || '').trim()) {
    throw new AppError(400, 'Bad Request', 'Modo category exige o parametro category.', { code: 'CATEGORY_REQUIRED' });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runKey = `${input.mode}-${stamp}-${Math.floor(Math.random() * 9000 + 1000)}`;
  const runRecord = await insertAiEvalRun({
    runKey,
    mode: input.mode,
    status: 'running',
    requestedBy: input.requestedBy,
    startedAt: new Date().toISOString()
  });
  if (!runRecord) {
    throw new AppError(500, 'Internal Server Error', 'Falha ao registrar execucao de eval.', { code: 'EVAL_RUN_FAILED' });
  }
  emitAiControlStreamEvent('eval.started', { runId: runRecord.id, mode: input.mode, runKey });

  const args = buildSmokeArgs(input);
  let report: SmokeReport | null = null;
  let status: AiEvalStatus = 'error';
  let summaryJson: Record<string, unknown> = {};

  try {
    await execFileAsync(process.execPath, ['scripts/ai-smoke/run-sicat-ai-smoke.mjs', ...args], {
      cwd: process.cwd(),
      timeout: input.mode === 'full' ? 600_000 : 300_000,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, SICAT_AI_SMOKE_ALLOW_MUTATIONS: 'false' }
    });
    report = await readLatestReport();
  } catch (error: unknown) {
    // O runner sai com código 1 quando há falhas — mas ainda escreve o relatório.
    report = await readLatestReport();
    if (!report) {
      summaryJson = { error: error instanceof Error ? error.message : 'falha ao executar smoke' };
    }
  }

  if (report) {
    const summary = summarizeReport(report);
    summaryJson = summary as unknown as Record<string, unknown>;
    status = summary.failed > 0 ? 'failed' : 'passed';
    const results = Array.isArray(report.results) ? report.results : [];
    const cases = results.slice(0, 500).map((result) => ({
      caseId: result.scenario?.id || 'unknown',
      category: result.scenario?.category ?? null,
      prompt: result.scenario?.prompt ?? null,
      expected: {
        minimumScore: result.scenario?.minimum_score ?? null,
        mustContainAny: result.scenario?.must_contain_any ?? null
      },
      actual: {
        text: result.actualText ?? null,
        provider: result.backendResponse?.llm?.provider ?? null
      },
      score: (result.judgement ?? {}) as Record<string, unknown>,
      status: result.pass ? 'passed' : 'failed',
      traceId: null
    }));
    await insertAiEvalCases(runRecord.id, cases).catch(() => 0);
  }

  const finished = await updateAiEvalRun(runRecord.id, {
    status,
    finishedAt: new Date().toISOString(),
    summary: summaryJson
  });
  emitAiControlStreamEvent('eval.done', { runId: runRecord.id, status });
  return toEvalRunDto(finished || runRecord);
}

export async function listEvalRuns(limit = 50): Promise<AiEvalRun[]> {
  const runs = await listAiEvalRuns(limit);
  return runs.map(toEvalRunDto);
}

export async function getEvalRunDetail(runId: string): Promise<{ run: AiEvalRun; cases: AiEvalCase[] }> {
  const record = await getAiEvalRun(runId);
  if (!record) {
    throw new AppError(404, 'Not Found', `Execucao de eval ${runId} nao encontrada.`, { code: 'EVAL_RUN_NOT_FOUND' });
  }
  const cases = await listAiEvalCases(runId);
  return {
    run: toEvalRunDto(record),
    cases: cases.map((item) => ({
      caseId: item.caseId,
      category: item.category,
      prompt: item.prompt,
      expected: item.expected,
      actual: item.actual,
      score: item.score,
      status: item.status,
      traceId: item.traceId
    }))
  };
}
