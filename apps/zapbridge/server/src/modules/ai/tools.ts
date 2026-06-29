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
import { sendText, sendReaction, markChatRead, forwardMessage, setArchived } from '../whatsapp/baileys.manager';
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

// Janela de tempo no fuso de São Paulo (UTC-3, sem horário de verão no Brasil hoje).
const SP_OFFSET_MS = 3 * 3_600_000;
function localDay(daysAgo: number): { start: Date; end: Date } {
  const nowLocal = new Date(Date.now() - SP_OFFSET_MS);
  const y = nowLocal.getUTCFullYear();
  const m = nowLocal.getUTCMonth();
  const d = nowLocal.getUTCDate() - daysAgo;
  return {
    start: new Date(Date.UTC(y, m, d, 0, 0, 0) + SP_OFFSET_MS),
    end: new Date(Date.UTC(y, m, d, 23, 59, 59, 999) + SP_OFFSET_MS),
  };
}
/** Resolve um período em {start,end}. period: hoje|ontem|semana|mes; ou from/to ISO. */
function resolveTimeWindow(period?: string, from?: string, to?: string): { start: Date; end: Date } {
  if (from || to) {
    const start = from ? new Date(from) : new Date(0);
    const end = to ? new Date(to) : new Date();
    return { start: isNaN(start.getTime()) ? new Date(0) : start, end: isNaN(end.getTime()) ? new Date() : end };
  }
  const p = (period ?? '').toLowerCase();
  if (p.includes('ontem') || p.includes('yesterday')) return localDay(1);
  if (p.includes('hoje') || p.includes('today')) return localDay(0);
  if (p.includes('semana') || p.includes('week') || p.includes('7')) return { start: localDay(6).start, end: new Date() };
  if (p.includes('mes') || p.includes('mês') || p.includes('month') || p.includes('30')) return { start: localDay(29).start, end: new Date() };
  return { start: localDay(2).start, end: new Date() }; // default: últimos 3 dias
}

const MTYPE = (m: any) => (m.type === 'text' ? m.text ?? '' : `[${m.type}]${m.text ? ' ' + m.text : ''}`);

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
        .map((m: any) => ({ messageId: m.id, from: m.fromMe ? 'você' : (m.senderName ?? 'contato'), type: m.type, text: m.text, at: m.timestamp })),
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

