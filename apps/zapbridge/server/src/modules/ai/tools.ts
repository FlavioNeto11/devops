// =============================================================================
// Tools do assistente do ZapBridge (contrato @flavioneto11/ai-core).
// authz por IDENTIDADE: cada tool age só sobre a sessão WhatsApp do próprio usuário
// (toolContext.userId === identity.sub). R1 = leitura; R3 (send_message/react/mark_read)
// são mutantes com dry-run → confirmação explícita (/ai/confirm), preservando
// "a IA nunca envia sem o usuário confirmar". Espelha apps/gymops/.../ai/graph/tools.ts.
// =============================================================================
import type { AiTool, AiToolContext, AiToolRegistry } from '@flavioneto11/ai-core';
import { prisma } from '../../lib/prisma';
import { listChats, listMessages } from '../chats/chats.service';
import { sendText, sendReaction, markChatRead } from '../whatsapp/baileys.manager';
import { searchHistorySemantic, retrieveKnowledge } from './rag';
import { emitToUser } from '../../realtime/io';
import { loadAiCore } from './ai-core-loader';

type Ctx = AiToolContext & { userId?: string; sessionId?: string };

function ownerOk(ctx: Ctx): { allowed: boolean; reason?: string } {
  const sub = ctx.identity?.sub;
  if (!sub || !ctx.userId || String(sub) !== String(ctx.userId) || !ctx.sessionId) {
    return { allowed: false, reason: 'identidade/sessão ausente' };
  }
  return { allowed: true };
}

// Resolve uma conversa por chatId, jid OU NOME (o LLM costuma referir por nome, ex.: "Cognição").
// Sem isso, o assistente passava ids inválidos entre turnos e tudo "retornava vazio".
async function resolveChat(
  sessionId: string,
  ref: string,
): Promise<{ id: string; jid: string; name: string | null } | null> {
  if (!ref) return null;
  const byIdOrJid = await prisma.chat.findFirst({
    where: { sessionId, OR: [{ id: ref }, { jid: ref }] },
    select: { id: true, jid: true, name: true },
  });
  if (byIdOrJid) return byIdOrJid;
  const matches = await listChats(sessionId, ref).catch(() => []);
  const first = matches[0];
  return first ? { id: first.id, jid: first.jid, name: first.name } : null;
}

const list_chats: AiTool = {
  name: 'list_chats',
  description: 'Lista as conversas recentes do usuário (nome, id, se é grupo, não lidas). Use para localizar uma conversa por nome.',
  specialist: 'assistant',
  risk: 'R1',
  mutates: false,
  parameters: { type: 'object', properties: { search: { type: 'string' }, limit: { type: 'number' } } },
  authorize: (ctx) => Promise.resolve(ownerOk(ctx as Ctx)),
  execute: async (input: { search?: string; limit?: number }, ctx) => {
    const c = ctx as Ctx;
    const chats = await listChats(c.sessionId!, input.search);
    return {
      total: chats.length,
      chats: chats.slice(0, Math.min(input.limit ?? 15, 30)).map((x) => ({
        id: x.id, name: x.name, isGroup: x.isGroup, unread: x.unreadCount,
      })),
    };
  },
};

const get_recent_messages: AiTool = {
  name: 'get_recent_messages',
  description: 'Lê as últimas mensagens de uma conversa, identificada por NOME (ex.: "Cognição", "Kauane") ou pelo id do list_chats. Use para entender o contexto antes de responder ou resumir.',
  specialist: 'assistant',
  risk: 'R1',
  mutates: false,
  parameters: {
    type: 'object',
    properties: { chat: { type: 'string', description: 'nome ou id da conversa' }, limit: { type: 'number' } },
    required: ['chat'],
  },
  authorize: (ctx) => Promise.resolve(ownerOk(ctx as Ctx)),
  execute: async (input: { chat?: string; chatId?: string; limit?: number }, ctx) => {
    const c = ctx as Ctx;
    const ref = input.chat ?? input.chatId ?? '';
    const chat = await resolveChat(c.sessionId!, ref);
    if (!chat) return { error: 'chat_not_found', hint: 'chame list_chats para ver as conversas disponíveis' };
    const { messages } = await listMessages(chat.id, undefined, Math.min(input.limit ?? 15, 40));
    return {
      chat: chat.name,
      messages: messages
        .slice()
        .reverse()
        .map((m: any) => ({ from: m.fromMe ? 'você' : (m.senderName ?? 'contato'), type: m.type, text: m.text })),
    };
  },
};

const search_history: AiTool = {
  name: 'search_history_semantic',
  description: 'Busca por SIGNIFICADO no histórico de mensagens do usuário ("onde combinei o pagamento com o João?"). Opcionalmente restrita a um chatId.',
  specialist: 'assistant',
  risk: 'R1',
  mutates: false,
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' }, chatId: { type: 'string' }, k: { type: 'number' } },
    required: ['query'],
  },
  authorize: (ctx) => Promise.resolve(ownerOk(ctx as Ctx)),
  execute: async (input: { query: string; chat?: string; chatId?: string; k?: number }, ctx) => {
    const c = ctx as Ctx;
    let chatJid: string | null = null;
    const ref = input.chat ?? input.chatId;
    if (ref) {
      const chat = await resolveChat(c.sessionId!, ref);
      chatJid = chat?.jid ?? null;
    }
    const hits = await searchHistorySemantic(c.userId!, chatJid, input.query, Math.min(input.k ?? 8, 20));
    return { hits: hits.map((h) => ({ from: h.fromMe ? 'você' : 'contato', text: h.text, when: h.ts, score: Number(h.score.toFixed(3)) })) };
  },
};

