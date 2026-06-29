import { prisma } from '../../lib/prisma';
import { chatKind } from '../../utils/jid';

// Retorna o id da WhatsAppSession do usuário, ou lança 403 se não houver.
export async function getSessionIdOrThrow(userId: string): Promise<string> {
  const session = await prisma.whatsAppSession.findUnique({ where: { userId } });
  if (!session) {
    throw Object.assign(new Error('Nenhuma sessão WhatsApp ativa'), { status: 403 });
  }
  return session.id;
}

// Resolve o nome de exibição: nome próprio, senão (1:1) o nome do contato,
// senão o número. Grupos/canais sem nome caem no jid.
function displayName(
  chat: { name: string | null; jid: string },
  nameByJid: Map<string, string | null>,
): string {
  const kind = chatKind(chat.jid);
  // 1:1 → o nome SALVO na agenda (ou pushName) vence o nome de perfil do chat.
  if (kind === 'chat') {
    const fromContact = nameByJid.get(chat.jid);
    if (fromContact) return fromContact;
    if (chat.name) return chat.name;
    return chat.jid.split('@')[0].split(':')[0];
  }
  // grupo/canal → assunto do próprio chat. Canal sem nome ainda não
  // sincronizado: mostra "Canal" em vez do JID cru (o sweep resolve depois).
  if (chat.name) return chat.name;
  if (kind === 'channel') return 'Canal';
  return chat.jid;
}

export async function listChats(
  sessionId: string,
  search?: string,
  archived = false,
  locked?: boolean, // undefined => não filtra (mostra trancadas junto)
) {
  const [chats, contacts] = await Promise.all([
    prisma.chat.findMany({
      // Só conversas com mensagens (como o WhatsApp), em ordem cronológica.
      // `locked` undefined => não filtra (mostra trancadas junto, quando não há código).
      where: { sessionId, messages: { some: {} }, archived, ...(locked !== undefined ? { locked } : {}) },
      orderBy: { lastMessageAt: 'desc' },
      take: 300,
      include: { messages: { orderBy: { timestamp: 'desc' }, take: 1 } },
    }),
    prisma.contact.findMany({ where: { sessionId } }),
  ]);
  const nameByJid = new Map(contacts.map((c) => [c.jid, c.name ?? c.pushName]));

  let mapped = chats.map((c) => ({
    id: c.id,
    jid: c.jid,
    name: displayName(c, nameByJid),
    avatarUrl: c.avatarUrl,
    kind: chatKind(c.jid),
    isGroup: c.isGroup,
    locked: c.locked,
    unreadCount: c.unreadCount,
    lastMessageAt: c.lastMessageAt,
    lastMessage: c.messages[0]
      ? {
          text: c.messages[0].text,
          type: c.messages[0].type,
          fromMe: c.messages[0].fromMe,
          senderName: c.isGroup && !c.messages[0].fromMe
            ? (nameByJid.get(c.messages[0].senderJid) ?? c.messages[0].senderJid.split('@')[0].split(':')[0])
            : null,
        }
      : null,
  }));

  // Busca aplicada após resolver o nome (pega nome do contato também).
  if (search) {
    const q = search.toLowerCase();
    mapped = mapped.filter((c) => c.name.toLowerCase().includes(q));
  }
  return mapped;
}

export async function getChat(sessionId: string, chatId: string) {
  const chat = await prisma.chat.findFirst({ where: { id: chatId, sessionId } });
  if (!chat) throw Object.assign(new Error('Conversa não encontrada'), { status: 404 });
  const kind = chatKind(chat.jid);
  let name = chat.name;
  if (kind === 'chat') {
    // 1:1 → nome salvo na agenda (ou pushName) tem prioridade sobre o perfil.
    const contact = await prisma.contact.findUnique({
      where: { sessionId_jid: { sessionId, jid: chat.jid } },
    });
    name =
      contact?.name ?? contact?.pushName ?? chat.name ?? chat.jid.split('@')[0].split(':')[0];
  }
  return { ...chat, kind, name: name ?? chat.jid };
}

