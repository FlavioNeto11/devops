import express from 'express';
import fs from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';
import { asyncHandler } from '../lib/http.js';
import {
  getConversationArtifactContent,
  getConversationArtifactStatus
} from '../services/conversation/conversation-persistence-service.js';
import { createConversationService, listConversationTools } from '../services/conversation/conversation-service.js';
import { recordConversationFeedback } from '../services/conversation/conversation-feedback-service.js';
import { conversationIngestMiddleware, buildIngestedTurn } from '../services/conversation/conversation-ingest.js';
import { aiMetrics } from '../lib/ai-metrics.js';
import { sicatAuthMiddleware } from '../middlewares/sicat-auth.js';
import { resolveHttpPrincipal } from '../services/conversation/conversation-principal.js';
import type { ConversationPrincipal } from '../services/conversation/conversation-principal.js';
import { createRateLimiter } from '../lib/rate-limit.js';
import { AppError } from '../lib/problem.js';

type RequestWithContext = express.Request & {
  correlationId?: string | null;
  sicatUser?: {
    userId: string;
    email?: string;
    name?: string;
    roles: string[];
  };
};

/**
 * Teto de turnos por USUÁRIO. Cada turno custa chamadas de LLM, e a partir da cadeia
 * `whatsapp-channel-sicat` a superfície passa a ser alcançável por canal externo. Folgado para uso
 * humano (inclui rajadas de quick-actions do copiloto), apertado o bastante para conter abuso.
 *
 * A chave é o `userId`, NÃO o `channelSessionKey`: este último embute o canal declarado pelo cliente
 * (`native_chat` × `inapp`), e chavear por ele dava ao mesmo usuário DOIS baldes de 40 — 80/5min só
 * alternando o campo `channel` do corpo.
 */
const TURN_RATE_LIMIT = createRateLimiter(40, 5 * 60 * 1000);

function requireSicatUser(req: express.Request): NonNullable<RequestWithContext['sicatUser']> {
  const sicatUser = (req as RequestWithContext).sicatUser;
  if (!sicatUser?.userId) {
    // Não deveria acontecer: sicatAuthMiddleware roda antes e já teria respondido 401.
    throw new AppError(401, 'Unauthorized', 'Sessão SICAT não resolvida.', {
      code: 'CONVERSATION_PRINCIPAL_UNRESOLVED'
    });
  }
  return sicatUser;
}

/**
 * Teto de turnos, checado LOGO APÓS o auth — antes do multer e da extração de PDF do
 * `conversationIngestMiddleware`, e antes das queries de `resolveHttpPrincipal`. Duas correções: a
 * chave é o `userId` (não o `channelSessionKey`, que dobrava o orçamento), e o 429 barra o trabalho
 * caro de upload/ingestão em vez de rodar depois dele.
 *
 * Síncrono e lança direto: o Express encaminha throws síncronos de middleware ao handler de erro,
 * onde o `AppError` vira o Problem+JSON esperado.
 */
function enforceTurnRateLimit(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const sicatUser = requireSicatUser(req);
  const decision = TURN_RATE_LIMIT.check(`turn:user:${sicatUser.userId}`);
  if (!decision.allowed) {
    res.setHeader('Retry-After', String(decision.retryAfterSeconds));
    throw new AppError(
      429,
      'Too Many Requests',
      `Limite de turnos atingido. Tente novamente em ${decision.retryAfterSeconds}s.`,
      { code: 'CONVERSATION_RATE_LIMITED' }
    );
  }
  next();
}

function toSingleString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
}

function toHeaderMap(headers: IncomingHttpHeaders): Record<string, string | undefined> {
  const entries = Object.entries(headers).map(([key, value]) => {
    if (typeof value === 'string') return [key, value] as const;
    if (Array.isArray(value)) return [key, value.join(', ')] as const;
    return [key, undefined] as const;
  });

  return Object.fromEntries(entries);
}

function getCorrelationId(req: express.Request): string | null {
  const correlationId = (req as RequestWithContext).correlationId;
  return typeof correlationId === 'string' && correlationId.length > 0 ? correlationId : null;
}

const conversationService = createConversationService();

