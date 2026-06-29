// =============================================================================
// Endpoints da camada de IA do ZapBridge. Todos exigem auth; os que processam
// conteúdo exigem consentimento (requireConsent na rota). Fail-soft: sem chave/banco,
// degradam para vazio em vez de 500.
// =============================================================================
import type { Response } from 'express';
import type { AuthedRequest } from '../../types';
import { getSessionIdOrThrow, getChat } from '../chats/chats.service';
import {
  CONSENT_VERSION, getSettings, acceptConsent, revokeConsent, updateSettings,
  getChatSettings, setChatSettings,
} from './consent';
import { generateSuggestion, rewriteDraft, summarizeChat, triageChat } from './smart-reply';
import { searchHistorySemantic } from './rag';
import { runAssistantTurn } from './graph';
import { signPendingAction, verifyPendingAction } from './pending-actions';
import { TOOL_BY_NAME } from './tools';
import { ingestText, ingestFiles, listSources, removeSource } from './kb';
import { purgeAiData } from './hooks';
import { learnStyleFrom } from './graph';
import { backfillUserEmbeddings, backfillStatus } from './embeddings.worker';
import { aiDbEnabled, query } from './pg';
import { loadAiCore } from './ai-core-loader';
import { emitToUser } from '../../realtime/io';
import { prisma } from '../../lib/prisma';

function uid(req: AuthedRequest): string {
  return req.user!.userId;
}

// ---- consentimento / settings ----------------------------------------------
export async function getConsent(req: AuthedRequest, res: Response): Promise<void> {
  const settings = await getSettings(uid(req));
  res.json({ version: CONSENT_VERSION, settings });
}
export async function postConsent(req: AuthedRequest, res: Response): Promise<void> {
  const settings = await acceptConsent(uid(req), req.body ?? {});
  // Dispara o backfill do histórico em background (uma vez), p/ a busca semântica/assistente
  // já conhecerem as conversas existentes. Fail-soft.
  getSessionIdOrThrow(uid(req))
    .then((sessionId) => void backfillUserEmbeddings(uid(req), sessionId))
    .catch(() => undefined);
  res.json({ ok: true, settings });
}

export async function postReindex(req: AuthedRequest, res: Response): Promise<void> {
  const userId = uid(req);
  const sessionId = await getSessionIdOrThrow(userId);
  void backfillUserEmbeddings(userId, sessionId);
  res.json({ started: true, status: backfillStatus(userId) });
}
export async function getReindex(req: AuthedRequest, res: Response): Promise<void> {
  res.json(backfillStatus(uid(req)));
}
export async function postRevoke(req: AuthedRequest, res: Response): Promise<void> {
  await revokeConsent(uid(req));
  res.json({ ok: true });
}
export async function putSettings(req: AuthedRequest, res: Response): Promise<void> {
  const settings = await updateSettings(uid(req), req.body ?? {});
  res.json({ settings });
}
export async function postPurge(req: AuthedRequest, res: Response): Promise<void> {
  await purgeAiData(uid(req));
  res.json({ ok: true });
}

// ---- por-chat ---------------------------------------------------------------
export async function getChatAi(req: AuthedRequest, res: Response): Promise<void> {
  const sessionId = await getSessionIdOrThrow(uid(req));
  const chat = await getChat(sessionId, req.params.id);
  res.json(await getChatSettings(uid(req), chat.jid));
}
export async function putChatAi(req: AuthedRequest, res: Response): Promise<void> {
  const sessionId = await getSessionIdOrThrow(uid(req));
  const chat = await getChat(sessionId, req.params.id);
  res.json(await setChatSettings(uid(req), chat.jid, req.body ?? {}));
}