export async function listMessages(chatId: string, cursor?: string, limit = 30, search?: string) {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { isGroup: true, sessionId: true },
  });
  const messages = await prisma.message.findMany({
    where: { chatId, ...(search ? { text: { contains: search } } : {}) },
    // timestamp do WhatsApp tem precisão de SEGUNDO; desempata por createdAt
    // (ordem de chegada) para casar com o WhatsApp Web.
    orderBy: [{ timestamp: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { media: true },
  });
  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;

  // Resolve nomes de remetentes (grupos) e quoted messages (todos os chats).
  const nameByJid = new Map<string, string | null | undefined>();
  if (chat?.isGroup) {
    const senderJids = [...new Set(page.map((m) => m.senderJid))];
    const contacts = senderJids.length
      ? await prisma.contact.findMany({
          where: { sessionId: chat.sessionId, jid: { in: senderJids } },
          select: { jid: true, name: true, pushName: true },
        })
      : [];
    for (const c of contacts) nameByJid.set(c.jid, c.name ?? c.pushName);
  }

  // Resolve @mentions: busca JIDs mencionados nos textos que ainda não estão no mapa.
  if (chat?.sessionId) {
    const mentionedJids: string[] = [];
    for (const m of page) {
      if (m.text) {
        for (const [, digits] of m.text.matchAll(/@(\d+)/g)) {
          const jid = `${digits}@s.whatsapp.net`;
          if (!nameByJid.has(jid)) mentionedJids.push(jid);
        }
      }
    }
    if (mentionedJids.length) {
      const mentionContacts = await prisma.contact.findMany({
        where: { sessionId: chat.sessionId, jid: { in: [...new Set(mentionedJids)] } },
        select: { jid: true, name: true, pushName: true },
      });
      for (const c of mentionContacts) nameByJid.set(c.jid, c.name ?? c.pushName);
    }
  }

  // Batch-lookup de mensagens citadas.
  const quotedWaIds = [
    ...new Set(page.filter((m) => m.quotedMessageId).map((m) => m.quotedMessageId!)),
  ];
  const quotedByWaId = new Map<
    string,
    { text: string | null; type: string; senderJid: string; fromMe: boolean }
  >();
  if (quotedWaIds.length) {
    const qMsgs = await prisma.message.findMany({
      where: { chatId, waMessageId: { in: quotedWaIds } },
      select: { waMessageId: true, text: true, type: true, senderJid: true, fromMe: true },
    });
    for (const q of qMsgs) if (q.waMessageId) quotedByWaId.set(q.waMessageId, q);

    // Resolve nomes dos remetentes das mensagens citadas (grupos — JIDs que ainda não temos).
    if (chat?.isGroup) {
      const missing = [...new Set(qMsgs.filter((q) => !q.fromMe && !nameByJid.has(q.senderJid)).map((q) => q.senderJid))];
      if (missing.length) {
        const extra = await prisma.contact.findMany({
          where: { sessionId: chat.sessionId, jid: { in: missing } },
          select: { jid: true, name: true, pushName: true },
        });
        for (const c of extra) nameByJid.set(c.jid, c.name ?? c.pushName);
      }
    }
  }

  const resolveText = (text: string | null): string | null => {
    if (!text) return text;
    return text.replace(/@(\d+)/g, (match, digits) => {
      const name = nameByJid.get(`${digits}@s.whatsapp.net`);
      return name ? `@${name}` : match;
    });
  };

  const resolveQuoted = (waId: string | null | undefined) => {
    if (!waId) return null;
    const q = quotedByWaId.get(waId);
    if (!q) return null;
    const senderName = q.fromMe ? 'Você' : (nameByJid.get(q.senderJid) ?? q.senderJid.split('@')[0]);
    return { text: resolveText(q.text), type: q.type, senderName };
  };

  const parseReactions = (raw: string | null) => {
    if (!raw) return [];
    try {
      const list = JSON.parse(raw) as Array<{ jid: string; emoji: string; fromMe: boolean }>;
      // 1 reação por pessoa; minhas reações (fromMe) colapsam em 'me' — corrige
      // contagens duplicadas herdadas (eco da própria reação com jid diferente).
      const byKey = new Map<string, { jid: string; emoji: string; fromMe: boolean }>();
      for (const r of list) {
        const k = r.fromMe ? 'me' : r.jid;
        byKey.set(k, { ...r, jid: k });
      }
      return [...byKey.values()];
    } catch {
      return [];
    }
  };

  return {
    messages: page.map((m) => ({
      ...m,
      text: resolveText(m.text),
      senderName:
        chat?.isGroup && !m.fromMe
          ? (nameByJid.get(m.senderJid) ?? m.senderJid.split('@')[0])
          : null,
      quoted: resolveQuoted(m.quotedMessageId),
      reactions: parseReactions(m.reactions),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  };
}
