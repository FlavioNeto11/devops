import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  proto,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { emitToUser } from '../../realtime/io';
import { sendPush } from '../push/push.service';
import { isGroupJid, isStatusBroadcast, jidToPhone } from '../../utils/jid';
import { MessageType } from '../../types';
// Camada de IA (opt-in, fail-soft). Import em runtime → ciclo CJS resolve no call-time.
import { onIncomingMessage, onHistoryMessage, purgeAiData } from '../ai/hooks';

// Um socket Baileys por usuário do app. MVP: 1 sessão por usuário.
interface ManagedSession {
  sock: WASocket;
  userId: string;
  sessionId: string;
}

const sessions = new Map<string, ManagedSession>(); // key: userId

// Cache de mensagens raw recentes por sessão. O WhatsApp faz retries e pede o
// conteúdo original ao remetente — sem isso o app exibe "Aguardando mensagem".
const msgCache = new Map<string, Map<string, proto.IMessage>>(); // userId → (msgId → proto)
const MSG_CACHE_LIMIT = 1_000;

function cacheRawMessage(userId: string, msgId: string, msg: proto.IMessage | null | undefined) {
  if (!msg) return;
  if (!msgCache.has(userId)) msgCache.set(userId, new Map());
  const cache = msgCache.get(userId)!;
  if (cache.size >= MSG_CACHE_LIMIT) {
    const firstKey = cache.keys().next().value as string;
    cache.delete(firstKey);
  }
  cache.set(msgId, msg);
}

function dropMsgCache(userId: string) {
  msgCache.delete(userId);
}

// IDs de mensagens que acabamos de enviar mas ainda não persistimos no DB.
// Impede que o echo do Baileys (messages.upsert) crie uma duplicata antes do
// sendText/sendMedia terminar o prisma.update com o waMessageId.
const inflightSentIds = new Map<string, Set<string>>(); // userId → Set<waMessageId>

// Usuários em processo de reconexão manual: suprime os efeitos colaterais do
// connection.close (emissão de session.disconnected e auto-reconexão).
const reconnectingUsers = new Set<string>();

function authPathFor(userId: string): string {
  return path.join(env.authDir, userId);
}

// Há credenciais Baileys válidas no disco? (A pasta pode existir vazia após um
// logout que apagou o creds.json — nesse caso só reconecta via novo QR.)
export function hasValidCreds(userId: string): boolean {
  try {
    return existsSync(path.join(authPathFor(userId), 'creds.json'));
  } catch {
    return false;
  }
}

// Garante que exista uma WhatsAppSession para o usuário e retorna seu id.
async function ensureSessionRow(userId: string): Promise<string> {
  const existing = await prisma.whatsAppSession.findUnique({ where: { userId } });
  if (existing) return existing.id;
  const created = await prisma.whatsAppSession.create({
    data: { userId, authFolderPath: authPathFor(userId), status: 'disconnected' },
  });
  return created.id;
}

async function setStatus(userId: string, status: string, phoneNumber?: string) {
  await prisma.whatsAppSession.update({
    where: { userId },
    data: {
      status,
      ...(phoneNumber ? { phoneNumber } : {}),
      ...(status === 'connected' ? { lastConnectedAt: new Date() } : {}),
    },
  });
}

