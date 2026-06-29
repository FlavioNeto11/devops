// =============================================================================
// Cola entre o baileys.manager e a camada de IA. Chamado fire-and-forget após
// persistir cada mensagem (nunca no caminho da resposta). Tudo fail-soft e opt-in:
// sem consentimento/banco/chaves, no-op. Inclui o expurgo de dados de IA no logout.
// =============================================================================
import { aiDbEnabled, query } from './pg';
import { enqueueMessageEmbedding, purgeUserEmbeddings } from './embeddings.worker';
import { isConsented, getSettings, getChatSettings } from './consent';
import { generateSuggestion } from './smart-reply';
import { retrieveKnowledge, knowledgeBlock } from './rag';
import { callAI, chatJSON } from './ai.service';
import { toneHint } from './prompts';
import { purgeUserKnowledge } from './kb';
import { emitToUser } from '../../realtime/io';
import { sendText } from '../whatsapp/baileys.manager';
import { prisma } from '../../lib/prisma';

interface IncomingCtx {
  userId: string;
  sessionId: string;
  chatId: string;
  chatJid: string;
  isGroup: boolean;
  isLocked: boolean;
  messageId: string;
  text: string | null;
  fromMe: boolean;
  ts: Date;
  notify: boolean;
}

/** Pós-recebimento: indexa + (se aplicável) sugere resposta / auto-responde. */
export async function onIncomingMessage(ctx: IncomingCtx): Promise<void> {
  if (!aiDbEnabled()) return;
  // Conversa TRANCADA: a IA não toca (não indexa, não sugere, não auto-responde).
  if (ctx.isLocked) return;
  // 1) indexa a mensagem (ambas as direções) para busca semântica.
  enqueueMessageEmbedding({
    messageId: ctx.messageId,
    userId: ctx.userId,
    chatJid: ctx.chatJid,
    fromMe: ctx.fromMe,
    text: ctx.text,
    ts: ctx.ts,
  });

  // Só mensagens RECEBIDAS (notify) disparam sugestão/auto-resposta.
  if (ctx.fromMe || !ctx.notify) return;
  if (!(await isConsented(ctx.userId))) return;

  const settings = await getSettings(ctx.userId);
  const chatCfg = await getChatSettings(ctx.userId, ctx.chatJid);
  if (chatCfg.excluded) return; // opt-out por chat
  if (ctx.isGroup && !settings.includeGroups) return; // grupos OFF por padrão

  // 2) auto-resposta (F8) tem prioridade sobre a sugestão, com guardrails.
  if (chatCfg.autoreplyEnabled && !ctx.isGroup) {
    const fired = await tryAutoReply(ctx, settings).catch(() => false);
    if (fired) return;
  }

  // 3) smart reply (chips) — gera e emite via socket.
  if (!settings.suggestionsEnabled) return;
  try {
    const sug = await generateSuggestion(ctx.userId, ctx.chatId);
    if (sug.suggestions.length) {
      emitToUser(ctx.userId, 'ai.suggestion.generated', {
        chatId: ctx.chatId,
        suggestions: sug.suggestions,
        styleApplied: sug.styleApplied,
      });
    }
  } catch {
    /* fail-soft: chips somem */
  }
}

interface AutoReplyCfg {
  startHour?: number;
  endHour?: number;
  maxPerChat?: number;
  minConfidence?: number;
  disclaimer?: string;
}

async function autoReplyCountToday(userId: string, chatJid: string): Promise<number> {
  const r = await query<{ n: number }>(
    `select count(*)::int as n from ai_autoreply_log where user_id = $1 and chat_jid = $2 and created_at::date = now()::date`,
    [userId, chatJid],
  ).catch(() => ({ rows: [{ n: 0 }] }));
  return r.rows[0]?.n ?? 0;
}