// ---- Fase A: suggest / rewrite / summary / triage ---------------------------
export async function postSuggest(req: AuthedRequest, res: Response): Promise<void> {
  await getSessionIdOrThrow(uid(req));
  res.json(await generateSuggestion(uid(req), req.params.id));
}
export async function postRewrite(req: AuthedRequest, res: Response): Promise<void> {
  const variants = await rewriteDraft(uid(req), String(req.body?.text ?? ''), String(req.body?.mode ?? 'melhorar'));
  res.json({ variants });
}
export async function getSummary(req: AuthedRequest, res: Response): Promise<void> {
  await getSessionIdOrThrow(uid(req));
  res.json(await summarizeChat(uid(req), req.params.id));
}
export async function getTriage(req: AuthedRequest, res: Response): Promise<void> {
  await getSessionIdOrThrow(uid(req));
  res.json((await triageChat(uid(req), req.params.id)) ?? { priority: 'fyi', reason: '' });
}
export async function postLearnStyle(req: AuthedRequest, res: Response): Promise<void> {
  // Aprende estilo a partir das últimas mensagens enviadas pelo usuário.
  const sessionId = await getSessionIdOrThrow(uid(req));
  const sent = await prisma.message.findMany({
    where: { fromMe: true, type: 'text', chat: { sessionId } },
    orderBy: { timestamp: 'desc' },
    take: 20,
    select: { text: true },
  });
  await learnStyleFrom(uid(req), sent.map((m) => m.text ?? '').filter(Boolean));
  res.json({ ok: true });
}

// ---- Fase B: busca semântica global ----------------------------------------
export async function getSearch(req: AuthedRequest, res: Response): Promise<void> {
  const q = String(req.query.q ?? '');
  const sessionId = await getSessionIdOrThrow(uid(req)).catch(() => null);
  const hits = await searchHistorySemantic(uid(req), null, q, 12);
  // Resolve chatId + nome do chat por jid para a UI navegar.
  const out = [];
  for (const h of hits) {
    let chatId: string | null = null;
    let chatName: string | null = null;
    if (sessionId) {
      const chat = await prisma.chat.findFirst({ where: { sessionId, jid: h.chatJid }, select: { id: true, name: true } }).catch(() => null);
      chatId = chat?.id ?? null;
      chatName = chat?.name ?? null;
    }
    out.push({ messageId: h.messageId, chatId, chatName, fromMe: h.fromMe, text: h.text, ts: h.ts, score: h.score });
  }
  res.json({ query: q, hits: out });
}

// ---- Fase B/C: assistente (RAG + agente) -----------------------------------
export async function postAssistant(req: AuthedRequest, res: Response): Promise<void> {
  const userId = uid(req);
  const sessionId = await getSessionIdOrThrow(userId);
  const message = String(req.body?.message ?? '').trim();
  if (!message) {
    res.status(400).json({ error: 'message obrigatório' });
    return;
  }
  const result = await runAssistantTurn({ message, userId, sessionId });
  // Ações propostas (proposeTools) → assina tokens para o fluxo de confirmação.
  const proposals = (result.toolCalls ?? [])
    .filter((tc) => tc.status === 'proposed')
    .map((tc) => {
      const args = (tc.arguments ?? {}) as Record<string, unknown>;
      return {
        token: signPendingAction({ toolName: tc.name, arguments: args, userId, chatJid: String(args.chatId ?? '') }),
        name: tc.name,
        arguments: args,
      };
    });
  res.json({
    text: result.text,
    route: result.route,
    proposed: result.proposed,
    citations: (result.evidence ?? []).slice(0, 6),
    proposals,
    usage: result.usage,
  });
}