// Inicia (ou reinicia) a sessão Baileys de um usuário.
// `pairingPhone` (apenas dígitos com DDI) ativa o fluxo de pairing code em vez de QR.
export async function startSession(
  userId: string,
  pairingPhone?: string,
): Promise<{ status: string; pairingCode?: string }> {
  if (sessions.has(userId)) {
    // Sessão já existe: se pediram pairing e ainda não registrou, gera o código.
    const existing = sessions.get(userId)!;
    if (pairingPhone && !existing.sock.authState.creds.registered) {
      const pairingCode = await existing.sock.requestPairingCode(pairingPhone.replace(/\D/g, ''));
      emitToUser(userId, 'session.pairing.code', { code: pairingCode });
      return { status: 'connecting', pairingCode };
    }
    return { status: 'connecting' };
  }
  const sessionId = await ensureSessionRow(userId);
  const folder = authPathFor(userId);
  await fs.mkdir(folder, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(folder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    // Pede o histórico do aparelho (contatos, chats e mensagens) ao parear/reconectar.
    syncFullHistory: true,
    // Necessário para o WhatsApp conseguir fazer retry de mensagens. Sem isso o
    // app oficial exibe "Aguardando mensagem. Essa ação pode levar alguns instantes."
    getMessage: async (key) => {
      if (key.id) {
        const cached = msgCache.get(userId)?.get(key.id);
        if (cached) return cached;
      }
      // Fallback: proto vazio — permite ao WhatsApp processar o retry sem crash.
      return proto.Message.fromObject({});
    },
  });

  sessions.set(userId, { sock, userId, sessionId });
  await setStatus(userId, 'connecting');

  // Pairing code: deve ser solicitado logo após criar o socket, antes do registro.
  let pairingCode: string | undefined;
  if (pairingPhone && !sock.authState.creds.registered) {
    try {
      pairingCode = await sock.requestPairingCode(pairingPhone.replace(/\D/g, ''));
      emitToUser(userId, 'session.pairing.code', { code: pairingCode });
    } catch (e: any) {
      emitToUser(userId, 'error.connection', { message: `Falha no pairing: ${String(e?.message ?? e)}` });
    }
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const dataUrl = await QRCode.toDataURL(qr);
      await setStatus(userId, 'qr');
      emitToUser(userId, 'session.qr.updated', { qr: dataUrl });
    }

    if (connection === 'open') {
      const phone = sock.user?.id ? jidToPhone(sock.user.id) : undefined;
      await setStatus(userId, 'connected', phone);
      emitToUser(userId, 'session.connected', { phoneNumber: phone ?? '' });
      // Força o resync do app-state — traz os NOMES SALVOS da agenda (contact actions).
      sock
        .resyncAppState(['critical_unblock_low', 'regular_high', 'regular_low', 'regular'], false)
        .catch(() => undefined);
      // Em background: fotos de perfil + metadados de grupo (nomes/participantes).
      syncProfileInfo(userId).catch(() => undefined);
      // Resolve nomes salvos para os chats @lid (mapeia número→LID via onWhatsApp)
      // e mescla duplicados. Delay para o app-state popular os nomes primeiro.
      setTimeout(() => syncLidNames(userId).catch(() => undefined), 12000);
      // Metadados de TODOS os grupos (nomes).
      setTimeout(() => syncAllGroups(userId).catch(() => undefined), 6000);
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      sessions.delete(userId);
      dropMsgCache(userId);
      inflightSentIds.delete(userId);

      // Reconexão manual: startSession já foi chamado — apenas limpa o flag.
      if (reconnectingUsers.has(userId)) {
        reconnectingUsers.delete(userId);
        return;
      }

      // logged_out é um status PERSISTIDO próprio: ao recarregar a página, o
      // frontend sabe que o usuário removeu o aparelho pelo celular (e não uma
      // queda transitória), exibindo o aviso correto.
      await setStatus(userId, loggedOut ? 'logged_out' : 'disconnected');
      emitToUser(userId, 'session.disconnected', {
        reason: loggedOut ? 'logged_out' : 'connection_closed',
        canReconnect: !loggedOut,
      });
      if (!loggedOut) {
        // Queda transitória: tenta reconectar reaproveitando as credenciais.
        setTimeout(() => {
          startSession(userId).catch((e) =>
            emitToUser(userId, 'error.connection', { message: String(e?.message ?? e) }),
          );
        }, 2000);
      } else {
        // loggedOut: limpa credenciais para forçar novo QR.
        await fs.rm(folder, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  });

  // Sincronização de contatos (set inicial, upsert e update do app-state).
  // `name` = nome SALVO na sua agenda (vem do app-state); `pushName` = nome de perfil.
  const onContacts = async (contacts: any[]) => {
    for (const c of contacts ?? []) {
      if (!c?.id) continue;
      await upsertContact(sessionId, c);
    }
  };
  sock.ev.on('contacts.upsert', (contacts) => {
    onContacts(contacts).catch(() => undefined);
  });
  sock.ev.on('contacts.update', (updates) => {
    onContacts(updates as any).catch(() => undefined);
  });

  // Sincronização de chats (history sync e novos).
  sock.ev.on('chats.upsert', async (chats) => {
    let count = 0;
    for (const c of chats) {
      if (!c.id || isStatusBroadcast(c.id)) continue;
      await upsertChat(sessionId, c.id, c.name ?? undefined);
      count++;
    }
    if (count) emitToUser(userId, 'chats.synced', { count });
  });

  // Metadados de grupos: persiste Group + GroupParticipant.
  sock.ev.on('groups.upsert', async (groups) => {
    for (const g of groups) {
      await persistGroupMetadata(sessionId, g);
    }
  });
  sock.ev.on('groups.update', async (updates) => {
    for (const g of updates) {
      if (!g.id) continue;
      try {
        const meta = await sock.groupMetadata(g.id);
        await persistGroupMetadata(sessionId, meta);
      } catch {
        // grupo pode não estar acessível; ignora
      }
    }
  });

  // Mensagens novas e do histórico.
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const m of messages) {
      // Cacheia o proto raw antes de processar — serve retries do WhatsApp.
      if (m.key.id && m.message) cacheRawMessage(userId, m.key.id, m.message);
      await handleIncomingMessage(userId, sessionId, sock, m, type);
    }
  });

  // Sincronização de histórico em massa (entregue após parear/reconectar):
  // contatos, chats e mensagens antigas. Persiste sem incrementar não lidas
  // nem emitir message.received por item (evita "tempestade" de eventos).
  sock.ev.on('messaging-history.set', async ({ chats, contacts, messages }) => {
    for (const c of contacts ?? []) {
      await upsertContact(sessionId, c);
    }

    for (const ch of chats ?? []) {
      if (!ch.id || isStatusBroadcast(ch.id)) continue;
      const ts = ch.conversationTimestamp
        ? new Date(Number(ch.conversationTimestamp) * 1000)
        : undefined;
      const archived = typeof (ch as any).archived === 'boolean' ? (ch as any).archived : undefined;
      // Usa epoch 0 como sentinela quando o Baileys não entrega
      // conversationTimestamp — evita o @default(now()) do schema que
      // causaria todos os chats com o mesmo timestamp falso.
      // O bulk update após processar as mensagens sobrescreve com o real.
      const fallbackTs = new Date(0);
      await prisma.chat
        .upsert({
          where: { sessionId_jid: { sessionId, jid: ch.id } },
          create: {
            sessionId,
            jid: ch.id,
            name: ch.name ?? null,
            isGroup: isGroupJid(ch.id),
            unreadCount: ch.unreadCount ?? 0,
            archived: archived ?? false,
            lastMessageAt: ts ?? fallbackTs,
          },
          update: {
            ...(ch.name ? { name: ch.name } : {}),
            ...(ts ? { lastMessageAt: ts } : {}),
            ...(typeof ch.unreadCount === 'number' ? { unreadCount: ch.unreadCount } : {}),
            ...(archived !== undefined ? { archived } : {}),
          },
        })
        .catch(() => undefined);
    }

    // Persiste mensagens, coleta mapeamentos LID ↔ phone e rastreia o timestamp
    // mais recente por chat (para corrigir lastMessageAt depois do lote inteiro).
    const lidPhoneMap = new Map<string, string>(); // lid@lid → phone@s.whatsapp.net
    const chatMaxTs = new Map<string, Date>(); // chatId → max(messageTimestamp)
    for (const m of messages ?? []) {
      const result = await persistHistoryMessage(userId, sessionId, m).catch(() => null);
      if (result) {
        const prev = chatMaxTs.get(result.chatId);
        if (!prev || prev < result.ts) chatMaxTs.set(result.chatId, result.ts);
      }
      const rj = m.key?.remoteJid;
      if (rj && !isGroupJid(rj)) {
        const senderPn = (m.key as any).senderPn as string | undefined;
        const senderLid = (m.key as any).senderLid as string | undefined;
        if (senderPn && senderLid) lidPhoneMap.set(senderLid, senderPn);
        // remoteJid em si pode ser um dos dois lados do par
        if (rj.endsWith('@lid') && senderPn) lidPhoneMap.set(rj, senderPn);
        else if (rj.endsWith('@s.whatsapp.net') && senderLid) lidPhoneMap.set(senderLid, rj);
      }
    }

    // Corrige lastMessageAt de cada chat afetado com o MAX timestamp real no BD.
    // Usa findFirst em vez do chatMaxTs (batch) para também incluir mensagens
    // anteriores ao lote atual e sobrescrever timestamps falsos (@default(now())).
    for (const chatId of chatMaxTs.keys()) {
      const latest = await prisma.message.findFirst({
        where: { chatId },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      });
      if (latest?.timestamp) {
        await prisma.chat
          .update({ where: { id: chatId }, data: { lastMessageAt: latest.timestamp } })
          .catch(() => undefined);
      }
    }

    // Mescla todos os pares LID × phone detectados neste lote de histórico —
    // elimina os chats duplicados (um para @lid, outro para @s.whatsapp.net).
    for (const [lid, pn] of lidPhoneMap) {
      await mergeChats(sessionId, pn, lid).catch(() => undefined);
    }

    // Segunda passagem: mescla @lid chats que já têm um @s.whatsapp.net par no BD
    // (criados agora ou em sync anterior) usando o nome/pushName do contato como
    // chave — cobre o caso em que senderPn não veio nos keys das mensagens.
    const lidChatJids = (chats ?? []).map((ch) => ch.id).filter((id) => id?.endsWith('@lid'));
    for (const lidJid of lidChatJids) {
      if (lidPhoneMap.has(lidJid)) continue; // já foi resolvido via lidPhoneMap
      const lidContact = await prisma.contact.findUnique({
        where: { sessionId_jid: { sessionId, jid: lidJid } },
        select: { name: true, pushName: true },
      });
      const searchName = lidContact?.name ?? lidContact?.pushName;
      if (!searchName) continue;
      const phoneContact = await prisma.contact.findFirst({
        where: {
          sessionId,
          jid: { endsWith: '@s.whatsapp.net' },
          OR: [{ name: searchName }, { pushName: searchName }],
        },
        select: { jid: true },
      });
      if (phoneContact) await mergeChats(sessionId, phoneContact.jid, lidJid).catch(() => undefined);
    }

    // history.synced → UI mostra indicador "Sincronizando..." apenas para histórico.
    // chats.synced → refreshes silenciosos da lista (fotos, grupos, lids).
    emitToUser(userId, 'history.synced', { count: (chats ?? []).length });
    emitToUser(userId, 'chats.synced', { count: (chats ?? []).length });
  });

  // Presença (digitando / gravando / online / visto por último) — emite para o app.
  sock.ev.on('presence.update', async ({ id, presences }) => {
    if (!id) return;
    const chat = await prisma.chat.findUnique({ where: { sessionId_jid: { sessionId, jid: id } } });
    if (!chat) return;
    const entries = Object.values(presences ?? {}) as any[];
    const states = entries.map((p) => p?.lastKnownPresence);
    const typing = states.includes('composing');
    const recording = states.includes('recording');
    const online = states.includes('available');
    // visto por último: maior timestamp (segundos) entre as presenças
    const lastSeen =
      entries.map((p) => p?.lastSeen as number | undefined).filter(Boolean).sort().pop() ?? null;
    emitToUser(userId, 'presence.updated', { chatId: chat.id, typing, recording, online, lastSeen });
  });

  // Atualização de chats (arquivar/trancar etc.) — mantém em sincronia com o WhatsApp.
  sock.ev.on('chats.update', async (updates) => {
    for (const u of updates as any[]) {
      if (!u.id) continue;
      const data: { archived?: boolean; locked?: boolean } = {};
      if (typeof u.archived === 'boolean') data.archived = u.archived;
      // `locked` vem do nosso patch no Baileys (WhatsApp "Chat Lock" via app-state).
      if (typeof u.locked === 'boolean') data.locked = u.locked;
      if (Object.keys(data).length === 0) continue;
      await prisma.chat.updateMany({ where: { sessionId, jid: u.id }, data }).catch(() => undefined);
      const chat = await prisma.chat.findUnique({ where: { sessionId_jid: { sessionId, jid: u.id } } });
      if (chat) emitToUser(userId, 'chat.updated', { chat });
    }
  });

  // Atualização de status (ack: enviado/entregue/lida) — via messages.update.
  sock.ev.on('messages.update', async (updates) => {
    for (const u of updates) {
      const waId = u.key?.id;
      if (!waId) continue;
      const ackStatus = mapAck(u.update?.status);
      if (!ackStatus) continue;
      await applyStatus(userId, waId, ackStatus);
    }
  });

  // Recibos de ENTREGA e LEITURA (✓✓ e azul) — vêm por message-receipt.update.
  sock.ev.on('message-receipt.update', async (updates) => {
    for (const u of updates as any[]) {
      const waId = u.key?.id;
      if (!waId) continue;
      const r = u.receipt ?? {};
      const status = r.readTimestamp
        ? 'read'
        : r.playedTimestamp
          ? 'read'
          : r.receiptTimestamp || r.deliveredDeviceJid
            ? 'delivered'
            : null;
      if (!status) continue;
      await applyStatus(userId, waId, status);
    }
  });

  // Reações (emoji) a mensagens — adiciona/remove e emite para a UI.
  sock.ev.on('messages.reaction', async (items) => {
    for (const { key, reaction } of items as any[]) {
      const waId = key?.id;
      if (!waId) continue;
      const msg = await prisma.message.findFirst({
        where: { waMessageId: waId, chat: { sessionId } },
        select: { id: true, chatId: true, reactions: true },
      });
      if (!msg) continue;
      const fromMe = !!reaction?.key?.fromMe;
      // A minha própria reação volta como eco aqui (fromMe) com um jid de chat —
      // normaliza para 'me' (mesma chave do sendReaction) p/ não duplicar a contagem.
      const reactorJid = fromMe
        ? 'me'
        : reaction?.key?.participant || key?.participant || key?.remoteJid || 'unknown';
      const emoji: string = reaction?.text || ''; // vazio = reação removida
      let list: Array<{ jid: string; emoji: string; fromMe: boolean }> = [];
      try {
        list = msg.reactions ? JSON.parse(msg.reactions) : [];
      } catch {
        list = [];
      }
      // uma reação por pessoa: remove a anterior e adiciona a nova (se houver).
      list = list.filter((r) => r.jid !== reactorJid);
      if (emoji) list.push({ jid: reactorJid, emoji, fromMe });
      await prisma.message
        .update({ where: { id: msg.id }, data: { reactions: list.length ? JSON.stringify(list) : null } })
        .catch(() => undefined);
      emitToUser(userId, 'message.reaction.updated', {
        messageId: msg.id,
        chatId: msg.chatId,
        reactions: list,
      });
    }
  });

  return { status: 'connecting', pairingCode };
}

