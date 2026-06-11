import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_SMOKE_RUN_OPTIONS = {
  failFast: true,
  maxFailures: 0,
  maxConsecutiveFailures: 3,
  lowScoreThreshold: 0.65,
  maxConsecutiveLowScores: 3,
  minPassRate: 0,
  batchSize: 25,
  stopAfterBatchIfBelowPassRate: 0.7
};

const LOW_SCORE_FORCE_ZERO_REASON_CODES = new Set([
  'HEURISTIC_PROVIDER_NOT_ALLOWED',
  'FALLBACK_NOT_ALLOWED',
  'INVALID_LLM_PROVIDER',
  'RESPONDED_PROVIDER_UNAVAILABLE',
  'SMOKE_JUDGE_CONFIG_ERROR',
  'BACKEND_GATE_REPROVADO',
  'EXECUTION_ERROR',
  'PROVIDER_UNAVAILABLE_INDEVIDO'
]);

const ESCALATION_REASON_KEYS = [
  'low_confidence',
  'high_risk',
  'quality_issue',
  'tool_ambiguity',
  'complexity'
];

function parseNumberArg(rawValue, flagName) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    throw new TypeError(`Valor invalido para ${flagName}: ${rawValue}`);
  }
  return value;
}

function parseArgs(argv) {
  const args = {
    catalog: '',
    category: '',
    max: 0,
    dryRun: false,
    failFast: undefined,
    maxFailures: undefined,
    maxConsecutiveFailures: undefined,
    lowScoreThreshold: undefined,
    maxConsecutiveLowScores: undefined,
    minPassRate: undefined,
    batchSize: undefined,
    stopAfterBatchIfBelowPassRate: undefined,
    provided: {
      failFast: false,
      maxFailures: false,
      maxConsecutiveFailures: false,
      lowScoreThreshold: false,
      maxConsecutiveLowScores: false,
      minPassRate: false,
      batchSize: false,
      stopAfterBatchIfBelowPassRate: false
    }
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--catalog') args.catalog = argv[++index];
    else if (arg === '--category') args.category = argv[++index] || '';
    else if (arg === '--max') args.max = parseNumberArg(argv[++index] || 0, '--max');
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--fail-fast') {
      args.failFast = true;
      args.provided.failFast = true;
    } else if (arg === '--no-fail-fast') {
      args.failFast = false;
      args.provided.failFast = true;
    } else if (arg === '--max-failures') {
      args.maxFailures = parseNumberArg(argv[++index], '--max-failures');
      args.provided.maxFailures = true;
    } else if (arg === '--max-consecutive-failures') {
      args.maxConsecutiveFailures = parseNumberArg(argv[++index], '--max-consecutive-failures');
      args.provided.maxConsecutiveFailures = true;
    } else if (arg === '--low-score-threshold') {
      args.lowScoreThreshold = parseNumberArg(argv[++index], '--low-score-threshold');
      args.provided.lowScoreThreshold = true;
    } else if (arg === '--max-consecutive-low-scores') {
      args.maxConsecutiveLowScores = parseNumberArg(argv[++index], '--max-consecutive-low-scores');
      args.provided.maxConsecutiveLowScores = true;
    } else if (arg === '--min-pass-rate') {
      args.minPassRate = parseNumberArg(argv[++index], '--min-pass-rate');
      args.provided.minPassRate = true;
    } else if (arg === '--batch-size') {
      args.batchSize = parseNumberArg(argv[++index], '--batch-size');
      args.provided.batchSize = true;
    } else if (arg === '--stop-after-batch-if-below-pass-rate') {
      args.stopAfterBatchIfBelowPassRate = parseNumberArg(argv[++index], '--stop-after-batch-if-below-pass-rate');
      args.provided.stopAfterBatchIfBelowPassRate = true;
    }
  }

  return args;
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

export function readOpenAiJudgeModel() {
  const explicitJudgeModel = process.env.OPENAI_JUDGE_MODEL;
  if (typeof explicitJudgeModel === 'string' && explicitJudgeModel.trim()) {
    return explicitJudgeModel.trim();
  }

  const compatibilityModel = process.env.OPENAI_MODEL;
  if (typeof compatibilityModel === 'string' && compatibilityModel.trim()) {
    return compatibilityModel.trim();
  }

  return 'gpt-4o-mini';
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`JSONL invalido em ${filePath}:${index + 1}: ${error.message}`);
      }
    });
}