// ── NOVAS CAPACIDADES (R1 leitura) ───────────────────────────────────────────
const get_messages_by_time: AiTool = {
  name: 'get_messages_by_time',
  description: 'Lista mensagens por PERÍODO (hoje, ontem, semana, mes) ou intervalo (from/to ISO) — em TODAS as conversas ou numa só. Filtra por remetente (fromMe true=enviadas/false=recebidas) e tipo (text|image|video|audio|document). Use para "o que recebi ontem?", "mensagens de hoje", etc.',
  specialist: 'assistant',
  risk: 'R1',
  mutates: false,
  parameters: {
    type: 'object',
    properties: {
      period: { type: 'string', description: 'hoje | ontem | semana | mes' },
      from: { type: 'string', description: 'início ISO (opcional)' },
      to: { type: 'string', description: 'fim ISO (opcional)' },
      chat: { type: 'string', description: 'nome/id da conversa (opcional; sem isto = todas)' },
      fromMe: { type: 'boolean', description: 'true=enviadas por você, false=recebidas' },
      type: { type: 'string', description: 'text|image|video|audio|document' },
      limit: { type: 'number' },
    },
  },
  authorize: (ctx) => Promise.resolve(ownerOk(ctx as Ctx)),
  execute: async (input: { period?: string; from?: string; to?: string; chat?: string; fromMe?: boolean; type?: string; limit?: number }, ctx) => {
    const c = ctx as Ctx;
    const { start, end } = resolveTimeWindow(input.period, input.from, input.to);
    let chatId: string | undefined;
    if (input.chat) chatId = (await resolveChat(c.sessionId!, input.chat))?.id;
    const rows = await prisma.message.findMany({
      where: {
        chat: { sessionId: c.sessionId! },
        timestamp: { gte: start, lte: end },
        ...(chatId ? { chatId } : {}),
        ...(typeof input.fromMe === 'boolean' ? { fromMe: input.fromMe } : {}),
        ...(input.type ? { type: input.type } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: Math.min(input.limit ?? 60, 150),
      include: { chat: { select: { name: true, jid: true, isGroup: true } } },
    });
    const contacts = await prisma.contact.findMany({ where: { sessionId: c.sessionId! }, select: { jid: true, name: true, pushName: true } });
    const nameByJid = new Map(contacts.map((x) => [x.jid, x.name ?? x.pushName]));
    return {
      window: { from: start.toISOString(), to: end.toISOString() },
      count: rows.length,
      messages: rows.reverse().map((m) => ({
        messageId: m.id,
        chat: m.chat.name ?? m.chat.jid.split('@')[0],
        from: m.fromMe ? 'você' : nameByJid.get(m.senderJid) ?? m.senderJid.split('@')[0],
        type: m.type,
        text: MTYPE(m),
        at: m.timestamp,
      })),
    };
  },
};

const list_unread: AiTool = {
  name: 'list_unread',
  description: 'Lista TODAS as conversas com mensagens NÃO LIDAS (nome, quantidade, prévia da última). Use para "o que não li?", "tem mensagem nova?".',
  specialist: 'assistant',
  risk: 'R1',
  mutates: false,
  parameters: { type: 'object', properties: {} },
  authorize: (ctx) => Promise.resolve(ownerOk(ctx as Ctx)),
  execute: async (_input, ctx) => {
    const c = ctx as Ctx;
    const chats = (await listChats(c.sessionId!)).filter((x: any) => x.unreadCount > 0);
    return {
      totalUnreadChats: chats.length,
      chats: chats.slice(0, 30).map((x: any) => ({ id: x.id, name: x.name, isGroup: x.isGroup, unread: x.unreadCount, last: x.lastMessage?.text ?? `[${x.lastMessage?.type ?? ''}]` })),
    };
  },
};

const search_messages: AiTool = {
  name: 'search_messages',
  description: 'Busca LITERAL por palavra/expressão exata nas mensagens (complementa a busca semântica). Em todas as conversas ou numa só. Use para nomes, números, links, termos exatos.',
  specialist: 'assistant',
  risk: 'R1',
  mutates: false,
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' }, chat: { type: 'string' }, fromMe: { type: 'boolean' }, limit: { type: 'number' } },
    required: ['query'],
  },
  authorize: (ctx) => Promise.resolve(ownerOk(ctx as Ctx)),
  execute: async (input: { query: string; chat?: string; fromMe?: boolean; limit?: number }, ctx) => {
    const c = ctx as Ctx;
    let chatId: string | undefined;
    if (input.chat) chatId = (await resolveChat(c.sessionId!, input.chat))?.id;
    const rows = await prisma.message.findMany({
      where: { chat: { sessionId: c.sessionId! }, text: { contains: input.query }, ...(chatId ? { chatId } : {}), ...(typeof input.fromMe === 'boolean' ? { fromMe: input.fromMe } : {}) },
      orderBy: { timestamp: 'desc' },
      take: Math.min(input.limit ?? 20, 50),
      include: { chat: { select: { name: true, jid: true } } },
    });
    return { count: rows.length, hits: rows.map((m) => ({ messageId: m.id, chat: m.chat.name ?? m.chat.jid.split('@')[0], from: m.fromMe ? 'você' : 'contato', text: m.text, at: m.timestamp })) };
  },
};

const find_contact: AiTool = {
  name: 'find_contact',
  description: 'Procura um contato pelo nome e devolve número e conversas. Use para "qual o número do João?", "quem é a Maria?".',
  specialist: 'assistant',
  risk: 'R1',
  mutates: false,
  parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  authorize: (ctx) => Promise.resolve(ownerOk(ctx as Ctx)),
  execute: async (input: { name: string }, ctx) => {
    const c = ctx as Ctx;
    const contacts = await prisma.contact.findMany({
      where: { sessionId: c.sessionId!, OR: [{ name: { contains: input.name } }, { pushName: { contains: input.name } }] },
      take: 10,
    });
    return { contacts: contacts.map((x) => ({ name: x.name ?? x.pushName, number: x.jid.split('@')[0].split(':')[0], jid: x.jid })) };
  },
};

const inbox_overview: AiTool = {
  name: 'inbox_overview',
  description: 'Visão geral da caixa: total de conversas, não-lidas, mensagens recebidas/enviadas hoje e conversas mais ativas. Use para "como está minha caixa?", "resumo do dia".',
  specialist: 'assistant',
  risk: 'R1',
  mutates: false,
  parameters: { type: 'object', properties: {} },
  authorize: (ctx) => Promise.resolve(ownerOk(ctx as Ctx)),
  execute: async (_input, ctx) => {
    const c = ctx as Ctx;
    const today = localDay(0);
    const sid = c.sessionId!;
    const [totalChats, unread, recvToday, sentToday, activeRaw] = await Promise.all([
      prisma.chat.count({ where: { sessionId: sid, messages: { some: {} } } }),
      prisma.chat.aggregate({ where: { sessionId: sid, unreadCount: { gt: 0 } }, _sum: { unreadCount: true }, _count: true }),
      prisma.message.count({ where: { chat: { sessionId: sid }, fromMe: false, timestamp: { gte: today.start, lte: today.end } } }),
      prisma.message.count({ where: { chat: { sessionId: sid }, fromMe: true, timestamp: { gte: today.start, lte: today.end } } }),
      prisma.message.groupBy({ by: ['chatId'], where: { chat: { sessionId: sid }, timestamp: { gte: today.start, lte: today.end } }, _count: { _all: true }, orderBy: { _count: { chatId: 'desc' } }, take: 5 }),
    ]);
    const ids = activeRaw.map((a) => a.chatId);
    const activeChats = ids.length ? await prisma.chat.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, jid: true } }) : [];
    const nameById = new Map(activeChats.map((x) => [x.id, x.name ?? x.jid.split('@')[0]]));
    return {
      totalChats,
      unreadChats: unread._count,
      totalUnread: unread._sum.unreadCount ?? 0,
      receivedToday: recvToday,
      sentToday,
      mostActiveToday: activeRaw.map((a) => ({ chat: nameById.get(a.chatId), messages: a._count._all })),
    };
  },
};