// Persiste (upsert) metadados de um grupo e seus participantes.
async function persistGroupMetadata(sessionId: string, meta: any): Promise<void> {
  if (!meta?.id) return;
  const group = await prisma.group.upsert({
    where: { sessionId_jid: { sessionId, jid: meta.id } },
    create: {
      sessionId,
      jid: meta.id,
      subject: meta.subject ?? null,
      description: meta.desc ?? null,
      ownerJid: meta.owner ?? null,
    },
    update: {
      subject: meta.subject ?? undefined,
      description: meta.desc ?? undefined,
      ownerJid: meta.owner ?? undefined,
    },
  });
  // Reconcilia participantes: remove os antigos e recria a lista atual.
  await prisma.groupParticipant.deleteMany({ where: { groupId: group.id } });
  const participants = (meta.participants ?? []) as Array<{ id: string; admin?: string | null }>;
  for (const p of participants) {
    if (!p.id) continue;
    await prisma.groupParticipant.create({
      data: { groupId: group.id, jid: p.id, isAdmin: !!p.admin },
    });
  }
  // Mantém o nome do chat do grupo em dia.
  if (meta.subject) {
    await upsertChat(sessionId, meta.id, meta.subject);
  }
}

// Sweep em background após conectar: busca foto de perfil de cada chat e,
// para grupos, os metadados (subject + participantes). Throttled p/ não tomar
// rate-limit. Emite chats.synced periodicamente para a UI atualizar aos poucos.
async function syncProfileInfo(userId: string): Promise<void> {
  const session = sessions.get(userId);
  if (!session) return;
  const { sock, sessionId } = session;
  const chats = await prisma.chat.findMany({
    where: { sessionId },
    orderBy: { lastMessageAt: 'desc' },
    take: 1200, // cobre todos os chats (com throttle) — inclui trancadas/arquivadas
  });

  let processed = 0;
  for (const c of chats) {
    if (!sessions.has(userId)) return; // sessão caiu durante o sweep
    if (c.isGroup) {
      try {
        const meta = await sock.groupMetadata(c.jid);
        await persistGroupMetadata(sessionId, meta);
      } catch {
        // grupo indisponível
      }
    }
    // Canais (newsletters): busca nome via newsletterMetadata (formato cru →
    // o nome vem em thread_metadata.name.text) e foto via profilePictureUrl.
    if (c.jid.endsWith('@newsletter')) {
      try {
        // O parseNewsletterMetadata do Baileys devolve o objeto CRU: o nome vem
        // em thread_metadata.name.text (não em meta.name).
        const meta = await (sock as any).newsletterMetadata('jid', c.jid);
        const name =
          meta?.name ??
          meta?.thread_metadata?.name?.text ??
          (typeof meta?.thread_metadata?.name === 'string' ? meta.thread_metadata.name : undefined);
        if (name && typeof name === 'string') {
          await prisma.chat.update({ where: { id: c.id }, data: { name } });
        }
      } catch {
        // canal indisponível / sem permissão de metadata
      }
      // Foto: profilePictureUrl funciona para canais também.
      try {
        const url = await sock.profilePictureUrl(c.jid, 'image');
        if (url) await prisma.chat.update({ where: { id: c.id }, data: { avatarUrl: url } });
      } catch {
        // sem foto / privacidade
      }
      processed++;
      if (processed % 40 === 0) emitToUser(userId, 'chats.synced', { count: processed });
      await new Promise((r) => setTimeout(r, 120));
      continue;
    }
    try {
      const url = await sock.profilePictureUrl(c.jid, 'image');
      if (url) {
        await prisma.chat.update({ where: { id: c.id }, data: { avatarUrl: url } });
      }
    } catch {
      // sem foto / privacidade — ignora
    }
    processed++;
    if (processed % 40 === 0) emitToUser(userId, 'chats.synced', { count: processed });
    await new Promise((r) => setTimeout(r, 120));
  }
  emitToUser(userId, 'chats.synced', { count: processed });
}

// Busca a foto de perfil de um contato específico imediatamente (sem delay).
// Usada quando um novo contato envia a primeira mensagem — sem aguardar o sweep.
async function fetchAvatarForContact(
  userId: string,
  sessionId: string,
  jid: string,
  chatId: string,
): Promise<void> {
  const session = sessions.get(userId);
  if (!session) return;
  try {
    const url = await session.sock.profilePictureUrl(jid, 'image');
    if (url) {
      const updated = await prisma.chat.update({ where: { id: chatId }, data: { avatarUrl: url } });
      emitToUser(userId, 'chat.updated', { chat: updated });
    }
  } catch {
    // sem foto / privacidade — ignora
  }
}

// Busca metadados ao vivo de um grupo e persiste (usado ao abrir os detalhes).
export async function syncGroupMetadata(userId: string, jid: string): Promise<void> {
  const session = sessions.get(userId);
  if (!session) return;
  try {
    const meta = await session.sock.groupMetadata(jid);
    await persistGroupMetadata(session.sessionId, meta);
  } catch {
    // grupo indisponível; mantém o que já houver no banco
  }
}

function mapAck(status: number | undefined | null): string | null {
  // proto.WebMessageInfo.Status: 2=SERVER_ACK(sent), 3=DELIVERY_ACK(delivered), 4=READ, 5=PLAYED
  switch (status) {
    case 2:
      return 'sent';
    case 3:
      return 'delivered';
    case 4:
    case 5:
      return 'read';
    default:
      return null;
  }
}

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  error: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