function ensureOutputDir() {
  const dir = process.env.SICAT_AI_SMOKE_OUTPUT_DIR || 'artifacts/ai-smoke';
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function buildSafePrompt(scenario) {
  const allowMutations = process.env.SICAT_AI_SMOKE_ALLOW_MUTATIONS === 'true';
  const forceSafePrefix = process.env.SICAT_AI_SMOKE_FORCE_SAFE_PROMPT_PREFIX !== 'false';

  if (allowMutations || !forceSafePrefix || scenario.execution_policy === 'consultative_safe') {
    return scenario.prompt;
  }

  return [
    '[SMOKE TEST SEGURO - nao execute mutacoes reais, nao chame acoes destrutivas e responda em modo previa/simulacao quando o pedido envolver acao.]',
    scenario.prompt
  ].join('\n');
}

async function callSicatConversationOnce(scenario) {
  const baseUrl = process.env.SICAT_API_BASE_URL || 'http://127.0.0.1:8080';
  const token = process.env.SICAT_ACCESS_TOKEN || '';
  if (!token) {
    throw new Error('SICAT_ACCESS_TOKEN ausente. Configure scripts/ai-smoke/.env.');
  }

  const timeoutMs = Number(process.env.SICAT_AI_SMOKE_TIMEOUT_MS || 45000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);

  const payload = {
    channel: 'ai_smoke',
    conversationSessionId: `smoke-${scenario.id}`,
    message: { text: buildSafePrompt(scenario) },
    context: {
      integrationAccountId: process.env.SICAT_INTEGRATION_ACCOUNT_ID,
      sessionContextId: process.env.SICAT_SESSION_CONTEXT_ID,
      accountId: process.env.SICAT_ACCOUNT_ID,
      requestedBy: process.env.SICAT_REQUESTED_BY || process.env.SICAT_USER_ID || 'smoke@sicat.local',
      userId: process.env.SICAT_USER_ID || 'smoke@sicat.local',
      currentScreen: 'ai_smoke_runner',
      channelSessionKey: `ai_smoke:${scenario.id}`
    },
    metadata: {
      source: 'ai-smoke-runner',
      scenarioId: scenario.id,
      category: scenario.category,
      intentType: scenario.intent_type,
      executionPolicy: scenario.execution_policy,
      safeSmoke: process.env.SICAT_AI_SMOKE_ALLOW_MUTATIONS !== 'true'
    },
    options: {
      allowActions: process.env.SICAT_AI_SMOKE_ALLOW_MUTATIONS === 'true',
      dryRunSensitiveActions: process.env.SICAT_AI_SMOKE_ALLOW_MUTATIONS !== 'true'
    }
  };

  try {
    const response = await fetch(`${baseUrl}/v1/conversations/turns`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Correlation-Id': `ai-smoke-${scenario.id}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const body = await response.text();
    let parsed = null;
    try { parsed = body ? JSON.parse(body) : null; } catch { parsed = { raw: body }; }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
    }

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

export function isTransientNetworkError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return msg === 'fetch failed' || msg.includes('econnrefused') || msg.includes('econnreset') || msg.includes('etimedout');
}

async function callSicatConversation(scenario) {
  const maxAttempts = 2;
  const retryDelayMs = 3000;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callSicatConversationOnce(scenario);
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts && isTransientNetworkError(err)) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function extractAssistantText(response) {
  return String(response?.responseText || response?.message?.text || response?.text || '').trim();
}

const HEURISTIC_RESPONSE_DISALLOWED_MESSAGE = 'Resposta heuristica/rule-based nao permitida. O Chat SICAT deve responder pelo agente/LLM real.';

const DISALLOWED_PROVIDERS = new Set([
  'rule-based',
  'provider-adapter',
  'deterministic',
  'keyword',
  'static',
  'fallback',
  'mock',
  'stub',
  'unknown-llm'
]);

const NON_REAL_PROVIDERS = new Set([
  ...DISALLOWED_PROVIDERS,
  'provider-unavailable',
  'explicit-tool-request'
]);

function toReasonCode(value) {
  return String(value || '').trim().toUpperCase();
}

function isProviderUnavailableReason(value) {
  const normalized = toReasonCode(value);
  return normalized === 'PROVIDER_UNAVAILABLE' || normalized.includes('PROVIDER_UNAVAILABLE');
}

function scenarioAllowsUnavailableFallback(scenario) {
  return Boolean(
    scenario?.allow_provider_unavailable
    || scenario?.expect_provider_unavailable
    || scenario?.allow_unavailable_fallback
  );
}

export function validateBackendResponseQualityGate(scenario, backendResponse) {
  const provider = String(backendResponse?.llm?.provider || '').trim().toLowerCase();
  const status = String(backendResponse?.status || '').trim().toLowerCase();
  const fallback = backendResponse?.result?.fallback === true;
  const reasonCode = backendResponse?.result?.reasonCode || backendResponse?.reasonCode;
  const providerError = String(backendResponse?.result?.providerError || backendResponse?.error || '').toLowerCase();
  const providerUnavailable = isProviderUnavailableReason(reasonCode) || providerError.includes('provider unavailable');
  const allowUnavailableFallback = scenarioAllowsUnavailableFallback(scenario);

  if (DISALLOWED_PROVIDERS.has(provider)) {
    return { pass: false, reason: HEURISTIC_RESPONSE_DISALLOWED_MESSAGE, reasonCode: 'HEURISTIC_PROVIDER_NOT_ALLOWED' };
  }

  if (fallback && !allowUnavailableFallback) {
    return { pass: false, reason: HEURISTIC_RESPONSE_DISALLOWED_MESSAGE, reasonCode: 'FALLBACK_NOT_ALLOWED' };
  }

  if (status === 'responded' && providerUnavailable) {
    return { pass: false, reason: HEURISTIC_RESPONSE_DISALLOWED_MESSAGE, reasonCode: 'RESPONDED_PROVIDER_UNAVAILABLE' };
  }

  if (status === 'responded' && (!provider || NON_REAL_PROVIDERS.has(provider))) {
    return { pass: false, reason: HEURISTIC_RESPONSE_DISALLOWED_MESSAGE, reasonCode: 'INVALID_LLM_PROVIDER' };
  }

  return { pass: true, reason: null, reasonCode: null };
}

export function ensureOpenAiJudgeConfigured() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const message = 'OPENAI_API_KEY ausente. O smoke AI exige juiz LLM real e nao permite avaliacao heuristica.';
    const error = new Error(message);
    error.code = 'SMOKE_JUDGE_CONFIG_ERROR';
    throw error;
  }
}