export function createConversationRouter() {
  const router = express.Router();

  router.get('/v1/conversations/tools', sicatAuthMiddleware, asyncHandler(async (_req, res) => {
    res.json({
      items: listConversationTools(),
      count: listConversationTools().length
    });
  }));

  // Escopo do artefato vem do PRINCIPAL, não mais de query params opcionais. Antes, omitir
  // `?integrationAccountId=` pulava a checagem inteira em `authorizeArtifactScope` — qualquer um que
  // conhecesse o `artifactId` baixava o arquivo. Agora o par (conta, sessão) é o do usuário
  // autenticado e não é influenciável pelo chamador.
  router.get('/v1/conversations/artifacts/:artifactId', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const principal = await resolveHttpPrincipal({ sicatUser: requireSicatUser(req) });

    const response = await getConversationArtifactStatus({
      artifactId: String(req.params.artifactId),
      integrationAccountId: principal.integrationAccountId,
      sessionContextId: principal.sessionContextId
    });

    res.json(response);
  }));

  router.get('/v1/conversations/artifacts/:artifactId/content', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const principal = await resolveHttpPrincipal({ sicatUser: requireSicatUser(req) });

    const artifact = await getConversationArtifactContent({
      artifactId: String(req.params.artifactId),
      integrationAccountId: principal.integrationAccountId,
      sessionContextId: principal.sessionContextId
    });

    res.setHeader('Content-Type', artifact.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.fileName}"`);
    fs.createReadStream(artifact.storagePath).pipe(res);
  }));

  // F5: feedback explícito 👍/👎 por resposta da IA (alimenta csat + loop contínuo).
  router.post('/v1/conversations/feedback', sicatAuthMiddleware, asyncHandler(async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const feedbackType = body.feedbackType === 'negative' ? 'negative' : body.feedbackType === 'positive' ? 'positive' : null;
    const correlationId = typeof body.correlationId === 'string' ? body.correlationId.trim() : '';
    if (!feedbackType || !correlationId) {
      res.status(400).json({ error: { code: 'FEEDBACK_INVALID', message: 'feedbackType (positive|negative) e correlationId sao obrigatorios' } });
      return;
    }

    // `channel` e `userId` saem do principal — o feedback alimenta métricas de qualidade por canal,
    // e aceitá-los do corpo permitia envenenar a série (ex.: atribuir 👎 ao WhatsApp pelo navegador).
    const principal = await resolveHttpPrincipal({
      sicatUser: requireSicatUser(req),
      declaredChannel: body.channel
    });

    const record = await recordConversationFeedback({
      conversationSessionId: typeof body.conversationSessionId === 'string' ? body.conversationSessionId : null,
      correlationId,
      channel: principal.channel,
      feedbackType,
      userId: principal.userId,
      toolName: typeof body.toolName === 'string' ? body.toolName : null,
      userComment: typeof body.userComment === 'string' ? body.userComment.slice(0, 500) : null
    });
    res.status(201).json({ data: record });
  }));

  // Multimodal: attachIngest é NO-OP em application/json (contrato textual intacto). Em multipart,
  // o multer popula req.body com os campos de TEXTO e req.ingested com o resultado da ingestão (fail-soft).
  router.post('/v1/conversations/turns', sicatAuthMiddleware, enforceTurnRateLimit, conversationIngestMiddleware(), asyncHandler(async (req, res) => {
    // Instrumentação F0 (latência/outcome do turno) — só telemetria.
    const startedAt = Date.now();

    // Identidade resolvida ANTES de qualquer trabalho: define canal, usuário e conta CETESB.
    // `declaredChannel` só distingue chat nativo × copiloto in-app; declarar `whatsapp` aqui é 403.
    // O teto de turnos JÁ correu em `enforceTurnRateLimit` (antes do multer/ingestão), keyado por
    // `userId`.
    const principal: ConversationPrincipal = await resolveHttpPrincipal({
      sicatUser: requireSicatUser(req),
      declaredChannel: (req.body as Record<string, unknown> | undefined)?.channel
    });

    // Quando vieram arquivos (multipart): dobra o TEXTO extraído na mensagem e carrega os blocos
    // nativos (imagem/PDF) p/ o LLM via userContent. Sem arquivos (JSON), `ingestedTurn` é null e o
    // turno segue 100% no caminho legado — RETROCOMPAT total. Fail-soft: nunca derruba a rota.
    const body = (req.body || {}) as Record<string, unknown>;
    const userText = typeof body.message === 'string' ? body.message : '';
    const ingestedTurn = buildIngestedTurn(req, userText);
    const turnBody = ingestedTurn
      ? { ...body, message: ingestedTurn.mergedMessage }
      : body;

    try {
      const response = await conversationService.processTurn({
        body: turnBody,
        principal,
        correlationId: getCorrelationId(req),
        headers: toHeaderMap(req.headers || {}),
        idempotencyKey: toSingleString(req.headers['idempotency-key']),
        userContent: ingestedTurn?.userContent ?? null,
        ingestManifest: ingestedTurn
          ? { files: ingestedTurn.safeManifest, notes: ingestedTurn.notes, nativeBlockCount: ingestedTurn.nativeBlockCount, error: ingestedTurn.ingestError }
          : null
      });

      aiMetrics.observeTurn('turn', response?.status === 'failed' ? 'error' : 'ok', (Date.now() - startedAt) / 1000);
      res.json(response);
    } catch (error) {
      aiMetrics.observeTurn('turn', 'error', (Date.now() - startedAt) / 1000);
      throw error;
    }
  }));

  return router;
}