// Aplica um novo status à(s) mensagem(ns) enviada(s) com aquele waMessageId,
// sem nunca REBAIXAR (read não volta para delivered).
async function applyStatus(userId: string, waMessageId: string, status: string) {
  const msgs = await prisma.message.findMany({ where: { waMessageId, fromMe: true } });
  for (const msg of msgs) {
    if ((STATUS_RANK[status] ?? 0) <= (STATUS_RANK[msg.status] ?? 0)) continue;
    await prisma.message.update({ where: { id: msg.id }, data: { status } });
    emitToUser(userId, 'message.status.updated', { messageId: msg.id, status });
  }
}

// Upsert de contato. `name` (nome salvo na agenda, via app-state) só é gravado
// quando presente — nunca sobrescreve um nome salvo com o pushName.
async function upsertContact(
  sessionId: string,
  c: { id?: string | null; lid?: string | null; jid?: string | null; name?: string | null; notify?: string | null },
) {
  // Grava o nome SALVO em todas as formas conhecidas (id, lid, número) — assim o
  // mesmo contato resolve tanto no chat @lid quanto no @s.whatsapp.net.
  const targets = new Set<string>();
  for (const j of [c.id, c.lid, c.jid]) if (j) targets.add(j);
  for (const jid of targets) {
    await prisma.contact
      .upsert({
        where: { sessionId_jid: { sessionId, jid } },
        create: { sessionId, jid, name: c.name ?? null, pushName: c.notify ?? null },
        update: { name: c.name ?? undefined, pushName: c.notify ?? undefined },
      })
      .catch(() => undefined);
  }
  // Se o contato chega com as DUAS formas (phone + LID), mescla os chats
  // imediatamente — evita duplicatas ao receber a primeira mensagem pós-sync.
  const phoneJid = [c.id, c.jid].find((j): j is string => typeof j === 'string' && j.endsWith('@s.whatsapp.net'));
  const lidJid = [c.id, c.lid, c.jid].find((j): j is string => typeof j === 'string' && j.endsWith('@lid'));
  if (phoneJid && lidJid) {
    await mergeChats(sessionId, phoneJid, lidJid).catch(() => undefined);
  }
}

// Mescla dois chats da MESMA pessoa (número e LID) em um só: move as mensagens
// para o chat com mais histórico e remove o duplicado. Idempotente.
async function mergeChats(sessionId: string, jidA: string, jidB: string) {
  const a = await prisma.chat.findUnique({ where: { sessionId_jid: { sessionId, jid: jidA } } });
  const b = await prisma.chat.findUnique({ where: { sessionId_jid: { sessionId, jid: jidB } } });
  if (!a || !b || a.id === b.id) return;
  const [ca, cb] = await Promise.all([
    prisma.message.count({ where: { chatId: a.id } }),
    prisma.message.count({ where: { chatId: b.id } }),
  ]);
  const keep = ca >= cb ? a : b;
  const drop = keep.id === a.id ? b : a;
  const msgs = await prisma.message.findMany({ where: { chatId: drop.id } });
  for (const m of msgs) {
    if (m.waMessageId) {
      const dup = await prisma.message.findFirst({
        where: { chatId: keep.id, waMessageId: m.waMessageId },
      });
      if (dup) {
        await prisma.message.delete({ where: { id: m.id } }).catch(() => undefined);
        continue;
      }
    }
    await prisma.message.update({ where: { id: m.id }, data: { chatId: keep.id } }).catch(() => undefined);
  }
  const newest = await prisma.message.findFirst({
    where: { chatId: keep.id },
    orderBy: { timestamp: 'desc' },
  });
  await prisma.chat
    .update({
      where: { id: keep.id },
      data: {
        unreadCount: keep.unreadCount + drop.unreadCount,
        ...(newest ? { lastMessageAt: newest.timestamp } : {}),
      },
    })
    .catch(() => undefined);
  await prisma.chat.delete({ where: { id: drop.id } }).catch(() => undefined);
}