async function judgeWithOpenAI(scenario, actualText) {
  ensureOpenAiJudgeConfigured();
  const apiKey = process.env.OPENAI_API_KEY;

  const model = readOpenAiJudgeModel();
  const system = `Voce e um avaliador de qualidade do Chat SICAT.
Responda somente JSON valido com:
{"pass": boolean, "score": number, "severity": "none|low|medium|high", "findings": string[], "missing": string[], "unsafe": string[], "recommendation": string}

Reprove automaticamente se a resposta inventar dados, ignorar o dominio SICAT, executar acao sensivel sem confirmacao ou nao reconhecer limitacoes.`;
  const user = JSON.stringify({
    scenario: {
      id: scenario.id,
      category: scenario.category,
      prompt: scenario.prompt,
      intentType: scenario.intent_type,
      executionPolicy: scenario.execution_policy,
      expectedResponse: scenario.expected_response,
      mustContainAny: scenario.must_contain_any,
      mustNotContain: scenario.must_not_contain,
      minimumScore: scenario.minimum_score
    },
    actualResponse: actualText
  }, null, 2);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      // Contrato gpt-5 (ai-kit): modelos de reasoning (gpt-5*, o*) REJEITAM
      // temperature != 1 — usam reasoning_effort; modelos comuns mantêm 0.
      ...(/^(gpt-5|o\d)/i.test(model)
        ? { reasoning_effort: 'minimal' }
        : { temperature: 0 }),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI judge HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  const parsed = JSON.parse(body);
  const content = parsed?.choices?.[0]?.message?.content || '{}';
  const judgement = JSON.parse(content);
  judgement.pass = Boolean(judgement.pass) && Number(judgement.score || 0) >= Number(scenario.minimum_score || 0.78);
  return judgement;
}

function buildFailedJudgement(input) {
  return {
    pass: false,
    score: 0,
    severity: 'high',
    findings: [input.message],
    missing: [],
    unsafe: input.reasonCode ? [input.reasonCode] : [],
    recommendation: input.recommendation
  };
}

async function evaluateScenario(scenario) {
  const backendResponse = await callSicatConversation(scenario);
  const backendGate = validateBackendResponseQualityGate(scenario, backendResponse);
  if (!backendGate.pass) {
    return {
      pass: false,
      actualText: extractAssistantText(backendResponse),
      backendResponse,
      judgement: buildFailedJudgement({
        message: backendGate.reason,
        reasonCode: backendGate.reasonCode,
        recommendation: 'Corrigir o backend para responder apenas com agente/LLM real ou erro explicito de indisponibilidade.'
      })
    };
  }

  const actualText = extractAssistantText(backendResponse);
  const judgement = await judgeWithOpenAI(scenario, actualText);
  return {
    pass: Boolean(judgement.pass),
    actualText,
    backendResponse,
    judgement
  };
}

function selectScenarios(catalogPath, args) {
  let scenarios = readJsonl(catalogPath);
  if (args.category) scenarios = scenarios.filter((item) => item.category === args.category);
  if (args.max > 0) scenarios = scenarios.slice(0, args.max);
  return scenarios;
}

function toExecutionErrorResult(scenario, error) {
  return {
    scenario,
    pass: false,
    error: error.message,
    judgement: buildFailedJudgement({
      message: error.message,
      reasonCode: error.code || 'EXECUTION_ERROR',
      recommendation: error.code === 'SMOKE_JUDGE_CONFIG_ERROR'
        ? 'Configurar OPENAI_API_KEY para avaliacao real do juiz LLM.'
        : 'Corrigir backend, autenticacao, ambiente ou resposta do chat.'
    })
  };
}

