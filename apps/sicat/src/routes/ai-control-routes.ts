import express from 'express';
import { asyncHandler } from '../lib/http.js';
import { AppError } from '../lib/problem.js';
import { sicatAuthMiddleware } from '../middlewares/sicat-auth.js';
import { getAiControlConfig } from '../services/ai-control/ai-control-config.js';
import {
  ensureAiControlAdmin,
  assertAiControlWritable,
  requireConfirmation,
  type AiControlActor
} from '../services/ai-control/ai-control-auth.js';
import { getOverview, getHealth, getSettings, listLocalTraces, getLocalTraceByTurn } from '../services/ai-control/ai-control-service.js';
import {
  listRuntimeTools,
  getRuntimeTool,
  patchRuntimeTool,
  listRuntimeToolVersions
} from '../services/ai-control/ai-tool-admin-service.js';
import { listRuntimeAgents, getRuntimeAgent, patchRuntimeAgent } from '../services/ai-control/ai-agent-admin-service.js';
import {
  listPrompts,
  getPrompt,
  createPromptVersion,
  activatePromptVersion,
  syncPromptFromLangfuse
} from '../services/ai-control/ai-prompt-admin-service.js';
import {
  getKnowledgeIndexStatus,
  listKnowledgeChunks,
  testKnowledgeRetrieval,
  setKnowledgeSourceEnabledByKey,
  reindexKnowledge
} from '../services/ai-control/ai-knowledge-admin-service.js';
import {
  getMemorySnapshot,
  clearMemory,
  exportMemorySnapshot,
  rebuildMemorySummary,
  listMemoryAdminHistory
} from '../services/ai-control/ai-memory-admin-service.js';
import { listEvalBatteries, runEval, listEvalRuns, getEvalRunDetail } from '../services/ai-control/ai-eval-admin-service.js';
import {
  getLangfuseStatus,
  getObservabilityProvider,
  subscribeAiControlStream,
  ensureAiControlObservabilityWired
} from '../services/ai-control/ai-control-observability-service.js';
import type { AiControlStreamEvent, AiEvalMode, AiRuntimePolicyView } from '../services/ai-control/ai-control-types.js';

type RequestWithContext = express.Request & {
  correlationId?: string | null;
  sicatUser?: AiControlActor;
};