// Varredura: metadados (assunto/participantes) de TODOS os grupos — garante que
// grupos como 1203...@g.us mostrem o nome (ex.: "Moradores Lume").
async function syncAllGroups(userId: string): Promise<void> {
  const session = sessions.get(userId);
  if (!session) return;
  const groups = await prisma.chat.findMany({
    where: { sessionId: session.sessionId, isGroup: true },
  });
  for (const g of groups) {
    if (!sessions.has(userId)) return;
    try {
      const meta = await session.sock.groupMetadata(g.jid);
      await persistGroupMetadata(session.sessionId, meta);
    } catch {
      // grupo indisponível
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (groups.length) emitToUser(userId, 'chats.synced', { count: groups.length });
}

// Sweep: para cada contato/chat com número @s.whatsapp.net, descobre o LID
// correspondente via onWhatsApp (USync), copia o nome salvo e mescla os chats
// duplicados (número × LID). Inclui chats sem contato salvo (Ana Paula amor,
// Mavsa etc. que só têm pushName) para não deixar duplicatas na lista.
async function syncLidNames(userId: string): Promise<void> {
  const session = sessions.get(userId);
  if (!session) return;
  const { sock, sessionId } = session;
  const named = await prisma.contact.findMany({
    where: { sessionId, jid: { endsWith: '@s.whatsapp.net' }, NOT: { name: null } },
  });
  const nameByPn = new Map(named.map((c) => [c.jid, c.name as string]));

  // Inclui TODOS os chats @s.whatsapp.net (com ou sem contato salvo) para
  // detectar e mesclar duplicatas mesmo quando não há nome na agenda.
  const chatJids = await prisma.chat.findMany({
    where: { sessionId, jid: { endsWith: '@s.whatsapp.net' } },
    select: { jid: true },
  });
  const phones = [...new Set([...named.map((c) => c.jid), ...chatJids.map((c) => c.jid)])];
  const batch = 40;
  let updated = 0;
  for (let i = 0; i < phones.length; i += batch) {
    if (!sessions.has(userId)) return;
    const slice = phones.slice(i, i + batch);
    try {
      const results = (await sock.onWhatsApp(...slice)) ?? [];
      for (const r of results) {
        const pn = (r as any).jid as string | undefined;
        const lid = (r as any).lid as string | undefined;
        const name = pn ? nameByPn.get(pn) : undefined;
        if (lid && name) {
          await prisma.contact
            .upsert({
              where: { sessionId_jid: { sessionId, jid: lid } },
              create: { sessionId, jid: lid, name },
              update: { name },
            })
            .catch(() => undefined);
          updated++;
        }
        // Mescla os chats duplicados (número × LID) da mesma pessoa.
        if (pn && lid) {
          await mergeChats(sessionId, pn, lid).catch(() => undefined);
        }
      }
    } catch {
      // segue para o próximo lote
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (updated) emitToUser(userId, 'chats.synced', { count: updated });
}

async function upsertChat(sessionId: string, jid: string, name?: string) {
  return prisma.chat.upsert({
    where: { sessionId_jid: { sessionId, jid } },
    create: { sessionId, jid, name: name ?? null, isGroup: isGroupJid(jid) },
    update: { ...(name ? { name } : {}) },
  });
}

// Upsert do chat reconciliando o identificador duplo (LID × número): se a mesma
// pessoa já tem um chat na OUTRA forma, mescla na hora (mantém o de maior
// histórico) e retorna o sobrevivente — evita conversa duplicada ao receber.
async function upsertChatReconciled(sessionId: string, jid: string, otherJid?: string) {
  await upsertChat(sessionId, jid);

  // Fallback: se @lid sem senderPn, tenta encontrar o @s.whatsapp.net pelo pushName
  // gravado no Contact (que foi upsertado pela step anterior em handleIncomingMessage).
  let resolvedOther = otherJid;
  if (!resolvedOther && jid.endsWith('@lid') && !isGroupJid(jid)) {
    const lidContact = await prisma.contact.findUnique({
      where: { sessionId_jid: { sessionId, jid } },
      select: { pushName: true, name: true },
    });
    const searchName = lidContact?.name ?? lidContact?.pushName;
    if (searchName) {
      const matched = await prisma.contact.findFirst({
        where: {
          sessionId,
          jid: { endsWith: '@s.whatsapp.net' },
          OR: [{ name: searchName }, { pushName: searchName }],
        },
        select: { jid: true },
      });
      if (matched) resolvedOther = matched.jid;
    }
  }

  if (resolvedOther && resolvedOther !== jid && !isGroupJid(jid)) {
    const other = await prisma.chat.findUnique({
      where: { sessionId_jid: { sessionId, jid: resolvedOther } },
    });
    if (other) {
      await mergeChats(sessionId, jid, resolvedOther).catch(() => undefined);
      const survivor = await prisma.chat.findFirst({
        where: { sessionId, jid: { in: [jid, resolvedOther] } },
      });
      if (survivor) return survivor;
    }
  }
  return prisma.chat.findUnique({ where: { sessionId_jid: { sessionId, jid } } });
}

// Desembrulha mensagens "envelopadas" (temporárias/uma-vez/editadas/etc.) até o
// conteúdo real, para não perder o texto.
function unwrapMessage(msg: proto.IMessage | null | undefined): proto.IMessage | null | undefined {
  let m = msg;
  for (let i = 0; i < 5 && m; i++) {
    const inner =
      m.ephemeralMessage?.message ??
      m.viewOnceMessage?.message ??
      (m as any).viewOnceMessageV2?.message ??
      (m as any).viewOnceMessageV2Extension?.message ??
      (m as any).documentWithCaptionMessage?.message ??
      m.deviceSentMessage?.message ??
      (m as any).editedMessage?.message ??
      null;
    if (!inner) break;
    m = inner;
  }
  return m;
}

// Extrai o conteúdo exibível. Retorna null para mensagens NÃO exibíveis
// (protocolo/sistema, reações, enquetes vazias, etc.) — que não viram bolha.
function extractContent(
  message: proto.IMessage | null | undefined,
): { type: MessageType; text?: string } | null {
  const msg = unwrapMessage(message);
  if (!msg) return null;
  if (msg.conversation) return { type: 'text', text: msg.conversation };
  if (msg.extendedTextMessage?.text)
    return { type: 'text', text: msg.extendedTextMessage.text };
  if (msg.imageMessage) return { type: 'image', text: msg.imageMessage.caption ?? undefined };
  if (msg.videoMessage) return { type: 'video', text: msg.videoMessage.caption ?? undefined };
  if (msg.audioMessage) return { type: 'audio' };
  if (msg.documentMessage)
    return { type: 'document', text: msg.documentMessage.fileName ?? undefined };
  // protocolMessage, reactionMessage, pollUpdate, senderKeyDistribution, etc. → não exibível.
  return null;
}

// Extrai as chaves de mídia (para download sob demanda) do conteúdo desembrulhado.
function extractMediaInfo(message: proto.IMessage | null | undefined): {
  mimeType?: string;
  fileName?: string;
  mediaKey?: string;
  directPath?: string;
  url?: string;
} | null {
  const msg = unwrapMessage(message);
  const node: any =
    msg?.imageMessage ?? msg?.videoMessage ?? msg?.audioMessage ?? msg?.documentMessage ?? null;
  if (!node) return null;
  return {
    mimeType: node.mimetype ?? undefined,
    fileName: node.fileName ?? undefined,
    mediaKey: node.mediaKey ? Buffer.from(node.mediaKey).toString('base64') : undefined,
    directPath: node.directPath ?? undefined,
    url: node.url ?? undefined,
  };
}

// Extrai o WA message ID da mensagem citada (contextInfo.stanzaId) de qualquer tipo de mensagem.
function extractQuotedWaId(message: proto.IMessage | null | undefined): string | null {
  const msg = unwrapMessage(message);
  if (!msg) return null;
  const ctx =
    (msg as any).extendedTextMessage?.contextInfo ??
    (msg as any).imageMessage?.contextInfo ??
    (msg as any).videoMessage?.contextInfo ??
    (msg as any).audioMessage?.contextInfo ??
    (msg as any).documentMessage?.contextInfo ??
    null;
  return (ctx?.stanzaId as string | undefined) ?? null;
}

// Cria/atualiza a Media row de uma mensagem (sem baixar — download sob demanda em GET /media/:id).
async function upsertMediaRow(
  messageId: string,
  type: MessageType,
  message: proto.IMessage | null | undefined,
) {
  const info = extractMediaInfo(message);
  await prisma.media
    .upsert({
      where: { messageId },
      create: {
        messageId,
        type,
        mimeType: info?.mimeType ?? null,
        fileName: info?.fileName ?? null,
        mediaKey: info?.mediaKey ?? null,
        directPath: info?.directPath ?? null,
        url: info?.url ?? null,
        downloaded: false,
      },
      update: {
        type,
        mimeType: info?.mimeType ?? undefined,
        fileName: info?.fileName ?? undefined,
        mediaKey: info?.mediaKey ?? undefined,
        directPath: info?.directPath ?? undefined,
        url: info?.url ?? undefined,
      },
    })
    .catch(() => undefined);
}

async function handleIncomingMessage(
  userId: string,
  sessionId: string,
  sock: WASocket,
  m: WAMessage,
  upsertType: string,
) {
  const remoteJid = m.key.remoteJid;
  if (!remoteJid || isStatusBroadcast(remoteJid)) return;
  const content = extractContent(m.message);
  if (!content) return; // mensagem de sistema/protocolo: não exibe
  const { type, text } = content;
  const waId = m.key.id ?? undefined;
  const fromMe = !!m.key.fromMe;
  const senderJid = m.key.participant ?? remoteJid;
  const ts = m.messageTimestamp
    ? new Date(Number(m.messageTimestamp) * 1000)
    : new Date();

  // Captura o pushName (nome que o contato definiu no WhatsApp) do remetente.
  if (!fromMe && m.pushName) {
    await prisma.contact
      .upsert({
        where: { sessionId_jid: { sessionId, jid: senderJid } },
        create: { sessionId, jid: senderJid, pushName: m.pushName, name: null },
        update: { pushName: m.pushName },
      })
      .catch(() => undefined);
  }

  // 1) Garante o chat (reconciliando LID×número via a outra forma na chave) e
  //    persiste a mensagem ANTES de emitir (RN03).
  const otherJid = isGroupJid(remoteJid)
    ? undefined
    : remoteJid.endsWith('@lid')
      ? ((m.key as any).senderPn as string | undefined)
      : ((m.key as any).senderLid as string | undefined);
  const chat = (await upsertChatReconciled(sessionId, remoteJid, otherJid))!;

  // Foto ainda não carregada para este contato? Busca imediatamente (fire-and-forget),
  // sem bloquear o fluxo nem aguardar o sweep em background.
  if (!chat.avatarUrl && !isGroupJid(remoteJid)) {
    fetchAvatarForContact(userId, sessionId, remoteJid, chat.id).catch(() => undefined);
  }

  // Evita duplicar mensagens:
  // (a) echo de mensagem própria enviada pelo ZapBridge ainda sendo persistida
  // (b) mesmo waMessageId chegando duas vezes por JIDs diferentes (LID × phone)
  if (waId) {
    if (inflightSentIds.get(userId)?.has(waId)) return;
    const dup = await prisma.message.findFirst({
      where: { waMessageId: waId, chat: { sessionId } },
    });
    if (dup) return;
  }

  const quotedWaId = extractQuotedWaId(m.message);

  const message = await prisma.message.create({
    data: {
      chatId: chat.id,
      waMessageId: waId,
      fromMe,
      senderJid,
      type,
      text: text ?? null,
      status: fromMe ? 'sent' : 'delivered',
      timestamp: ts,
      quotedMessageId: quotedWaId,
    },
  });

  // 2) Mídia: registra as chaves; o arquivo é baixado sob demanda em GET /media/:id.
  if (type !== 'text') {
    await upsertMediaRow(message.id, type, m.message);
  }

  // 3) Atualiza o chat (prévia, horário, não lidas) e emite eventos.
  const updatedChat = await prisma.chat.update({
    where: { id: chat.id },
    data: {
      lastMessageId: message.id,
      lastMessageAt: ts,
      unreadCount: fromMe ? 0 : { increment: 1 },
    },
  });

  if (upsertType === 'notify' && !fromMe) {
    // Em grupos inclui o nome do remetente diretamente do pushName (já upsertado acima).
    const senderName = isGroupJid(remoteJid) ? (m.pushName ?? senderJid.split('@')[0]) : null;

    // Resolve o bloco quoted para emitir junto (lookup rápido — mensagem já está no DB).
    let quotedEmit: { text: string | null; type: string; senderName: string | null } | null = null;
    if (quotedWaId) {
      const qMsg = await prisma.message
        .findFirst({
          where: { chatId: chat.id, waMessageId: quotedWaId },
          select: { text: true, type: true, senderJid: true, fromMe: true },
        })
        .catch(() => null);
      if (qMsg) {
        let qSenderName: string | null = qMsg.fromMe ? 'Você' : qMsg.senderJid.split('@')[0];
        if (!qMsg.fromMe && isGroupJid(remoteJid)) {
          const qContact = await prisma.contact
            .findUnique({
              where: { sessionId_jid: { sessionId, jid: qMsg.senderJid } },
              select: { name: true, pushName: true },
            })
            .catch(() => null);
          qSenderName = qContact?.name ?? qContact?.pushName ?? qSenderName;
        }
        quotedEmit = { text: qMsg.text, type: qMsg.type, senderName: qSenderName };
      }
    }

    emitToUser(userId, 'message.received', {
      chatId: chat.id,
      message: { ...message, senderName, quoted: quotedEmit },
    });
    // Notificação push (best-effort) para mensagens recebidas.
    notifyUser(userId, updatedChat.name ?? remoteJid, previewFor(type, text), chat.id).catch(
      () => undefined,
    );
  }
  emitToUser(userId, 'chat.updated', { chat: updatedChat });

  // IA (opt-in, fail-soft): indexa + sugere resposta / auto-responde se aplicável.
  onIncomingMessage({
    userId,
    sessionId,
    chatId: chat.id,
    chatJid: chat.jid,
    isGroup: isGroupJid(remoteJid),
    isLocked: !!updatedChat.locked,
    messageId: message.id,
    text: message.text,
    fromMe,
    ts,
    notify: upsertType === 'notify',
  }).catch(() => undefined);
}

function previewFor(type: MessageType, text?: string): string {
  if (type === 'text') return text ?? '';
  const labels: Record<string, string> = {
    image: '📷 Imagem',
    video: '🎬 Vídeo',
    audio: '🎤 Áudio',
    document: '📄 Documento',
  };
  return labels[type] ?? 'Nova mensagem';
}

async function notifyUser(userId: string, title: string, body: string, chatId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.pushToken) return;
  await sendPush(user.pushToken, { title, body, data: { chatId } });
}

// Persiste uma mensagem do histórico (sem unread, sem push, sem emitir evento).
// Mídia antiga fica como placeholder (sem baixar, para não gerar enxurrada de downloads).
// Retorna { chatId, ts } para o caller atualizar lastMessageAt em bulk.
async function persistHistoryMessage(
  userId: string,
  sessionId: string,
  m: WAMessage,
): Promise<{ chatId: string; ts: Date } | null> {
  const remoteJid = m.key?.remoteJid;
  if (!remoteJid || isStatusBroadcast(remoteJid)) return null;
  const content = extractContent(m.message);
  if (!content) return null; // mensagem de sistema/protocolo: não persiste
  const { type, text } = content;
  const waId = m.key.id ?? undefined;
  const fromMe = !!m.key.fromMe;
  const senderJid = m.key.participant ?? remoteJid;
  const ts = m.messageTimestamp ? new Date(Number(m.messageTimestamp) * 1000) : new Date();

  // Hot path: upsertChat simples (1 query). O merge LID × phone é feito em bulk
  // pelo caller (messaging-history.set) depois de processar todo o lote.
  const chat = await upsertChat(sessionId, remoteJid);
  if (!fromMe && m.pushName) {
    await prisma.contact
      .upsert({
        where: { sessionId_jid: { sessionId, jid: senderJid } },
        create: { sessionId, jid: senderJid, pushName: m.pushName, name: null },
        update: { pushName: m.pushName },
      })
      .catch(() => undefined);
  }
  if (waId) {
    // Dedup rápido por chatId (indexado). O merge de pós-processamento garante
    // que chats LID × phone sejam fundidos antes do próximo fetch.
    const dup = await prisma.message.findFirst({
      where: { chatId: chat.id, waMessageId: waId },
    });
    if (dup) {
      // Backfill: se a mensagem já existia sem texto e agora extraímos, atualiza.
      if (!dup.text && text) {
        await prisma.message
          .update({ where: { id: dup.id }, data: { text, type } })
          .catch(() => undefined);
      }
      // Backfill das chaves de mídia (mensagens antigas não tinham Media row).
      if (type !== 'text') {
        await upsertMediaRow(dup.id, type, m.message);
      }
      // Status autoritativo do histórico: corrige marcações erradas de mensagens
      // próprias (ex.: 'read' que na verdade só foi entregue).
      if (fromMe) {
        const real = mapAck(m.status as number | null | undefined);
        if (real && real !== dup.status) {
          await prisma.message.update({ where: { id: dup.id }, data: { status: real } }).catch(() => undefined);
          emitToUser(userId, 'message.status.updated', { messageId: dup.id, status: real });
        }
      }
      return { chatId: chat.id, ts };
    }
  }
  const created = await prisma.message.create({
    data: {
      chatId: chat.id,
      waMessageId: waId,
      fromMe,
      senderJid,
      type,
      text: text ?? null,
      // Status real do histórico (m.status); 'sent' como fallback conservador.
      // NUNCA assumir 'read' — uma mensagem enviada pode só ter sido entregue.
      status: fromMe ? (mapAck(m.status as number | null | undefined) ?? 'sent') : 'delivered',
      timestamp: ts,
      quotedMessageId: extractQuotedWaId(m.message),
    },
  });
  if (type !== 'text') {
    await upsertMediaRow(created.id, type, m.message);
  }
  // IA (backfill): só indexa o histórico (sem sugerir). Pula conversas trancadas.
  onHistoryMessage({ userId, chatJid: chat.jid, messageId: created.id, text: created.text, fromMe, ts, isLocked: !!(chat as any).locked });
  return { chatId: chat.id, ts };
}

// Envia uma mensagem de texto e concilia o registro otimista (created pelo controller).
export async function sendText(
  userId: string,
  chatJid: string,
  text: string,
  localMessageId: string,
  quotedWaId?: string,
) {
  const session = sessions.get(userId);
  if (!session) throw Object.assign(new Error('Sessão não conectada'), { status: 403 });

  try {
    const quoted = quotedWaId
      ? ({ key: { id: quotedWaId, remoteJid: chatJid }, message: {} } as WAMessage)
      : undefined;
    const sent = await session.sock.sendMessage(chatJid, { text }, quoted ? { quoted } : undefined);
    // Cacheia o proto para servir retries do WhatsApp (evita "Aguardando mensagem").
    if (sent?.key?.id && sent.message) cacheRawMessage(userId, sent.key.id, sent.message);
    // Marca como "em voo" para que o echo do messages.upsert não crie duplicata.
    if (sent?.key?.id) {
      if (!inflightSentIds.has(userId)) inflightSentIds.set(userId, new Set());
      inflightSentIds.get(userId)!.add(sent.key.id);
    }
    const updated = await prisma.message.update({
      where: { id: localMessageId },
      data: { status: 'sent', waMessageId: sent?.key?.id ?? undefined },
    });
    if (sent?.key?.id) inflightSentIds.get(userId)?.delete(sent.key.id);
    emitToUser(userId, 'message.sent', { message: updated });
    return updated;
  } catch (e: any) {
    await prisma.message.update({ where: { id: localMessageId }, data: { status: 'error' } });
    emitToUser(userId, 'error.message', { messageId: localMessageId, reason: String(e?.message ?? e) });
    throw Object.assign(new Error('Falha ao enviar mensagem'), { status: 502 });
  }
}

// Envia mídia (arquivo já salvo localmente pelo controller).
export async function sendMedia(
  userId: string,
  chatJid: string,
  type: MessageType,
  filePath: string,
  mimeType: string,
  caption: string | undefined,
  localMessageId: string,
) {
  const session = sessions.get(userId);
  if (!session) throw Object.assign(new Error('Sessão não conectada'), { status: 403 });

  const buffer = await fs.readFile(filePath);
  let content: any;
  if (type === 'image') content = { image: buffer, caption };
  else if (type === 'video') content = { video: buffer, caption };
  else if (type === 'audio') content = { audio: buffer, mimetype: mimeType };
  else content = { document: buffer, mimetype: mimeType, fileName: path.basename(filePath) };

  try {
    const sent = await session.sock.sendMessage(chatJid, content);
    // Cacheia o proto para servir retries do WhatsApp (evita "Aguardando mensagem").
    if (sent?.key?.id && sent.message) cacheRawMessage(userId, sent.key.id, sent.message);
    if (sent?.key?.id) {
      if (!inflightSentIds.has(userId)) inflightSentIds.set(userId, new Set());
      inflightSentIds.get(userId)!.add(sent.key.id);
    }
    const updated = await prisma.message.update({
      where: { id: localMessageId },
      data: { status: 'sent', waMessageId: sent?.key?.id ?? undefined },
      include: { media: true }, // inclui a mídia p/ o app renderizar o preview
    });
    if (sent?.key?.id) inflightSentIds.get(userId)?.delete(sent.key.id);
    emitToUser(userId, 'message.sent', { message: updated });
    return updated;
  } catch (e: any) {
    await prisma.message.update({ where: { id: localMessageId }, data: { status: 'error' } });
    emitToUser(userId, 'error.message', { messageId: localMessageId, reason: String(e?.message ?? e) });
    throw Object.assign(new Error('Falha ao enviar mídia'), { status: 502 });
  }
}

// Pede ao WhatsApp mais histórico (mensagens mais antigas) de um chat — on-demand
// history sync. As mensagens chegam via messaging-history.set e são persistidas.
export async function fetchOlderHistory(userId: string, chatJid: string): Promise<boolean> {
  const session = sessions.get(userId);
  if (!session) throw Object.assign(new Error('Sessão não conectada'), { status: 403 });
  const chat = await prisma.chat.findUnique({
    where: { sessionId_jid: { sessionId: session.sessionId, jid: chatJid } },
  });
  if (!chat) return false;
  const oldest = await prisma.message.findFirst({
    where: { chatId: chat.id, waMessageId: { not: null } },
    orderBy: { timestamp: 'asc' },
  });
  if (!oldest?.waMessageId) return false;
  const key = { remoteJid: chatJid, id: oldest.waMessageId, fromMe: oldest.fromMe };
  const tsSeconds = Math.floor(new Date(oldest.timestamp).getTime() / 1000);
  try {
    await session.sock.fetchMessageHistory(50, key as any, tsSeconds as any);
    return true;
  } catch {
    return false;
  }
}

// Re-busca as mensagens recentes do chat para ATUALIZAR o status real (corrige
// marcações herdadas do bug que marcava 'read' por padrão no history sync).
// fetchMessageHistory busca mensagens ANTES da key dada — passando a MAIS RECENTE,
// traz justamente as recentes, que o dedup de persistHistoryMessage reconcilia
// com o m.status autoritativo. Throttle por chat para não tomar rate-limit.
const lastStatusRefresh = new Map<string, number>(); // só registra SUCESSO
const refreshInFlight = new Set<string>();
export async function refreshRecentStatuses(userId: string, chatJid: string): Promise<void> {
  const session = sessions.get(userId);
  if (!session) return;
  if (refreshInFlight.has(chatJid)) return; // já em andamento
  const last = lastStatusRefresh.get(chatJid) ?? 0;
  if (Date.now() - last < 5 * 60_000) return; // sucesso recente: pula
  const chat = await prisma.chat.findUnique({
    where: { sessionId_jid: { sessionId: session.sessionId, jid: chatJid } },
  });
  if (!chat) return;
  const newest = await prisma.message.findFirst({
    where: { chatId: chat.id, waMessageId: { not: null } },
    orderBy: { timestamp: 'desc' },
  });
  if (!newest?.waMessageId) return;
  const key = { remoteJid: chatJid, id: newest.waMessageId, fromMe: newest.fromMe };
  const tsSeconds = Math.floor(new Date(newest.timestamp).getTime() / 1000);
  refreshInFlight.add(chatJid);
  try {
    await session.sock.fetchMessageHistory(50, key as any, tsSeconds as any);
    lastStatusRefresh.set(chatJid, Date.now()); // marca SÓ em sucesso → falha permite retry
  } catch {
    // best-effort; sem registrar timestamp permite nova tentativa na próxima abertura
  } finally {
    refreshInFlight.delete(chatJid);
  }
}

// Encaminha uma mensagem para outra conversa. Usa o forward nativo do Baileys
// quando o proto está em cache (preserva mídia e marca "encaminhada"); para texto
// não cacheado, reenvia o texto do banco.
export async function forwardMessage(userId: string, messageId: string, toChatId: string) {
  const session = sessions.get(userId);
  if (!session) throw Object.assign(new Error('Sessão não conectada'), { status: 403 });
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg) throw Object.assign(new Error('Mensagem não encontrada'), { status: 404 });
  const dest = await prisma.chat.findUnique({ where: { id: toChatId } });
  if (!dest) throw Object.assign(new Error('Conversa de destino não encontrada'), { status: 404 });

  const proto = msg.waMessageId ? msgCache.get(userId)?.get(msg.waMessageId) : undefined;
  if (msg.type !== 'text' && !proto) {
    throw Object.assign(new Error('Só é possível encaminhar mídia recente'), { status: 422 });
  }

  // Registro otimista no destino.
  const local = await prisma.message.create({
    data: {
      chatId: toChatId,
      fromMe: true,
      senderJid: 'me',
      type: msg.type,
      text: msg.text,
      status: 'pending',
    },
  });
  await prisma.chat.update({
    where: { id: toChatId },
    data: { lastMessageId: local.id, lastMessageAt: local.timestamp },
  });

  try {
    let sent;
    if (proto) {
      const waMsg: WAMessage = {
        key: { remoteJid: dest.jid, id: msg.waMessageId!, fromMe: msg.fromMe },
        message: proto,
      } as WAMessage;
      sent = await session.sock.sendMessage(dest.jid, { forward: waMsg });
    } else {
      sent = await session.sock.sendMessage(dest.jid, { text: msg.text || '' });
    }
    if (sent?.key?.id && sent.message) cacheRawMessage(userId, sent.key.id, sent.message);
    if (sent?.key?.id) {
      if (!inflightSentIds.has(userId)) inflightSentIds.set(userId, new Set());
      inflightSentIds.get(userId)!.add(sent.key.id);
    }
    const updated = await prisma.message.update({
      where: { id: local.id },
      data: { status: 'sent', waMessageId: sent?.key?.id ?? undefined },
    });
    if (sent?.key?.id) inflightSentIds.get(userId)?.delete(sent.key.id);
    emitToUser(userId, 'message.sent', { message: updated });
    emitToUser(userId, 'chat.updated', { chat: dest });
    return updated;
  } catch (e: any) {
    await prisma.message.update({ where: { id: local.id }, data: { status: 'error' } }).catch(() => undefined);
    throw Object.assign(new Error('Falha ao encaminhar'), { status: 502 });
  }
}

// Envia uma reação (emoji) a uma mensagem. emoji vazio remove a reação.
export async function sendReaction(
  userId: string,
  chatId: string,
  messageId: string,
  emoji: string,
): Promise<Array<{ jid: string; emoji: string; fromMe: boolean }>> {
  const session = sessions.get(userId);
  if (!session) throw Object.assign(new Error('Sessão não conectada'), { status: 403 });
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, waMessageId: true, fromMe: true, senderJid: true, reactions: true },
  });
  if (!msg?.waMessageId) throw Object.assign(new Error('Mensagem não encontrada'), { status: 404 });
  const chat = await prisma.chat.findUnique({ where: { id: chatId }, select: { jid: true, isGroup: true } });
  if (!chat) throw Object.assign(new Error('Conversa não encontrada'), { status: 404 });

  const key: any = { remoteJid: chat.jid, id: msg.waMessageId, fromMe: msg.fromMe };
  if (chat.isGroup && !msg.fromMe) key.participant = msg.senderJid;
  await session.sock.sendMessage(chat.jid, { react: { text: emoji, key } });

  // Atualiza a MINHA reação localmente (uma por pessoa).
  let list: Array<{ jid: string; emoji: string; fromMe: boolean }> = [];
  try {
    list = msg.reactions ? JSON.parse(msg.reactions) : [];
  } catch {
    list = [];
  }
  list = list.filter((r) => !r.fromMe);
  if (emoji) list.push({ jid: 'me', emoji, fromMe: true });
  await prisma.message
    .update({ where: { id: messageId }, data: { reactions: list.length ? JSON.stringify(list) : null } })
    .catch(() => undefined);
  emitToUser(userId, 'message.reaction.updated', { messageId, chatId, reactions: list });
  return list;
}