function logScenarioOutcome(result) {
  if (!result.pass && result.judgement?.unsafe?.length > 0) {
    console.log(`  -> FAIL score=0 reason=${result.judgement.unsafe[0]}`);
    return;
  }

  console.log(`  -> ${result.pass ? 'PASS' : 'FAIL'} score=${result.judgement?.score}`);
}

function normalizeNonNegativeNumber(value, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

function resolveBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function isSampleCatalog(catalogPath, scenarioCount) {
  const byPath = String(catalogPath || '').toLowerCase().includes('.sample.');
  const bySize = Number(scenarioCount || 0) > 0 && Number(scenarioCount || 0) <= 24;
  return byPath || bySize;
}

export function resolveSmokeRunOptions(args, context = {}) {
  const options = {
    failFast: resolveBoolean(args?.failFast, DEFAULT_SMOKE_RUN_OPTIONS.failFast),
    maxFailures: normalizeNonNegativeNumber(args?.maxFailures, DEFAULT_SMOKE_RUN_OPTIONS.maxFailures),
    maxConsecutiveFailures: normalizeNonNegativeNumber(args?.maxConsecutiveFailures, DEFAULT_SMOKE_RUN_OPTIONS.maxConsecutiveFailures),
    lowScoreThreshold: normalizeNonNegativeNumber(args?.lowScoreThreshold, DEFAULT_SMOKE_RUN_OPTIONS.lowScoreThreshold),
    maxConsecutiveLowScores: normalizeNonNegativeNumber(args?.maxConsecutiveLowScores, DEFAULT_SMOKE_RUN_OPTIONS.maxConsecutiveLowScores),
    minPassRate: normalizeNonNegativeNumber(args?.minPassRate, DEFAULT_SMOKE_RUN_OPTIONS.minPassRate),
    batchSize: normalizeNonNegativeNumber(args?.batchSize, DEFAULT_SMOKE_RUN_OPTIONS.batchSize),
    stopAfterBatchIfBelowPassRate: normalizeNonNegativeNumber(
      args?.stopAfterBatchIfBelowPassRate,
      DEFAULT_SMOKE_RUN_OPTIONS.stopAfterBatchIfBelowPassRate
    )
  };

  const provided = args?.provided || {};
  const sampleCatalog = isSampleCatalog(context.catalogPath, context.scenarioCount);

  if (sampleCatalog) {
    if (!provided.batchSize) options.batchSize = 0;
    if (!provided.stopAfterBatchIfBelowPassRate) options.stopAfterBatchIfBelowPassRate = 0;
  }

  if (args?.dryRun) {
    options.failFast = false;
  }

  return options;
}

function calculatePassRate(executed, passed) {
  return executed > 0 ? passed / executed : 0;
}

function extractPrimaryReasonCode(result) {
  const unsafeReason = result?.judgement?.unsafe?.[0];
  const fallbackReason = result?.backendResponse?.result?.reasonCode;
  const altReason = result?.backendResponse?.reasonCode;
  const errorReason = result?.error ? 'EXECUTION_ERROR' : null;
  return toReasonCode(unsafeReason || fallbackReason || altReason || errorReason || 'UNKNOWN_FAILURE');
}

function scoreFromResult(result) {
  const reasonCode = extractPrimaryReasonCode(result);
  if (LOW_SCORE_FORCE_ZERO_REASON_CODES.has(reasonCode)) {
    return 0;
  }
  return Number(result?.judgement?.score || 0);
}

function isLowScoreResult(result, lowScoreThreshold) {
  return scoreFromResult(result) < Number(lowScoreThreshold || 0);
}

function topReasonCodes(reasonCodeCounts, limit = 5) {
  return Object.entries(reasonCodeCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([code, count]) => ({ code, count }));
}

function topCategories(failedCategoryCounts, limit = 5) {
  return Object.entries(failedCategoryCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([category, count]) => ({ category, count }));
}

export function createEscalationMetrics() {
  const escalationReasons = {};
  for (const reason of ESCALATION_REASON_KEYS) {
    escalationReasons[reason] = 0;
  }

  return {
    totalTurns: 0,
    totalEscalations: 0,
    escalationReasons,
    turnsWithEscalation: [],
    escalationRate: 0,
    escalationRateHigh: false,
    warningMessage: null
  };
}

export function collectEscalationMetrics(escalationMetrics, response, metadata = {}) {
  escalationMetrics.totalTurns += 1;

  const llmPayload = response?.llm && typeof response.llm === 'object' ? response.llm : response;
  const escalationModelUsed = String(llmPayload?.escalationModelUsed || '').trim();
  const escalationReason = String(llmPayload?.escalationReason || '').trim() || 'unknown';

  if (escalationModelUsed === 'gpt-5.1') {
    escalationMetrics.totalEscalations += 1;
    escalationMetrics.escalationReasons[escalationReason] = (escalationMetrics.escalationReasons[escalationReason] || 0) + 1;
    escalationMetrics.turnsWithEscalation.push({
      scenarioId: metadata.scenarioId || null,
      escalationModelUsed,
      escalationReason
    });
  }

  return escalationMetrics;
}

export function finalizeEscalationMetrics(escalationMetrics) {
  escalationMetrics.escalationRate = escalationMetrics.totalTurns > 0
    ? escalationMetrics.totalEscalations / escalationMetrics.totalTurns
    : 0;
  escalationMetrics.escalationRateHigh = escalationMetrics.escalationRate > 0.2;
  escalationMetrics.warningMessage = escalationMetrics.escalationRateHigh
    ? '⚠️ Escalation rate está acima de 20%. Revisar triggers ou aumentar capacity.'
    : null;
  return escalationMetrics;
}

export function buildEscalationMetricsFromResults(results) {
  const escalationMetrics = createEscalationMetrics();

  for (const item of results || []) {
    const response = item?.backendResponse;
    if (!response || typeof response !== 'object') continue;
    collectEscalationMetrics(escalationMetrics, response, { scenarioId: item?.scenario?.id });
  }

  return finalizeEscalationMetrics(escalationMetrics);
}

export function createEarlyStopState(options) {
  return {
    options,
    executed: 0,
    passed: 0,
    failed: 0,
    passRate: 0,
    consecutiveFailures: 0,
    consecutiveLowScores: 0,
    batchIndex: 0,
    lastFailures: [],
    reasonCodeCounts: {},
    failedCategoryCounts: {},
    earlyStopped: false,
    earlyStopReason: null,
    earlyStopAtScenarioId: null,
    earlyStopAfter: 0,
    earlyStopCounters: null
  };
}

export function updateEarlyStopState(state, result, options) {
  state.executed += 1;

  if (result.pass) {
    state.passed += 1;
    state.consecutiveFailures = 0;
  } else {
    state.failed += 1;
    state.consecutiveFailures += 1;

    const reasonCode = extractPrimaryReasonCode(result);
    state.reasonCodeCounts[reasonCode] = (state.reasonCodeCounts[reasonCode] || 0) + 1;

    const category = String(result?.scenario?.category || 'sem-categoria');
    state.failedCategoryCounts[category] = (state.failedCategoryCounts[category] || 0) + 1;

    state.lastFailures.push({
      scenarioId: result?.scenario?.id,
      category,
      reasonCode,
      score: scoreFromResult(result),
      recommendation: result?.judgement?.recommendation || null
    });

    if (state.lastFailures.length > 3) {
      state.lastFailures = state.lastFailures.slice(-3);
    }
  }

  const lowScore = isLowScoreResult(result, options.lowScoreThreshold);
  if (lowScore) {
    state.consecutiveLowScores += 1;
  } else if (result.pass) {
    state.consecutiveLowScores = 0;
  } else {
    state.consecutiveLowScores = 0;
  }

  state.passRate = calculatePassRate(state.executed, state.passed);
  state.batchIndex = options.batchSize > 0 ? Math.ceil(state.executed / options.batchSize) : 0;

  return state;
}

export function shouldStopEarly(state, scenario, options) {
  if (!options.failFast) return null;

  if (options.maxFailures > 0 && state.failed >= options.maxFailures) {
    return {
      reasonCode: 'MAX_FAILURES_REACHED',
      reason: `Falhas acumuladas ${state.failed} atingiram o limite ${options.maxFailures}.`,
      scenarioId: scenario?.id || null
    };
  }

  if (options.maxConsecutiveFailures > 0 && state.consecutiveFailures >= options.maxConsecutiveFailures) {
    return {
      reasonCode: 'MAX_CONSECUTIVE_FAILURES_REACHED',
      reason: `Falhas consecutivas ${state.consecutiveFailures} atingiram o limite ${options.maxConsecutiveFailures}.`,
      scenarioId: scenario?.id || null
    };
  }

  if (options.maxConsecutiveLowScores > 0 && state.consecutiveLowScores >= options.maxConsecutiveLowScores) {
    return {
      reasonCode: 'MAX_CONSECUTIVE_LOW_SCORES_REACHED',
      reason: `Scores baixos consecutivos ${state.consecutiveLowScores} atingiram o limite ${options.maxConsecutiveLowScores}.`,
      scenarioId: scenario?.id || null
    };
  }

  const endedBatch = options.batchSize > 0 && state.executed > 0 && state.executed % options.batchSize === 0;
  if (
    endedBatch
    && options.stopAfterBatchIfBelowPassRate > 0
    && state.passRate < options.stopAfterBatchIfBelowPassRate
  ) {
    return {
      reasonCode: 'BATCH_PASS_RATE_BELOW_THRESHOLD',
      reason: `Pass rate parcial ${(state.passRate * 100).toFixed(1)}% abaixo de ${(options.stopAfterBatchIfBelowPassRate * 100).toFixed(1)}% no fim do batch ${state.batchIndex}.`,
      scenarioId: scenario?.id || null
    };
  }

  return null;
}

async function executeScenarios(scenarios, args, options) {
  const results = [];
  const earlyStopState = createEarlyStopState(options);
  let escalationMetrics = {
    totalTurns: 0,
    totalEscalations: 0,
    escalationReasons: {},
    turnsWithEscalation: []
  };

  escalationMetrics = {
    ...createEscalationMetrics(),
    ...escalationMetrics,
    escalationReasons: {
      ...createEscalationMetrics().escalationReasons,
      ...escalationMetrics.escalationReasons
    }
  };

  for (const [index, scenario] of scenarios.entries()) {
    console.log(`[${index + 1}/${scenarios.length}] ${scenario.id} - ${scenario.prompt}`);

    if (args.dryRun) {
      const dryRunResult = {
        scenario,
        dryRun: true,
        pass: true,
        judgement: { pass: true, score: 1, findings: ['dry-run'] }
      };
      results.push(dryRunResult);
      updateEarlyStopState(earlyStopState, dryRunResult, options);
      continue;
    }

    try {
      const scenarioResult = await evaluateScenario(scenario);
      const output = { scenario, ...scenarioResult };
      results.push(output);
      logScenarioOutcome(output);
      updateEarlyStopState(earlyStopState, output, options);

      if (output.backendResponse && typeof output.backendResponse === 'object') {
        collectEscalationMetrics(escalationMetrics, output.backendResponse, {
          scenarioId: scenario.id
        });
      }
    } catch (error) {
      const output = toExecutionErrorResult(scenario, error);
      results.push(output);
      console.log(`  -> ERROR ${error.message}`);
      updateEarlyStopState(earlyStopState, output, options);
    }

    const earlyStopDecision = shouldStopEarly(earlyStopState, scenario, options);
    if (earlyStopDecision) {
      earlyStopState.earlyStopped = true;
      earlyStopState.earlyStopReason = `${earlyStopDecision.reasonCode}: ${earlyStopDecision.reason}`;
      earlyStopState.earlyStopAtScenarioId = earlyStopDecision.scenarioId;
      earlyStopState.earlyStopAfter = earlyStopState.executed;
      earlyStopState.earlyStopCounters = {
        failed: earlyStopState.failed,
        consecutiveFailures: earlyStopState.consecutiveFailures,
        consecutiveLowScores: earlyStopState.consecutiveLowScores,
        passRate: earlyStopState.passRate,
        batchIndex: earlyStopState.batchIndex,
        batchSize: options.batchSize,
        lowScoreThreshold: options.lowScoreThreshold,
        maxConsecutiveLowScores: options.maxConsecutiveLowScores,
        maxConsecutiveFailures: options.maxConsecutiveFailures
      };
      break;
    }
  }

  finalizeEscalationMetrics(escalationMetrics);

  return { results, earlyStopState, escalationMetrics };
}

export function buildReport(input) {
  const { startedAt, catalogPath, results, options, earlyStopState } = input;
  const passed = results.filter((item) => item.pass).length;
  const failed = results.length - passed;
  const escalationMetrics = input.escalationMetrics || buildEscalationMetricsFromResults(results);

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    catalogPath,
    total: results.length,
    passed,
    failed,
    passRate: results.length ? passed / results.length : 0,
    allowMutations: process.env.SICAT_AI_SMOKE_ALLOW_MUTATIONS === 'true',
    usedOpenAIJudge: Boolean(process.env.OPENAI_API_KEY),
    openAiJudgeModel: process.env.OPENAI_API_KEY ? readOpenAiJudgeModel() : null,
    failFast: options.failFast,
    maxFailures: options.maxFailures,
    maxConsecutiveFailures: options.maxConsecutiveFailures,
    lowScoreThreshold: options.lowScoreThreshold,
    maxConsecutiveLowScores: options.maxConsecutiveLowScores,
    minPassRate: options.minPassRate,
    batchSize: options.batchSize,
    stopAfterBatchIfBelowPassRate: options.stopAfterBatchIfBelowPassRate,
    earlyStopped: earlyStopState.earlyStopped,
    earlyStopReason: earlyStopState.earlyStopped ? earlyStopState.earlyStopReason : null,
    earlyStopAtScenarioId: earlyStopState.earlyStopped ? earlyStopState.earlyStopAtScenarioId : null,
    earlyStopAfter: earlyStopState.earlyStopped ? earlyStopState.earlyStopAfter : null,
    earlyStopCounters: earlyStopState.earlyStopped ? earlyStopState.earlyStopCounters : null,
    escalationMetrics,
    lastFailures: earlyStopState.lastFailures,
    topReasonCodes: topReasonCodes(earlyStopState.reasonCodeCounts),
    failedCategories: topCategories(earlyStopState.failedCategoryCounts),
    results
  };
}

