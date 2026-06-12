import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { hasOrgRole, resolveActivityPermission } from '../../lib/rbac.js';
import { callAI, chatJSON, chatText } from '../../ai/ai.service.js';
import { ActivityDraftSchema } from '../../ai/schemas/activity-draft.schema.js';
import { ChecklistSuggestionSchema } from '../../ai/schemas/checklist.schema.js';
import { ChecklistRevisionSchema } from '../../ai/schemas/checklist-revision.schema.js';
import { DelayAnalysisSchema } from '../../ai/schemas/delay-analysis.schema.js';
import { DailySummarySchema } from '../../ai/schemas/daily-summary.schema.js';
import { buildActivityDraftPrompt } from '../../ai/prompts/activity-draft.prompt.js';
import { buildChecklistPrompt } from '../../ai/prompts/checklist.prompt.js';
import { buildChecklistRevisionPrompt } from '../../ai/prompts/checklist-revision.prompt.js';
import { buildDelayAnalysisPrompt } from '../../ai/prompts/delay-analysis.prompt.js';
import { buildDailySummaryPrompt } from '../../ai/prompts/daily-summary.prompt.js';
import { cacheGet, cacheSet } from '../../lib/redis.js';
import { generateAndStoreDailySummary } from '../../workers/ai-summary-worker.js';
import { AI_GRAPH_ENABLED, runGraphChatTurn } from '../../ai/graph/index.js';
import { gymopsToolRegistry } from '../../ai/graph/tools.js';
import { signPendingAction, verifyPendingAction } from '../../ai/graph/pending-actions.js';
import { dispatchTool, type GraphResult } from '@flavioneto11/ai-core';
import { aiMetrics } from '../../ai/ai-metrics.js';

/**
 * F5: extrai a PRIMEIRA prévia válida de tool mutante do turno (dry-run ok).
 * evidence é 1:1 (mesma ordem) com as toolCalls bem-sucedidas (preview|executed)
 * — entradas com erro/denied não geram evidence. Prévias "falhas" (a tool
 * devolveu { error } para o LLM corrigir) são ignoradas.
 */
function findPendingPreview(r: GraphResult): { toolName: string; arguments: Record<string, unknown>; preview: Record<string, unknown> } | null {
  const okCalls = r.toolCalls.filter((t) => t.status === 'preview' || t.status === 'executed');
  for (let i = 0; i < okCalls.length; i++) {
    const call = okCalls[i];
    if (!call || call.status !== 'preview') continue;
    const output = r.evidence[i]?.output as Record<string, unknown> | undefined;
    if (output && typeof output === 'object' && output.preview === true && !output.error) {
      return {
        toolName: call.name,
        arguments: (call.arguments ?? {}) as Record<string, unknown>,
        preview: output,
      };
    }
  }
  return null;
}