// Inscreve para receber presença (digitando/online) de um chat.
export async function subscribePresence(userId: string, jid: string) {
  const session = sessions.get(userId);
  if (session) await session.sock.presenceSubscribe(jid).catch(() => undefined);
}

// Envia o nosso estado "digitando"/"parou" para o chat.
export async function sendTyping(userId: string, jid: string, state: 'composing' | 'paused') {
  const session = sessions.get(userId);
  if (session) await session.sock.sendPresenceUpdate(state, jid).catch(() => undefined);
}

// Arquiva/desarquiva um chat (sincroniza com o WhatsApp via chatModify).
export async function setArchived(userId: string, jid: string, archived: boolean) {
  const session = sessions.get(userId);
  const chat = await prisma.chat.findUnique({
    where: { sessionId_jid: { sessionId: session?.sessionId ?? '', jid } },
  });
  if (session) {
    try {
      const last = await prisma.message.findFirst({
        where: { chatId: chat?.id ?? '' },
        orderBy: { timestamp: 'desc' },
      });
      const lastMessages = last?.waMessageId
        ? [{ key: { remoteJid: jid, id: last.waMessageId, fromMe: last.fromMe }, messageTimestamp: Math.floor(new Date(last.timestamp).getTime() / 1000) }]
        : [];
      await session.sock.chatModify({ archive: archived, lastMessages: lastMessages as any }, jid);
    } catch {
      // segue mesmo se o WhatsApp recusar
    }
  }
  if (chat) await prisma.chat.update({ where: { id: chat.id }, data: { archived } }).catch(() => undefined);
}