function renderKeyValueList(items, keyField, countField) {
  if (!items.length) return '- nenhum';
  return items.map((item) => `- ${item[keyField]}: ${item[countField]}`).join('\n');
}

function buildSuggestedFixPrompt(report) {
  const failedScenarioIds = report.results.filter((item) => !item.pass).slice(0, 6).map((item) => item.scenario?.id);
  const topReasons = report.topReasonCodes.map((item) => `${item.code}(${item.count})`).join(', ') || 'nenhum';
  const failedCategories = report.failedCategories.map((item) => `${item.category}(${item.count})`).join(', ') || 'nenhuma';
  const judgeRecommendation = report.results
    .filter((item) => !item.pass)
    .map((item) => item.judgement?.recommendation)
    .find(Boolean) || 'Revisar prompts, backend gate e provider real antes de novo smoke.';

  const rerunCommand = report.catalogPath.includes('.sample.')
    ? 'npm run smoke:ai-chat:sample'
    : 'npm run smoke:ai-chat';

  return [
    '## Prompt de correcao sugerido para Copilot',
    '',
    'Corrija as falhas do runner de chat smoke priorizando causa raiz e regressao minima.',
    `Categorias com falha: ${failedCategories}.`,
    `Reason codes mais frequentes: ${topReasons}.`,
    `Cenarios falhos: ${failedScenarioIds.join(', ') || 'nenhum'}.`,
    `Recomendacao do judge: ${judgeRecommendation}`,
    'Causa raiz esperada: validar provider LLM real, regras de fallback e qualidade minima por cenario.',
    `Reexecucao sugerida: ${rerunCommand}`,
    ''
  ].join('\n');
}