function getCorrelationId(req: express.Request): string | null {
  const value = (req as RequestWithContext).correlationId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getActor(req: express.Request): AiControlActor {
  return (req as RequestWithContext).sicatUser;
}

function qString(req: express.Request, key: string): string | null {
  const value = req.query?.[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' && first.trim() ? first.trim() : null;
  }
  return null;
}

function qNumber(req: express.Request, key: string): number | undefined {
  const value = qString(req, key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function bodyString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function bodyBool(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function bodyStringArray(body: Record<string, unknown>, key: string): string[] | undefined {
  const value = body[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : undefined;
}

const EVAL_MODES = new Set<string>(['sample', 'full', 'category', 'dry-run']);

export function createAiControlRouter(): express.Router {
  const router = express.Router();

  // Liga a ponte de observabilidade (SSE + persistência) uma vez no boot.
  ensureAiControlObservabilityWired();

  // Gate global: 404 quando o módulo está desabilitado.
  router.use('/v1/ai-control', (_req, _res, next) => {
    if (!getAiControlConfig().enabled) {
      next(new AppError(404, 'Not Found', 'AI Control Center desabilitado (AI_CONTROL_ENABLED=false).', { code: 'AI_CONTROL_DISABLED' }));
      return;
    }
    next();
  });

  // ─── Overview / health / settings ─────────────────────────────────────────
  router.get('/v1/ai-control/overview', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    res.json(await getOverview());
  }));

  router.get('/v1/ai-control/health', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    res.json(await getHealth());
  }));

  router.get('/v1/ai-control/settings', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    res.json(await getSettings());
  }));

  // ─── Runtime: tools ───────────────────────────────────────────────────────
  router.get('/v1/ai-control/runtime/tools', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const items = await listRuntimeTools();
    res.json({ items, count: items.length });
  }));

  router.get('/v1/ai-control/runtime/tools/:toolName', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const tool = await getRuntimeTool(String(req.params.toolName));
    if (!tool) {
      throw new AppError(404, 'Not Found', `Tool ${req.params.toolName} nao encontrada.`, { code: 'TOOL_NOT_FOUND' });
    }
    res.json(tool);
  }));

  router.get('/v1/ai-control/runtime/tools/:toolName/versions', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const items = await listRuntimeToolVersions(String(req.params.toolName));
    res.json({ items, count: items.length });
  }));

  router.patch('/v1/ai-control/runtime/tools/:toolName', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const actorUserId = await ensureAiControlAdmin(getActor(req));
    assertAiControlWritable();
    const body = (req.body || {}) as Record<string, unknown>;
    // Habilitar/desabilitar uma ACTION tool exige confirmação explícita.
    const current = await getRuntimeTool(String(req.params.toolName));
    if (current?.policy.isAction && bodyBool(body, 'enabled') !== undefined) {
      requireConfirmation(body.confirmed, `Alterar habilitação de uma ação (${req.params.toolName}) exige confirmação explícita (confirmed:true).`);
    }
    const updated = await patchRuntimeTool(
      String(req.params.toolName),
      {
        enabled: bodyBool(body, 'enabled'),
        riskLevel: bodyString(body, 'riskLevel') ?? undefined,
        allowChannels: bodyStringArray(body, 'allowChannels'),
        requiresConfirmation: bodyBool(body, 'requiresConfirmation'),
        isAction: bodyBool(body, 'isAction'),
        changelog: bodyString(body, 'changelog')
      },
      actorUserId
    );
    res.json(updated);
  }));

  // ─── Runtime: agents ──────────────────────────────────────────────────────
  router.get('/v1/ai-control/runtime/agents', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const items = await listRuntimeAgents();
    res.json({ items, count: items.length });
  }));

  router.get('/v1/ai-control/runtime/agents/:agentName', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const agent = await getRuntimeAgent(String(req.params.agentName));
    if (!agent) {
      throw new AppError(404, 'Not Found', `Agente ${req.params.agentName} nao encontrado.`, { code: 'AGENT_NOT_FOUND' });
    }
    res.json(agent);
  }));

  router.patch('/v1/ai-control/runtime/agents/:agentName', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const actorUserId = await ensureAiControlAdmin(getActor(req));
    assertAiControlWritable();
    const body = (req.body || {}) as Record<string, unknown>;
    const updated = await patchRuntimeAgent(
      String(req.params.agentName),
      {
        description: bodyString(body, 'description'),
        focus: typeof body.focus === 'string' ? body.focus : undefined,
        intents: bodyStringArray(body, 'intents'),
        knowledgeTopics: bodyStringArray(body, 'knowledgeTopics'),
        toolNames: bodyStringArray(body, 'toolNames'),
        promptName: bodyString(body, 'promptName'),
        enabled: bodyBool(body, 'enabled'),
        config: body.config && typeof body.config === 'object' ? (body.config as Record<string, unknown>) : undefined
      },
      actorUserId
    );
    res.json(updated);
  }));

  // ─── Runtime: policies ────────────────────────────────────────────────────
  router.get('/v1/ai-control/runtime/policies', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const tools = await listRuntimeTools();
    const items: AiRuntimePolicyView[] = tools.map((tool) => ({
      policyId: tool.toolName,
      toolName: tool.toolName,
      riskLevel: tool.policy.riskLevel,
      allowChannels: tool.policy.allowChannels,
      requiresConfirmation: tool.policy.requiresConfirmation,
      isAction: tool.policy.isAction,
      enabled: tool.enabled,
      source: tool.source
    }));
    res.json({ items, count: items.length });
  }));

  router.patch('/v1/ai-control/runtime/policies/:policyId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const actorUserId = await ensureAiControlAdmin(getActor(req));
    assertAiControlWritable();
    const body = (req.body || {}) as Record<string, unknown>;
    // policyId == toolName (1:1 nesta versão).
    const updated = await patchRuntimeTool(
      String(req.params.policyId),
      {
        riskLevel: bodyString(body, 'riskLevel') ?? undefined,
        allowChannels: bodyStringArray(body, 'allowChannels'),
        requiresConfirmation: bodyBool(body, 'requiresConfirmation'),
        isAction: bodyBool(body, 'isAction'),
        changelog: bodyString(body, 'changelog')
      },
      actorUserId
    );
    res.json({
      policyId: updated.toolName,
      toolName: updated.toolName,
      riskLevel: updated.policy.riskLevel,
      allowChannels: updated.policy.allowChannels,
      requiresConfirmation: updated.policy.requiresConfirmation,
      isAction: updated.policy.isAction,
      enabled: updated.enabled,
      source: updated.source
    } satisfies AiRuntimePolicyView);
  }));

  // ─── Prompts ──────────────────────────────────────────────────────────────
  router.get('/v1/ai-control/prompts', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const items = await listPrompts();
    res.json({ items, count: items.length });
  }));

  router.get('/v1/ai-control/prompts/:promptName', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    res.json(await getPrompt(String(req.params.promptName)));
  }));

  router.post('/v1/ai-control/prompts/:promptName/versions', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const actorUserId = await ensureAiControlAdmin(getActor(req));
    assertAiControlWritable();
    const result = await createPromptVersion(String(req.params.promptName), (req.body || {}) as Record<string, unknown>, actorUserId);
    res.status(201).json(result);
  }));

  router.post('/v1/ai-control/prompts/:promptName/activate', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const actorUserId = await ensureAiControlAdmin(getActor(req));
    assertAiControlWritable();
    const body = (req.body || {}) as Record<string, unknown>;
    const versionId = bodyString(body, 'versionId');
    if (!versionId) {
      throw new AppError(400, 'Bad Request', 'Campo versionId e obrigatorio.', { code: 'VERSION_ID_REQUIRED' });
    }
    // ativar/rollback de prompt exige confirmação explícita
    requireConfirmation(body.confirmed, 'Ativar/rollback de versão de prompt exige confirmação explícita (confirmed:true).');
    res.json(await activatePromptVersion(String(req.params.promptName), versionId, actorUserId));
  }));

  router.post('/v1/ai-control/prompts/:promptName/sync-langfuse', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const actorUserId = await ensureAiControlAdmin(getActor(req));
    assertAiControlWritable();
    const body = (req.body || {}) as Record<string, unknown>;
    requireConfirmation(body.confirmed, 'Sincronizar prompt do Langfuse exige confirmação explícita (confirmed:true).');
    res.json(await syncPromptFromLangfuse(String(req.params.promptName), actorUserId));
  }));

  // ─── Knowledge ────────────────────────────────────────────────────────────
  router.get('/v1/ai-control/knowledge/sources', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    res.json(await getKnowledgeIndexStatus());
  }));

  router.get('/v1/ai-control/knowledge/chunks', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const items = await listKnowledgeChunks({
      source: qString(req, 'source'),
      search: qString(req, 'search'),
      limit: qNumber(req, 'limit')
    });
    res.json({ items, count: items.length });
  }));

  router.post('/v1/ai-control/knowledge/test-retrieval', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const body = (req.body || {}) as Record<string, unknown>;
    const question = bodyString(body, 'question') || '';
    const k = typeof body.k === 'number' ? body.k : undefined;
    const hits = await testKnowledgeRetrieval(question, k);
    res.json({ items: hits, count: hits.length });
  }));

  router.patch('/v1/ai-control/knowledge/sources/:sourceKey', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    assertAiControlWritable();
    const body = (req.body || {}) as Record<string, unknown>;
    const enabled = bodyBool(body, 'enabled');
    if (enabled === undefined) {
      throw new AppError(400, 'Bad Request', 'Campo enabled (boolean) e obrigatorio.', { code: 'ENABLED_REQUIRED' });
    }
    res.json(await setKnowledgeSourceEnabledByKey(String(req.params.sourceKey), enabled));
  }));

  router.post('/v1/ai-control/knowledge/reindex', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    assertAiControlWritable();
    const body = (req.body || {}) as Record<string, unknown>;
    requireConfirmation(body.confirmed, 'Reindexar a base de conhecimento consome a API OpenAI; exige confirmação explícita (confirmed:true).');
    res.json(await reindexKnowledge());
  }));

  // ─── Memory ───────────────────────────────────────────────────────────────
  router.get('/v1/ai-control/memory/:conversationSessionId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    res.json(await getMemorySnapshot(String(req.params.conversationSessionId), qString(req, 'integrationAccountId')));
  }));

  router.get('/v1/ai-control/memory/:conversationSessionId/history', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const items = await listMemoryAdminHistory(String(req.params.conversationSessionId));
    res.json({ items, count: items.length });
  }));

  router.delete('/v1/ai-control/memory/:conversationSessionId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const actorUserId = await ensureAiControlAdmin(getActor(req));
    assertAiControlWritable();
    const body = (req.body || {}) as Record<string, unknown>;
    requireConfirmation(body.confirmed, 'Limpar a memória da sessão é destrutivo; exige confirmação explícita (confirmed:true).');
    const cleared = await clearMemory(
      String(req.params.conversationSessionId),
      qString(req, 'integrationAccountId') ?? bodyString(body, 'integrationAccountId'),
      actorUserId,
      getCorrelationId(req)
    );
    res.json({ cleared });
  }));

  router.post('/v1/ai-control/memory/:conversationSessionId/export', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const actorUserId = await ensureAiControlAdmin(getActor(req));
    const body = (req.body || {}) as Record<string, unknown>;
    const snapshot = await exportMemorySnapshot(
      String(req.params.conversationSessionId),
      qString(req, 'integrationAccountId') ?? bodyString(body, 'integrationAccountId'),
      actorUserId,
      getCorrelationId(req)
    );
    res.setHeader('Content-Disposition', `attachment; filename="memory-${req.params.conversationSessionId}.json"`);
    res.json(snapshot);
  }));

  router.post('/v1/ai-control/memory/:conversationSessionId/rebuild-summary', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const actorUserId = await ensureAiControlAdmin(getActor(req));
    assertAiControlWritable();
    const body = (req.body || {}) as Record<string, unknown>;
    const snapshot = await rebuildMemorySummary(
      String(req.params.conversationSessionId),
      qString(req, 'integrationAccountId') ?? bodyString(body, 'integrationAccountId'),
      qString(req, 'sessionContextId') ?? bodyString(body, 'sessionContextId'),
      actorUserId,
      getCorrelationId(req)
    );
    res.json(snapshot);
  }));

  // ─── Traces locais ────────────────────────────────────────────────────────
  router.get('/v1/ai-control/traces/local', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const items = await listLocalTraces({
      conversationSessionId: qString(req, 'conversationSessionId'),
      conversationTurnId: qString(req, 'conversationTurnId'),
      correlationId: qString(req, 'correlationId'),
      toolName: qString(req, 'toolName'),
      userId: qString(req, 'userId'),
      status: qString(req, 'status'),
      limit: qNumber(req, 'limit')
    });
    res.json({ items, count: items.length });
  }));

  router.get('/v1/ai-control/traces/local/:conversationTurnId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const items = await getLocalTraceByTurn(String(req.params.conversationTurnId));
    res.json({ items, count: items.length });
  }));

  // ─── Langfuse ─────────────────────────────────────────────────────────────
  router.get('/v1/ai-control/langfuse/status', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    res.json(await getLangfuseStatus());
  }));

  router.get('/v1/ai-control/langfuse/traces', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const provider = getObservabilityProvider();
    const items = await provider.listTraces({
      conversationSessionId: qString(req, 'conversationSessionId'),
      conversationTurnId: qString(req, 'conversationTurnId'),
      correlationId: qString(req, 'correlationId'),
      toolName: qString(req, 'toolName'),
      userId: qString(req, 'userId'),
      status: qString(req, 'status'),
      limit: qNumber(req, 'limit')
    });
    res.json({ provider: provider.name, items, count: items.length });
  }));

  router.get('/v1/ai-control/langfuse/traces/:traceId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const tree = await getObservabilityProvider().getTraceTree(String(req.params.traceId));
    if (!tree) {
      throw new AppError(404, 'Not Found', `Trace ${req.params.traceId} nao encontrado.`, { code: 'TRACE_NOT_FOUND' });
    }
    res.json(tree);
  }));

  router.get('/v1/ai-control/langfuse/observations', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const items = await getObservabilityProvider().listObservations({
      traceId: qString(req, 'traceId'),
      type: qString(req, 'type'),
      limit: qNumber(req, 'limit')
    });
    res.json({ items, count: items.length });
  }));

  router.get('/v1/ai-control/langfuse/prompts', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const items = await getObservabilityProvider().listPrompts();
    res.json({ items, count: items.length });
  }));

  router.get('/v1/ai-control/langfuse/metrics', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    res.json(await getObservabilityProvider().getMetrics());
  }));

  router.get('/v1/ai-control/langfuse/deeplink/:traceId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const deepLink = getObservabilityProvider().buildDeepLink(String(req.params.traceId));
    res.json({ traceId: String(req.params.traceId), deepLink, available: Boolean(deepLink) });
  }));

  // ─── Evals / smoke ────────────────────────────────────────────────────────
  router.get('/v1/ai-control/evals', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    const [batteries, runs] = await Promise.all([listEvalBatteries(), listEvalRuns(50)]);
    res.json({ batteries, runs });
  }));

  router.post('/v1/ai-control/evals/run', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const actorUserId = await ensureAiControlAdmin(getActor(req));
    const body = (req.body || {}) as Record<string, unknown>;
    const mode = bodyString(body, 'mode') || 'dry-run';
    if (!EVAL_MODES.has(mode)) {
      throw new AppError(400, 'Bad Request', `Modo invalido: ${mode}. Use sample|full|category|dry-run.`, { code: 'INVALID_EVAL_MODE' });
    }
    if (mode === 'full') {
      requireConfirmation(body.confirmed, 'Execução full do smoke exige confirmação explícita (confirmed:true) e AI_CONTROL_ALLOW_FULL_SMOKE=true.');
    }
    const run = await runEval({
      mode: mode as AiEvalMode,
      category: bodyString(body, 'category'),
      max: typeof body.max === 'number' ? body.max : undefined,
      requestedBy: actorUserId
    });
    res.status(202).json(run);
  }));

  router.get('/v1/ai-control/evals/:runId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    res.json(await getEvalRunDetail(String(req.params.runId)));
  }));

  // ─── SSE: eventos locais em tempo quase real ──────────────────────────────
  router.get('/v1/ai-control/events/stream', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    await ensureAiControlAdmin(getActor(req));
    if (!getAiControlConfig().enableSse) {
      throw new AppError(409, 'SSE disabled', 'SSE desabilitado (AI_CONTROL_ENABLE_SSE=false).', { code: 'SSE_DISABLED' });
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const write = (event: AiControlStreamEvent) => {
      try {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      } catch {
        // socket fechado entre o publish e o write
      }
    };

    write({ type: 'heartbeat', at: new Date().toISOString(), payload: { connected: true } });
    const unsubscribe = subscribeAiControlStream(write);
    const heartbeat = setInterval(() => {
      write({ type: 'heartbeat', at: new Date().toISOString(), payload: {} });
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  }));

  return router;
}