// Marca um chat como lido no WhatsApp (sincroniza via chatModify markRead).
export async function markChatRead(userId: string, chatJid: string) {
  const session = sessions.get(userId);
  if (!session) return;
  try {
    const chat = await prisma.chat.findUnique({
      where: { sessionId_jid: { sessionId: session.sessionId, jid: chatJid } },
    });
    const last = chat
      ? await prisma.message.findFirst({
          where: { chatId: chat.id, fromMe: false },
          orderBy: { timestamp: 'desc' },
        })
      : null;
    if (last?.waMessageId) {
      await session.sock.chatModify(
        {
          markRead: true,
          lastMessages: [
            {
              key: { remoteJid: chatJid, id: last.waMessageId, fromMe: false },
              messageTimestamp: Math.floor(new Date(last.timestamp).getTime() / 1000),
            },
          ] as any,
        },
        chatJid,
      );
    }
  } catch {
    // best-effort
  }
}

// Reinicia o socket sem apagar credenciais nem dados — equivale a "reconectar"
// sem precisar escanear um novo QR. Útil quando a conexão está instável.
export async function reconnectSession(userId: string): Promise<void> {
  const session = sessions.get(userId);
  if (session) {
    // Marca antes de fechar: o handler connection.close vai ignorar os efeitos colaterais.
    reconnectingUsers.add(userId);
    sessions.delete(userId);
    dropMsgCache(userId);
    inflightSentIds.delete(userId);
    try {
      session.sock.end(new Error('manual_reconnect'));
    } catch {
      // ignora
    }
  }
  await setStatus(userId, 'connecting');
  emitToUser(userId, 'session.reconnecting', {});
  await startSession(userId);
}