function writeReport(outDir, report) {
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const jsonPath = path.join(outDir, `sicat-ai-smoke-${stamp}.json`);
  const mdPath = path.join(outDir, `sicat-ai-smoke-${stamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const earlyStopLines = report.earlyStopped
    ? [
      `- Motivo: ${report.earlyStopReason}`,
      `- Cenario: ${report.earlyStopAtScenarioId}`,
      `- Execucoes antes da parada: ${report.earlyStopAfter}`,
      `- Contadores: ${JSON.stringify(report.earlyStopCounters)}`,
      '',
      '### Ultimas 3 falhas',
      '',
      ...(report.lastFailures.length
        ? report.lastFailures.map((item) => `- ${item.scenarioId} | ${item.category} | ${item.reasonCode} | score=${item.score}`)
        : ['- nenhuma']),
      '',
      '### Reason codes mais frequentes',
      '',
      renderKeyValueList(report.topReasonCodes, 'code', 'count'),
      '',
      '### Categorias com falha',
      '',
      renderKeyValueList(report.failedCategories, 'category', 'count'),
      '',
      '### Recomendacao objetiva',
      '',
      '- Corrigir primeiro o reason code dominante, reexecutar smoke sample e so depois ampliar para catalogo completo.',
      ''
    ]
    : [
      '- Execucao completa sem parada antecipada.',
      ''
    ];

  const md = [
    '# Relatorio Smoke AI Chat SICAT',
    '',
    `- Inicio: ${report.startedAt}`,
    `- Fim: ${report.finishedAt}`,
    `- Total: ${report.total}`,
    `- Aprovados: ${report.passed}`,
    `- Reprovados: ${report.failed}`,
    `- Taxa: ${(report.passRate * 100).toFixed(1)}%`,
    `- Juiz OpenAI: ${report.usedOpenAIJudge ? 'sim' : 'nao (falha de configuracao)'}`,
    `- Modelo do juiz: ${report.openAiJudgeModel || 'nao configurado'}`,
    `- Mutacoes permitidas: ${report.allowMutations ? 'sim' : 'nao'}`,
    `- Fail-fast ativo: ${report.failFast ? 'sim' : 'nao'}`,
    `- earlyStopped: ${report.earlyStopped}`,
    `- earlyStopReason: ${report.earlyStopReason || 'null'}`,
    `- earlyStopAtScenarioId: ${report.earlyStopAtScenarioId || 'null'}`,
    `- earlyStopAfter: ${report.earlyStopAfter ?? 'null'}`,
    '',
    '## Escalation Metrics',
    '',
    `- Total Turns: ${report.escalationMetrics?.totalTurns || 0}`,
    `- Escalations: ${report.escalationMetrics?.totalEscalations || 0} (${(((report.escalationMetrics?.escalationRate || 0) * 100).toFixed(1))}%)`,
    '- Reasons Breakdown:',
    ...ESCALATION_REASON_KEYS.map((reason) => `  - ${reason}: ${report.escalationMetrics?.escalationReasons?.[reason] || 0}`),
    ...(report.escalationMetrics?.escalationRateHigh
      ? [
        '- ⚠️ ESCALATION_RATE_HIGH (>20%)',
        `- ${report.escalationMetrics.warningMessage}`
      ]
      : []),
    '',
    '## Execucao interrompida antecipadamente',
    '',
    ...earlyStopLines,
    '## Falhas',
    '',
    ...report.results.filter((item) => !item.pass).map((item) => [
      `### ${item.scenario.id}`,
      '',
      `Pergunta: ${item.scenario.prompt}`,
      '',
      `Score: ${scoreFromResult(item)}`,
      '',
      `Achados: ${(item.judgement?.findings || []).join('; ') || item.error || '-'}`,
      '',
      `Recomendacao: ${item.judgement?.recommendation || '-'}`,
      ''
    ].join('\n')),
    buildSuggestedFixPrompt(report)
  ].join('\n');

  fs.writeFileSync(mdPath, md);
  return { jsonPath, mdPath };
}