const search_knowledge: AiTool = {
  name: 'search_knowledge',
  description: 'Busca na BASE DE CONHECIMENTO do usuário (catálogo, FAQ, preços que ele subiu). Use para responder dúvidas de clientes com dados reais.',
  specialist: 'assistant',
  risk: 'R1',
  mutates: false,
  parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  authorize: (ctx) => Promise.resolve(ownerOk(ctx as Ctx)),
  execute: async (input: { query: string }, ctx) => {
    const c = ctx as Ctx;
    const hits = await retrieveKnowledge(c.userId!, input.query, 6);
    return { hits: hits.map((h) => ({ title: h.title, text: h.text, score: Number(h.score.toFixed(3)) })) };
  },
};

// ── Mutantes (R3, dry-run + confirmação) ─────────────────────────────────────
const send_message: AiTool = {
  name: 'send_message',
  description: 'Envia uma mensagem de texto numa conversa (por NOME ou id). Gera uma PRÉVIA; só envia de verdade após o usuário confirmar.',
  specialist: 'assistant',
  risk: 'R3',
  mutates: true,
  supportsDryRun: true,
  parameters: {
    type: 'object',
    properties: { chat: { type: 'string', description: 'nome ou id da conversa' }, text: { type: 'string' } },
    required: ['chat', 'text'],
  },
  authorize: (ctx) => Promise.resolve(ownerOk(ctx as Ctx)),
  execute: async (input: { chat?: string; chatId?: string; text: string }, ctx) => {
    const c = ctx as Ctx;
    const chat = await resolveChat(c.sessionId!, input.chat ?? input.chatId ?? '');
    if (!chat) return { error: 'chat_not_found' };
    if (c.dryRun === true) return { preview: true, to: chat.name, chatId: chat.id, text: input.text };
    const msg = await prisma.message.create({
      data: { chatId: chat.id, fromMe: true, senderJid: chat.jid, type: 'text', text: input.text, status: 'pending', timestamp: new Date() },
    });
    await prisma.chat.update({ where: { id: chat.id }, data: { lastMessageId: msg.id, lastMessageAt: new Date() } }).catch(() => undefined);
    await sendText(c.userId!, chat.jid, input.text, msg.id);
    return { sent: true, messageId: msg.id, to: chat.name };
  },
};

const react: AiTool = {
  name: 'react',
  description: 'Reage a uma mensagem com um emoji (por chatId + messageId). Gera prévia; só reage após confirmação.',
  specialist: 'assistant',
  risk: 'R3',
  mutates: true,
  supportsDryRun: true,
  parameters: {
    type: 'object',
    properties: { chat: { type: 'string', description: 'nome ou id' }, messageId: { type: 'string' }, emoji: { type: 'string' } },
    required: ['chat', 'messageId', 'emoji'],
  },
  authorize: (ctx) => Promise.resolve(ownerOk(ctx as Ctx)),
  execute: async (input: { chat?: string; chatId?: string; messageId: string; emoji: string }, ctx) => {
    const c = ctx as Ctx;
    if (c.dryRun === true) return { preview: true, emoji: input.emoji, messageId: input.messageId };
    const chat = await resolveChat(c.sessionId!, input.chat ?? input.chatId ?? '');
    if (!chat) return { error: 'chat_not_found' };
    await sendReaction(c.userId!, chat.id, input.messageId, input.emoji);
    return { reacted: true };
  },
};

const mark_read: AiTool = {
  name: 'mark_read',
  description: 'Marca uma conversa como lida (por NOME ou id). Gera prévia; só marca após confirmação.',
  specialist: 'assistant',
  risk: 'R3',
  mutates: true,
  supportsDryRun: true,
  parameters: { type: 'object', properties: { chat: { type: 'string', description: 'nome ou id' } }, required: ['chat'] },
  authorize: (ctx) => Promise.resolve(ownerOk(ctx as Ctx)),
  execute: async (input: { chat?: string; chatId?: string }, ctx) => {
    const c = ctx as Ctx;
    const chat = await resolveChat(c.sessionId!, input.chat ?? input.chatId ?? '');
    if (!chat) return { error: 'chat_not_found' };
    if (c.dryRun === true) return { preview: true, chat: chat.name };
    await markChatRead(c.userId!, chat.jid);
    emitToUser(c.userId!, 'chat.updated', { chat: { id: chat.id, unreadCount: 0 } });
    return { marked: true };
  },
};

export const ALL_TOOLS: AiTool[] = [list_chats, get_recent_messages, search_history, search_knowledge, send_message, react, mark_read];
export const TOOL_BY_NAME = new Map(ALL_TOOLS.map((t) => [t.name, t]));

let _registry: AiToolRegistry | null = null;
/** Registry lazy (createToolRegistry é ESM). */
export async function getToolRegistry(): Promise<AiToolRegistry> {
  if (_registry) return _registry;
  const { createToolRegistry } = await loadAiCore();
  _registry = createToolRegistry(ALL_TOOLS);
  return _registry;
}