export async function disconnectSession(userId: string) {
  const session = sessions.get(userId);
  if (session) {
    try {
      await session.sock.logout();
    } catch {
      // ignora erro de logout
    }
    sessions.delete(userId);
    dropMsgCache(userId);
    inflightSentIds.delete(userId);
  }

  // Apaga TODOS os dados da conta — ao deslogar o QR, a sessão é uma lousa em branco.
  const sessionRow = await prisma.whatsAppSession.findUnique({ where: { userId } }).catch(() => null);
  if (sessionRow) {
    // Coleta os caminhos dos arquivos de mídia ANTES de deletar via cascade.
    const mediaPaths = await prisma.media
      .findMany({
        where: { message: { chat: { sessionId: sessionRow.id } } },
        select: { localPath: true },
      })
      .catch(() => [] as { localPath: string | null }[]);

    await prisma.chat.deleteMany({ where: { sessionId: sessionRow.id } }).catch(() => undefined);
    await prisma.contact.deleteMany({ where: { sessionId: sessionRow.id } }).catch(() => undefined);
    await prisma.group.deleteMany({ where: { sessionId: sessionRow.id } }).catch(() => undefined);

    // Apaga arquivos de mídia do disco.
    for (const { localPath } of mediaPaths) {
      if (localPath) await fs.unlink(localPath).catch(() => undefined);
    }

    await prisma.whatsAppSession
      .update({ where: { id: sessionRow.id }, data: { status: 'disconnected', phoneNumber: null } })
      .catch(() => undefined);
  }

  await fs.rm(authPathFor(userId), { recursive: true, force: true }).catch(() => undefined);
  // IA: expurga TODOS os dados de IA do usuário (embeddings, memória, KB, logs) — RN15.
  await purgeAiData(userId).catch(() => undefined);
  emitToUser(userId, 'session.disconnected', { reason: 'manual', canReconnect: true });
}

export function isConnected(userId: string): boolean {
  return sessions.has(userId);
}

// Repara chats duplicados (LID × phone) via pushName matching no BD — útil para
// pares criados antes da lógica de merge automático estar ativa.
export async function repairDuplicateChats(userId: string): Promise<{ scanned: number; merged: number }> {
  const session = sessions.get(userId);
  if (!session) throw new Error('Sem sessão ativa');
  const { sessionId } = session;

  const lidChats = await prisma.chat.findMany({
    where: { sessionId, jid: { endsWith: '@lid' } },
    select: { id: true, jid: true },
  });

  let merged = 0;
  for (const lc of lidChats) {
    const lidContact = await prisma.contact.findUnique({
      where: { sessionId_jid: { sessionId, jid: lc.jid } },
      select: { pushName: true, name: true },
    });
    const searchName = lidContact?.name ?? lidContact?.pushName;
    if (!searchName) continue;

    const phoneContact = await prisma.contact.findFirst({
      where: {
        sessionId,
        jid: { endsWith: '@s.whatsapp.net' },
        OR: [{ name: searchName }, { pushName: searchName }],
      },
      select: { jid: true },
    });
    if (!phoneContact) continue;

    const before = await prisma.chat.count({ where: { sessionId, jid: { in: [lc.jid, phoneContact.jid] } } });
    await mergeChats(sessionId, phoneContact.jid, lc.jid).catch(() => undefined);
    const after = await prisma.chat.count({ where: { sessionId, jid: { in: [lc.jid, phoneContact.jid] } } });
    if (after < before) merged++;
  }

  // Re-run syncLidNames para apanhar quaisquer pares que o name-matching não cobriu.
  syncLidNames(userId).catch(() => undefined);

  return { scanned: lidChats.length, merged };
}

// No boot, reconecta sessões que estavam conectadas e ainda têm credenciais.
export async function restoreSessions() {
  const previouslyConnected = await prisma.whatsAppSession.findMany({
    where: { status: { in: ['connected', 'connecting', 'qr'] } },
  });
  for (const s of previouslyConnected) {
    if (hasValidCreds(s.userId)) {
      startSession(s.userId).catch(() => undefined);
    } else {
      // Estava conectado mas perdeu as credenciais ⇒ deslogado: exige novo QR.
      await prisma.whatsAppSession
        .update({ where: { id: s.id }, data: { status: 'logged_out' } })
        .catch(() => undefined);
    }
  }
}