// ---- confirmação de ação (proposeTools → /ai/confirm) -----------------------
export async function postConfirm(req: AuthedRequest, res: Response): Promise<void> {
  const userId = uid(req);
  const token = String(req.body?.token ?? '');
  const payload = verifyPendingAction(token, { userId });
  if (!payload) {
    res.status(400).json({ error: 'token inválido ou expirado' });
    return;
  }
  const tool = TOOL_BY_NAME.get(payload.toolName);
  if (!tool) {
    res.status(404).json({ error: 'tool desconhecida' });
    return;
  }
  const sessionId = await getSessionIdOrThrow(userId);
  const { dispatchTool } = await loadAiCore();
  try {
    const out = await dispatchTool(tool, payload.arguments, {
      identity: { sub: userId },
      channel: 'whatsapp',
      confirmedToolCallId: token,
      userId,
      sessionId,
    } as never);
    await query(`insert into ai_action_log (user_id, chat_jid, kind, payload, status) values ($1,$2,$3,$4::jsonb,$5)`, [
      userId, payload.chatJid || null, payload.toolName, JSON.stringify(payload.arguments), 'executed',
    ]).catch(() => undefined);
    emitToUser(userId, 'ai.action.result', { name: payload.toolName, status: 'executed' });
    res.json({ ok: true, output: out.output });
  } catch (e) {
    await query(`insert into ai_action_log (user_id, chat_jid, kind, payload, status) values ($1,$2,$3,$4::jsonb,$5)`, [
      userId, payload.chatJid || null, payload.toolName, JSON.stringify(payload.arguments), 'failed',
    ]).catch(() => undefined);
    res.status(502).json({ error: String((e as Error)?.message ?? e) });
  }
}

// ---- Fase C: base de conhecimento ------------------------------------------
export async function getKb(req: AuthedRequest, res: Response): Promise<void> {
  res.json({ sources: await listSources(uid(req)) });
}
export async function postKb(req: AuthedRequest, res: Response): Promise<void> {
  const userId = uid(req);
  const files = (req as unknown as { files?: Array<{ originalname: string; mimetype: string; buffer: Buffer }> }).files;
  if (files?.length) {
    const out = await ingestFiles(userId, files.map((f) => ({ filename: f.originalname, mime: f.mimetype, bytes: f.buffer })));
    res.json({ sources: out });
    return;
  }
  const name = String(req.body?.name ?? '').trim();
  const text = String(req.body?.text ?? '');
  if (!name || !text.trim()) {
    res.status(400).json({ error: 'envie arquivos OU { name, text }' });
    return;
  }
  res.json(await ingestText(userId, name, text));
}
export async function deleteKb(req: AuthedRequest, res: Response): Promise<void> {
  await removeSource(uid(req), String(req.params.sid));
  res.json({ ok: true });
}

// ---- Fase B: entender mídia (multimodal) -----------------------------------
export async function postUnderstandMedia(req: AuthedRequest, res: Response): Promise<void> {
  const userId = uid(req);
  await getSessionIdOrThrow(userId);
  if (!aiDbEnabled()) {
    res.status(503).json({ error: 'IA indisponível' });
    return;
  }
  const msg = await prisma.message.findUnique({ where: { id: String(req.params.messageId) }, include: { media: true } });
  if (!msg?.media?.localPath) {
    res.status(409).json({ error: 'mídia ainda não baixada — abra-a primeiro' });
    return;
  }
  const fs = await import('node:fs/promises');
  const bytes = await fs.readFile(msg.media.localPath).catch(() => null);
  if (!bytes) {
    res.status(409).json({ error: 'arquivo indisponível' });
    return;
  }
  const { ingest, toMessageContent, supportsVision, supportsPdf } = await (await import('./ai-core-loader')).loadFileIngest();
  const { callAI, chatMultimodal, activeModel } = await import('./ai.service');
  const ingested = await ingest([{ filename: msg.media.fileName ?? 'arquivo', mime: msg.media.mimeType ?? 'application/octet-stream', bytes }]);
  const model = activeModel();
  const content = toMessageContent(ingested, {
    provider: (await import('./ai.service')).activeProvider(),
    supportsVision: supportsVision(model),
    supportsPdf: supportsPdf(model),
    userText: 'Descreva/explique este anexo em português, de forma curta e útil (faça OCR se for comprovante/imagem com texto).',
  });
  const text = await callAI(
    (client) => chatMultimodal(client, [{ role: 'user', content: content as never }]),
    '',
    { stage: 'media' },
  );
  res.json({ understanding: text });
}