/** Auto-resposta FAQ-grounded com judge-gate + horário + limite + handoff. Retorna true se enviou. */
async function tryAutoReply(ctx: IncomingCtx, settings: { autoreply: Record<string, unknown>; tone: string; language: string }): Promise<boolean> {
  const cfg = (settings.autoreply ?? {}) as AutoReplyCfg;
  const now = new Date();
  const hour = now.getHours();
  const start = cfg.startHour ?? 0;
  const end = cfg.endHour ?? 24;
  const max = cfg.maxPerChat ?? 20;
  const minConf = cfg.minConfidence ?? 0.6;

  if (hour < start || hour >= end) return false; // fora do horário
  if ((await autoReplyCountToday(ctx.userId, ctx.chatJid)) >= max) return false; // limite diário

  const kb = await retrieveKnowledge(ctx.userId, ctx.text ?? '', 6);
  const prompt = [
    `Você é o atendimento automático do dono deste WhatsApp (${settings.language}). ${toneHint(settings.tone)}`,
    'Responda à mensagem do cliente SOMENTE com base na BASE DE CONHECIMENTO abaixo. Se não houver base suficiente, NÃO responda.',
    knowledgeBlock(kb),
    `Mensagem do cliente: ${ctx.text ?? ''}`,
    'Responda APENAS JSON: {"reply":"<resposta ou vazio>","confidence":0..1,"grounded":true|false}',
  ].join('\n\n');

  const out = (await callAI((client) => chatJSON(client, prompt), {}, { stage: 'autoreply' })) as any;
  const reply = String(out?.reply ?? '').trim();
  const confidence = Number(out?.confidence ?? 0);
  const grounded = Boolean(out?.grounded);

  if (!reply || !grounded || confidence < minConf) {
    // handoff humano: marca "precisa de você" (a UI pode destacar) e não responde.
    emitToUser(ctx.userId, 'ai.autoreply.handoff', { chatId: ctx.chatId });
    return false;
  }

  const disclaimer = typeof cfg.disclaimer === 'string' && cfg.disclaimer ? `${cfg.disclaimer}\n\n` : '';
  const finalText = `${disclaimer}${reply}`;
  const msg = await prisma.message.create({
    data: { chatId: ctx.chatId, fromMe: true, senderJid: ctx.chatJid, type: 'text', text: finalText, status: 'pending', timestamp: new Date() },
  });
  await prisma.chat.update({ where: { id: ctx.chatId }, data: { lastMessageId: msg.id, lastMessageAt: new Date() } }).catch(() => undefined);
  await sendText(ctx.userId, ctx.chatJid, finalText, msg.id);
  await query(
    `insert into ai_autoreply_log (user_id, chat_jid, message_id, confidence) values ($1,$2,$3,$4)`,
    [ctx.userId, ctx.chatJid, msg.id, confidence],
  ).catch(() => undefined);
  emitToUser(ctx.userId, 'ai.autoreply.fired', { chatId: ctx.chatId, messageId: msg.id, confidence });
  return true;
}

/** Histórico (backfill): só indexa, sem sugerir. Pula conversas trancadas. */
export function onHistoryMessage(job: {
  userId: string;
  chatJid: string;
  messageId: string;
  text: string | null;
  fromMe: boolean;
  ts: Date;
  isLocked?: boolean;
}): void {
  if (!aiDbEnabled() || job.isLocked) return;
  enqueueMessageEmbedding(job);
}

/** Expurgo TOTAL dos dados de IA do usuário (logout / "apagar dados de IA"). */
export async function purgeAiData(userId: string): Promise<void> {
  if (!aiDbEnabled()) return;
  await Promise.all([
    purgeUserEmbeddings(userId),
    purgeUserKnowledge(userId),
    query(`delete from ai_user_memory where user_id = $1`, [userId]).catch(() => undefined),
    query(`delete from ai_chat_threads where id = $1`, [`chat:${userId}`]).catch(() => undefined),
    query(`delete from ai_chat_settings where user_id = $1`, [userId]).catch(() => undefined),
    query(`delete from ai_action_log where user_id = $1`, [userId]).catch(() => undefined),
    query(`delete from ai_autoreply_log where user_id = $1`, [userId]).catch(() => undefined),
  ]);
}