const list_media: AiTool = {
  name: 'list_media',
  description: 'Lista mídias recentes (foto/vídeo/áudio/documento) recebidas/enviadas, em todas as conversas ou numa só. Use para "que arquivos me mandaram?", "fotos recentes".',
  specialist: 'assistant',
  risk: 'R1',
  mutates: false,
  parameters: { type: 'object', properties: { chat: { type: 'string' }, type: { type: 'string' }, limit: { type: 'number' } } },
  authorize: (ctx) => Promise.resolve(ownerOk(ctx as Ctx)),
  execute: async (input: { chat?: string; type?: string; limit?: number }, ctx) => {
    const c = ctx as Ctx;
    let chatId: string | undefined;
    if (input.chat) chatId = (await resolveChat(c.sessionId!, input.chat))?.id;
    const rows = await prisma.message.findMany({
      where: { chat: { sessionId: c.sessionId! }, type: input.type ? input.type : { not: 'text' }, ...(chatId ? { chatId } : {}) },
      orderBy: { timestamp: 'desc' },
      take: Math.min(input.limit ?? 20, 40),
      include: { chat: { select: { name: true, jid: true } }, media: { select: { fileName: true, mimeType: true } } },
    });
    return { count: rows.length, media: rows.map((m) => ({ messageId: m.id, chat: m.chat.name ?? m.chat.jid.split('@')[0], type: m.type, file: m.media?.fileName ?? null, caption: m.text, from: m.fromMe ? 'você' : 'contato', at: m.timestamp })) };
  },
};

// ── NOVAS AÇÕES (R3, prévia + confirmação) ───────────────────────────────────
const forward_message: AiTool = {
  name: 'forward_message',
  description: 'Encaminha uma mensagem (por messageId, obtido das tools de leitura) para outra conversa (por nome). Gera PRÉVIA; só encaminha após confirmação.',
  specialist: 'assistant',
  risk: 'R3',
  mutates: true,
  supportsDryRun: true,
  parameters: { type: 'object', properties: { messageId: { type: 'string' }, toChat: { type: 'string', description: 'nome/id do destino' } }, required: ['messageId', 'toChat'] },
  authorize: (ctx) => Promise.resolve(ownerOk(ctx as Ctx)),
  execute: async (input: { messageId: string; toChat: string }, ctx) => {
    const c = ctx as Ctx;
    const dest = await resolveChat(c.sessionId!, input.toChat);
    if (!dest) return { error: 'chat_not_found' };
    if (c.dryRun === true) return { preview: true, to: dest.name, messageId: input.messageId };
    await forwardMessage(c.userId!, input.messageId, dest.id);
    return { forwarded: true, to: dest.name };
  },
};

const archive_chat: AiTool = {
  name: 'archive_chat',
  description: 'Arquiva (ou desarquiva) uma conversa por nome. Gera PRÉVIA; só aplica após confirmação.',
  specialist: 'assistant',
  risk: 'R3',
  mutates: true,
  supportsDryRun: true,
  parameters: { type: 'object', properties: { chat: { type: 'string' }, archived: { type: 'boolean', description: 'true=arquivar (default), false=desarquivar' } }, required: ['chat'] },
  authorize: (ctx) => Promise.resolve(ownerOk(ctx as Ctx)),
  execute: async (input: { chat: string; archived?: boolean }, ctx) => {
    const c = ctx as Ctx;
    const chat = await resolveChat(c.sessionId!, input.chat);
    if (!chat) return { error: 'chat_not_found' };
    const arch = input.archived !== false;
    if (c.dryRun === true) return { preview: true, chat: chat.name, archived: arch };
    await setArchived(c.userId!, chat.jid, arch);
    return { ok: true, chat: chat.name, archived: arch };
  },
};

export const ALL_TOOLS: AiTool[] = [
  list_chats, get_recent_messages, get_messages_by_time, list_unread, search_history, search_messages,
  search_knowledge, find_contact, inbox_overview, list_media,
  send_message, react, mark_read, forward_message, archive_chat,
];
export const TOOL_BY_NAME = new Map(ALL_TOOLS.map((t) => [t.name, t]));

let _registry: AiToolRegistry | null = null;
/** Registry lazy (createToolRegistry é ESM). */
export async function getToolRegistry(): Promise<AiToolRegistry> {
  if (_registry) return _registry;
  const { createToolRegistry } = await loadAiCore();
  _registry = createToolRegistry(ALL_TOOLS);
  return _registry;
}