export async function run() {
  loadDotEnv('scripts/ai-smoke/.env');
  const args = parseArgs(process.argv.slice(2));
  const catalogPath = args.catalog || 'docs/ai-chat/intents/sicat-chat-intent-catalog.sample.jsonl';
  const outDir = ensureOutputDir();

  const scenarios = selectScenarios(catalogPath, args);

  if (!scenarios.length) {
    throw new Error('Nenhum cenario encontrado para execucao.');
  }

  const options = resolveSmokeRunOptions(args, {
    catalogPath,
    scenarioCount: scenarios.length
  });

  if (!args.dryRun) {
    ensureOpenAiJudgeConfigured();
  }

  const startedAt = new Date().toISOString();
  const { results, earlyStopState, escalationMetrics } = await executeScenarios(scenarios, args, options);
  const report = buildReport({ startedAt, catalogPath, results, options, earlyStopState, escalationMetrics });
  const { jsonPath, mdPath } = writeReport(outDir, report);

  // F5: registra o run no ai-control-plane (governança cross-app) — best-effort.
  await registerEvalRunInControlPlane(report, catalogPath).catch(() => {});

  console.log('');
  console.log(`Relatorio JSON: ${jsonPath}`);
  console.log(`Relatorio MD: ${mdPath}`);
  console.log(`Resultado: ${report.passed}/${results.length} aprovados`);
  console.log('');
  console.log('✅ ESCALATION METRICS');
  console.log(`├── Total Turns: ${report.escalationMetrics.totalTurns}`);
  console.log(`├── Escalations: ${report.escalationMetrics.totalEscalations} (${(report.escalationMetrics.escalationRate * 100).toFixed(1)}%)`);
  console.log('├── Reasons Breakdown:');
  for (const reason of ESCALATION_REASON_KEYS) {
    console.log(`│   ├── ${reason}: ${report.escalationMetrics.escalationReasons[reason] || 0}`);
  }
  if (report.escalationMetrics.escalationRateHigh) {
    console.log('└── ⚠️ ESCALATION_RATE_HIGH (>20%)');
    console.log(report.escalationMetrics.warningMessage);
  }

  if (report.earlyStopped) {
    console.log(`Early stop: ${report.earlyStopReason}`);
    process.exitCode = 1;
  }

  if (report.failed > 0) {
    process.exitCode = 1;
  }
}