export const aiRoutes: FastifyPluginAsync = async (app) => {
  const AI_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };

  // ── POST /ai/activities/draft ─────────────────────────────────────────────────
  app.post('/activities/draft', {
    preHandler: [app.authenticate],
    config: { rateLimit: AI_RATE_LIMIT },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const body = z.object({
      text: z.string().min(3).max(1000),
      organizationId: z.string().uuid(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    // RBAC — any member may use draft
    const isMember = await db.membership.findFirst({
      where: { userId, organizationId: body.data.organizationId, deletedAt: null },
    });
    if (!isMember) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

    // Fetch org context
    const org = await db.organization.findUnique({
      where: { id: body.data.organizationId },
      select: { name: true },
    });
    const areas = await db.area.findMany({
      where: { organizationId: body.data.organizationId },
      select: { key: true, name: true },
    });
    const templates = await db.activityTemplate.findMany({
      where: { organizationId: body.data.organizationId, deletedAt: null },
      include: { area: { select: { key: true } } },
    });

    const prompt = buildActivityDraftPrompt({
      userText: body.data.text,
      organizationName: org?.name ?? 'Organização',
      availableAreas: areas,
      availableTemplates: templates.map((t) => ({
        name: t.name,
        areaKey: t.area?.key ?? '',
      })),
    });

    const fallback = {
      title: body.data.text.slice(0, 200),
      areaKey: areas[0]?.key ?? 'administrativo',
      priority: 'media' as const,
      suggestedDueDays: 7,
      checklist: [],
      confidence: 0,
    };

    const raw = await callAI(
      (client) => chatJSON(client, prompt),
      fallback,
      { stage: 'draft' },
    );

    const parsed = ActivityDraftSchema.safeParse(raw);
    const draft = parsed.success ? parsed.data : fallback;

    return reply.send({ data: draft });
  });

  // ── POST /ai/activities/checklist ─────────────────────────────────────────────
  app.post('/activities/checklist', {
    preHandler: [app.authenticate],
    config: { rateLimit: AI_RATE_LIMIT },
  }, async (request, reply) => {
    const body = z.object({ activityId: z.string().uuid() }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const canView = await resolveActivityPermission({ userId: request.user.sub, activityId: body.data.activityId, action: 'view' });
    if (!canView) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const activity = await db.activity.findUnique({
      where: { id: body.data.activityId },
      include: {
        area: { select: { name: true, key: true } },
        template: { select: { name: true, config: true } },
      },
    });
    if (!activity) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const templateConfig = activity.template?.config as { defaultChecklist?: string[] } | null;
    const prompt = buildChecklistPrompt({
      activityTitle: activity.title,
      activityDescription: activity.description ?? undefined,
      areaName: activity.area?.name ?? 'Geral',
      templateChecklist: templateConfig?.defaultChecklist,
    });

    const fallback = { items: [] };
    const raw = await callAI(
      (client) => chatJSON(client, prompt),
      fallback,
      { stage: 'checklist' },
    );

    const parsed = ChecklistSuggestionSchema.safeParse(raw);
    const suggestion = parsed.success ? parsed.data : fallback;

    return reply.send({ data: suggestion });
  });

  // ── POST /ai/checklists/:id/revise ───────────────────────────────────────────
  // RASCUNHO de revisão de um checklist EXISTENTE a partir de uma instrução
  // livre ("adicione passo X", "remova o item 3", "detalhe a verificação...").
  // A IA NUNCA salva: o usuário revisa o diff na UI e confirma via
  // POST /checklists/:id/apply-revision.
  app.post('/checklists/:id/revise', {
    preHandler: [app.authenticate],
    config: { rateLimit: AI_RATE_LIMIT },
  }, async (request, reply) => {
    const { id: checklistId } = request.params as { id: string };

    const body = z.object({ instruction: z.string().min(3).max(1000) }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const checklist = await db.activityChecklist.findUnique({
      where: { id: checklistId },
      include: {
        items: { orderBy: { order: 'asc' }, select: { id: true, text: true, done: true } },
        activity: { select: { id: true, title: true, description: true, visibilityMode: true, area: { select: { name: true } } } },
      },
    });
    if (!checklist) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Checklist not found' } });

    const canEdit = await resolveActivityPermission({ userId: request.user.sub, activityId: checklist.activity.id, action: 'edit' });
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    // Regra do produto: conteúdo de atividades restricted NUNCA vai ao LLM.
    if (checklist.activity.visibilityMode === 'restricted') {
      return reply.status(403).send({ error: { code: 'AI_RESTRICTED', message: 'AI is not available for restricted activities' } });
    }

    const prompt = buildChecklistRevisionPrompt({
      activityTitle: checklist.activity.title,
      activityDescription: checklist.activity.description ?? undefined,
      areaName: checklist.activity.area?.name ?? 'Geral',
      checklistTitle: checklist.title,
      currentItems: checklist.items,
      instruction: body.data.instruction,
    });

    const raw = await callAI(
      (client) => chatJSON(client, prompt),
      null,
      { stage: 'checklist_revision' },
    );

    const parsed = raw === null ? null : ChecklistRevisionSchema.safeParse(raw);
    if (!parsed || !parsed.success) {
      // IA indisponível/sem rascunho válido: fluxo manual segue sem erro.
      return reply.send({ data: { revision: null, aiUnavailable: true } });
    }

    // Diff DETERMINÍSTICO (código só compara; a proposta é da IA, a decisão é
    // do usuário): ids citados precisam existir; existentes fora da lista
    // viram propostas de remoção.
    const knownById = new Map(checklist.items.map((item) => [item.id, item]));
    const revisedItems = parsed.data.items
      .map((item) => ({ id: item.id || null, text: item.text.trim() }))
      .filter((item) => item.text.length > 0 && (!item.id || knownById.has(item.id)));
    const keptIds = new Set(revisedItems.flatMap((item) => (item.id ? [item.id] : [])));
    const removed = checklist.items
      .filter((item) => !keptIds.has(item.id))
      .map((item) => ({ id: item.id, text: item.text, done: item.done }));
    const updated = revisedItems
      .filter((item) => item.id && knownById.get(item.id)?.text !== item.text)
      .map((item) => ({ id: item.id as string, before: knownById.get(item.id as string)?.text ?? '', after: item.text }));
    const addedCount = revisedItems.filter((item) => !item.id).length;

    return reply.send({
      data: {
        revision: { items: revisedItems, summary: parsed.data.summary ?? null },
        diff: { added: addedCount, updated: updated.length, removed: removed.length, removedItems: removed, updatedItems: updated },
        aiUnavailable: false,
      },
    });
  });

  // ── POST /ai/activities/delay-analysis ───────────────────────────────────────
  app.post('/activities/delay-analysis', {
    preHandler: [app.authenticate],
    config: { rateLimit: AI_RATE_LIMIT },
  }, async (request, reply) => {
    const body = z.object({ activityId: z.string().uuid() }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const canView = await resolveActivityPermission({ userId: request.user.sub, activityId: body.data.activityId, action: 'view' });
    if (!canView) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const activity = await db.activity.findUnique({
      where: { id: body.data.activityId },
      include: {
        area: { select: { name: true } },
        checklists: {
          include: { items: { select: { done: true } } },
        },
        _count: { select: { comments: true, attachments: true } },
      },
    });
    if (!activity) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const now = new Date();
    const daysOverdue = activity.dueAt
      ? Math.max(0, Math.floor((now.getTime() - activity.dueAt.getTime()) / 86400000))
      : 0;

    const lastEvent = await db.activityEvent.findFirst({
      where: { activityId: body.data.activityId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const daysSinceLastUpdate = lastEvent
      ? Math.floor((now.getTime() - lastEvent.createdAt.getTime()) / 86400000)
      : 0;

    const allItems = activity.checklists.flatMap((c) => c.items);
    const doneItems = allItems.filter((i) => i.done).length;

    const recentCommentsCount = await db.activityComment.count({
      where: { activityId: body.data.activityId, createdAt: { gte: new Date(now.getTime() - 7 * 86400000) } },
    });

    const prompt = buildDelayAnalysisPrompt({
      activityTitle: activity.title,
      areaName: activity.area?.name ?? 'Geral',
      priority: activity.priority,
      daysOverdue,
      daysSinceLastUpdate,
      checklistProgress: { done: doneItems, total: allItems.length },
      recentCommentCount: recentCommentsCount,
      hasAttachments: activity._count.attachments > 0,
    });

    const fallback = {
      summary: `Atividade com ${daysOverdue} dias de atraso sem resolução registrada.`,
      riskLevel: daysOverdue > 7 ? 'critical' : daysOverdue > 3 ? 'high' : 'medium' as 'medium',
      possibleReasons: ['Prazo não foi atualizado após início do trabalho'],
      suggestedActions: ['Contatar responsável para status atualizado'],
    };

    const raw = await callAI(
      (client) => chatJSON(client, prompt),
      fallback,
      { stage: 'delay-analysis' },
    );

    const parsed = DelayAnalysisSchema.safeParse(raw);
    const analysis = parsed.success ? parsed.data : fallback;

    return reply.send({ data: analysis });
  });

  // ── POST /ai/summaries/daily ──────────────────────────────────────────────────
  // Manual trigger for testing; same logic as the cron worker
  app.post('/summaries/daily', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const body = z.object({
      unitId: z.string().uuid(),
      organizationId: z.string().uuid(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const isAdmin = await hasOrgRole(userId, body.data.organizationId, ['owner', 'org_manager', 'unit_manager']);
    if (!isAdmin) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const stored = await generateAndStoreDailySummary(body.data.unitId);
    if (!stored) return reply.status(503).send({ error: { code: 'AI_UNAVAILABLE', message: 'AI not configured or generation failed' } });

    return reply.send({ data: stored });
  });

  // ── GET /ai/summaries/daily ───────────────────────────────────────────────────
  app.get('/summaries/daily', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { unitId } = z.object({ unitId: z.string().uuid() }).parse(request.query);
    const today = new Date().toISOString().slice(0, 10);
    const cached = await cacheGet(`ai:summary:${unitId}:${today}`);
    if (!cached) return reply.send({ data: null });
    try {
      return reply.send({ data: JSON.parse(cached) });
    } catch {
      return reply.send({ data: null });
    }
  });

  // ── POST /ai/chat — assistente conversacional do operador ─────────────────────
  app.post('/chat', {
    preHandler: [app.authenticate],
    config: { rateLimit: AI_RATE_LIMIT },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const body = z.object({
      message: z.string().min(1).max(2000),
      organizationId: z.string().uuid(),
      history: z
        .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
        .max(12)
        .optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const isMember = await db.membership.findFirst({
      where: { userId, organizationId: body.data.organizationId, deletedAt: null },
    });
    if (!isMember) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

    // Contexto REAL da organização (visão consolidada; o usuário é membro).
    const now = new Date();
    const [org, units, areaCount, statusGroups, overdueCount, recent] = await Promise.all([
      db.organization.findUnique({ where: { id: body.data.organizationId }, select: { name: true } }),
      db.unit.findMany({ where: { organizationId: body.data.organizationId }, select: { name: true }, take: 30 }),
      db.area.count({ where: { organizationId: body.data.organizationId } }),
      db.activity.groupBy({ by: ['status'], where: { organizationId: body.data.organizationId }, _count: { _all: true } }),
      db.activity.count({ where: { organizationId: body.data.organizationId, dueAt: { lt: now } } }),
      db.activity.findMany({
        where: { organizationId: body.data.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { title: true, status: true, priority: true, dueAt: true },
      }),
    ]);

    const statusLine = statusGroups.map((g) => `${g.status}: ${g._count._all}`).join(', ') || 'sem atividades';
    const recentLine = recent
      .map((a) => `- "${a.title}" [${a.status}, ${a.priority}${a.dueAt ? `, prazo ${a.dueAt.toISOString().slice(0, 10)}` : ''}]`)
      .join('\n') || '(nenhuma)';
    const context = `ORGANIZAÇÃO: ${org?.name ?? 'GymOps'}
UNIDADES (${units.length}): ${units.map((u) => u.name).join(', ') || '—'}
ÁREAS: ${areaCount}
ATIVIDADES POR STATUS: ${statusLine}
ATIVIDADES COM PRAZO VENCIDO: ${overdueCount}
ATIVIDADES RECENTES:
${recentLine}`;

    const system = `Você é o Assistente Operacional do GymOps — um copiloto que ajuda o operador a entender o que está acontecendo e a operar o sistema (modelo Organização → Unidade → Área → Atividade) com clareza e sem erros.

Regras:
- Responda SEMPRE em português, de forma clara, objetiva e generativa (linguagem natural).
- Use o CONTEXTO abaixo (dados REAIS da organização) para responder sobre o estado atual. Não invente números além do contexto.
- Quando o operador pedir para fazer algo no sistema, EXPLIQUE o passo a passo no GymOps e, se faltar informação, FAÇA PERGUNTAS objetivas antes de assumir.
- Seja proativo: aponte riscos (atrasos, prioridades críticas) e próximos passos recomendados.
- Você é consultivo: não executa ações; orienta o operador a executá-las.

CONTEXTO ATUAL:
${context}`;

    const messages = [
      { role: 'system' as const, content: system },
      ...(body.data.history ?? []).map((h) => ({ role: h.role, content: h.content })),
      { role: 'user' as const, content: body.data.message },
    ];

    const fallback =
      'No momento não consegui falar com a IA. Tente novamente em instantes — enquanto isso, você pode usar o painel para ver atividades, unidades e prazos.';

    // ── F1: grafo de raciocínio (router fast/deep + tools read-only + judge) ──
    // Atrás da flag AI_GRAPH (default off). Erro no grafo → cai no caminho
    // legado abaixo (graceful, mesmo contrato de resposta).
    if (AI_GRAPH_ENABLED()) {
      try {
        const r = await runGraphChatTurn({
          message: body.data.message,
          history: body.data.history ?? [],
          systemContext: system,
          identity: { sub: userId },
          correlationId: request.id,
          organizationId: body.data.organizationId,
        });
        // F5: tool mutante rodou em dry-run → devolve a prévia + token assinado
        // para o usuário CONFIRMAR (POST /ai/confirm). Apenas a primeira prévia.
        const pending = findPendingPreview(r);
        const pendingAction = pending
          ? {
              toolName: pending.toolName,
              preview: pending.preview,
              token: signPendingAction({
                toolName: pending.toolName,
                arguments: pending.arguments,
                userId,
                organizationId: body.data.organizationId,
              }),
            }
          : undefined;
        return reply.send({
          data: {
            reply: r.text,
            meta: {
              route: r.route, specialist: r.specialist, tools: r.toolCalls.map((t) => t.name), judge: r.judge?.score ?? null,
              memory: r.memory ? { thread: r.memory.hadThread, recalled: r.memory.recalled, turns: r.memory.turnCount } : null,
              ...(pendingAction ? { pendingAction } : {}),
            },
          },
        });
      } catch (err) {
        request.log.warn({ err }, '[ai-graph] falhou; usando caminho legado');
        aiMetrics.countError('graph', 'fallback_legacy');
      }
    }

    const replyText = await callAI((client) => chatText(client, messages), fallback, { stage: 'chat' });

    return reply.send({ data: { reply: replyText } });
  });

  // ── POST /ai/feedback — 👍/👎 por mensagem do chat (F5) ──────────────────────
  app.post('/feedback', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const body = z.object({
      messageId: z.string().min(1).max(64),
      kind: z.enum(['thumbs_up', 'thumbs_down']),
      organizationId: z.string().uuid(),
      reason: z.string().max(500).optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const isMember = await db.membership.findFirst({
      where: { userId, organizationId: body.data.organizationId, deletedAt: null },
    });
    if (!isMember) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

    // mesma convenção de thread do grafo (chat:<org>:<user>)
    const threadId = `chat:${body.data.organizationId}:${userId}`;
    const saved = await db.aiFeedback.upsert({
      where: { threadId_messageId_userId: { threadId, messageId: body.data.messageId, userId } },
      create: { threadId, messageId: body.data.messageId, userId, kind: body.data.kind, reason: body.data.reason },
      update: { kind: body.data.kind, reason: body.data.reason ?? null },
    });
    aiMetrics.countFeedback('chat', body.data.kind);

    // Fire-and-forget para o control-plane (telemetria/CSAT) — NUNCA afeta a resposta.
    const cpUrl = process.env.AI_CONTROL_PLANE_URL?.trim();
    if (cpUrl) {
      void fetch(`${cpUrl.replace(/\/+$/, '')}/v1/feedback`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.AI_CONTROL_PLANE_TOKEN || ''}`,
        },
        body: JSON.stringify({
          app: 'gymops',
          surface: 'chat',
          kind: body.data.kind,
          refId: body.data.messageId,
          comment: body.data.reason,
        }),
        signal: AbortSignal.timeout(2000),
      }).catch((err) => request.log.warn({ err }, '[ai] feedback → control-plane falhou'));
    }

    return reply.send({ data: { id: saved.id, kind: saved.kind } });
  });

  // ── POST /ai/confirm — executa ação pendente confirmada pelo usuário (F5) ────
  // O clique do usuário É o salvar: o token HMAC prova que a prévia veio de um
  // turno deste usuário/org e não foi adulterada; dispatchTool roda a execução
  // real (confirmedToolCallId) com authorize + RBAC de novo.
  app.post('/confirm', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const userId = request.user.sub;
    const body = z.object({
      token: z.string().min(1),
      organizationId: z.string().uuid(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const isMember = await db.membership.findFirst({
      where: { userId, organizationId: body.data.organizationId, deletedAt: null },
    });
    if (!isMember) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member' } });

    const payload = verifyPendingAction(body.data.token, { userId, organizationId: body.data.organizationId });
    if (!payload) {
      return reply.status(400).send({ error: { code: 'INVALID_OR_EXPIRED', message: 'Confirmação inválida ou expirada. Peça a ação novamente no chat.' } });
    }

    const tool = gymopsToolRegistry.get(payload.toolName);
    if (!tool) {
      return reply.status(400).send({ error: { code: 'INVALID_OR_EXPIRED', message: 'Ação desconhecida.' } });
    }

    try {
      const out = await dispatchTool(tool, payload.arguments, {
        identity: { sub: userId },
        channel: 'inapp',
        organizationId: body.data.organizationId,
        confirmedToolCallId: 'user-confirmed',
      });
      // a tool devolve { error } estruturado quando algo mudou entre a prévia e
      // a confirmação (ex.: unidade removida) — não tratar como sucesso.
      const output = out.output as Record<string, unknown> | null;
      if (output && typeof output === 'object' && typeof output.error === 'string') {
        aiMetrics.countToolCall(payload.toolName, 'confirmed_error');
        return reply.status(400).send({ error: { code: 'ACTION_FAILED', message: `Não foi possível executar (${output.error}). Peça a ação novamente no chat.` } });
      }
      aiMetrics.countToolCall(payload.toolName, 'confirmed_executed');
      return reply.send({ data: { result: out.output, message: 'Ação executada.' } });
    } catch (err) {
      request.log.warn({ err, tool: payload.toolName }, '[ai] confirmação de ação falhou');
      aiMetrics.countToolCall(payload.toolName, 'confirmed_error');
      const message = err instanceof Error ? err.message : 'Falha ao executar a ação.';
      return reply.status(400).send({ error: { code: 'ACTION_FAILED', message } });
    }
  });
};