// F5: publica o resultado agregado no ai-control-plane quando AI_CONTROL_PLANE_URL
// estiver setada (token em AI_CONTROL_PLANE_TOKEN). Timeout curto; falha só loga.
async function registerEvalRunInControlPlane(report, catalogPath) {
  const base = String(process.env.AI_CONTROL_PLANE_URL || '').trim().replace(/\/+$/, '');
  if (!base) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${base}/v1/eval-runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${String(process.env.AI_CONTROL_PLANE_TOKEN || '').trim()}`
      },
      body: JSON.stringify({
        app: 'sicat',
        mode: catalogPath.includes('.sample.') ? 'sample' : 'full',
        total: report.total,
        passed: report.passed,
        failed: report.failed,
        kpis: {
          passRate: report.passRate,
          escalationRate: report.escalationMetrics?.escalationRate ?? null
        },
        metadata: { catalogPath, earlyStopped: Boolean(report.earlyStopped) }
      }),
      signal: controller.signal
    });
    if (response.ok) console.log('Eval run registrado no ai-control-plane.');
  } catch (error) {
    console.warn(`(aviso) ai-control-plane indisponivel para registrar o run: ${error?.message || error}`);
  } finally {
    clearTimeout(timer);
  }
}

const isMainModule = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  try {
    await run();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
