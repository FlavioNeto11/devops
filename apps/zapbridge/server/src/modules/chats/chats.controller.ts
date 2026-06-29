import { Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { AuthedRequest, MessageType } from '../../types';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import {
  getSessionIdOrThrow,
  listChats,
  getChat,
  listMessages,
} from './chats.service';
import {
  sendText,
  sendMedia,
  markChatRead,
  fetchOlderHistory,
  refreshRecentStatuses,
  subscribePresence,
  sendTyping,
  setArchived,
  sendReaction,
  forwardMessage,
} from '../whatsapp/baileys.manager';

export async function getChats(req: AuthedRequest, res: Response) {
  const userId = req.user!.userId;
  const sessionId = await getSessionIdOrThrow(userId);
  const search = (req.query.search as string) || undefined;
  const archived = req.query.archived === 'true';

  // Tranca:
  //  - com código definido: esconde as trancadas; digitar o código na busca revela.
  //  - sem código: as trancadas aparecem na lista normal (não ficam inacessíveis).
  const setting = await prisma.appSetting.findUnique({ where: { userId } });
  if (setting?.lockSecret) {
    if (search && search === setting.lockSecret) {
      const chats = await listChats(sessionId, undefined, false, true);
      return res.json({ chats, revealedLocked: true });
    }
    const chats = await listChats(sessionId, search, archived, false);
    return res.json({ chats });
  }

  // Sem código secreto → não filtra trancadas (ficam visíveis na lista).
  const chats = await listChats(sessionId, search, archived, undefined);
  return res.json({ chats });
}

// Encaminha uma mensagem para outra conversa.
export async function postForward(req: AuthedRequest, res: Response) {
  const userId = req.user!.userId;
  await getSessionIdOrThrow(userId);
  const toChatId = String(req.body?.toChatId ?? '');
  if (!toChatId) return res.status(400).json({ error: 'toChatId é obrigatório' });
  const message = await forwardMessage(userId, req.params.msgId, toChatId);
  return res.status(201).json({ message });
}

// Reage (emoji) a uma mensagem; emoji vazio remove a reação.
export async function postReaction(req: AuthedRequest, res: Response) {
  const userId = req.user!.userId;
  await getSessionIdOrThrow(userId);
  const emoji = String(req.body?.emoji ?? '');
  const reactions = await sendReaction(userId, req.params.id, req.params.msgId, emoji);
  return res.json({ reactions });
}

// Abre (ou cria) uma conversa a partir de um jid — usado pela tela "Nova conversa".
export async function openChat(req: AuthedRequest, res: Response) {
  const sessionId = await getSessionIdOrThrow(req.user!.userId);
  const jid = String(req.body?.jid ?? '').trim();
  if (!jid || !jid.includes('@')) {
    return res.status(400).json({ error: 'jid válido é obrigatório' });
  }
  const chat = await prisma.chat.upsert({
    where: { sessionId_jid: { sessionId, jid } },
    create: { sessionId, jid, isGroup: jid.endsWith('@g.us') },
    update: {},
  });
  const resolved = await getChat(sessionId, chat.id);
  return res.json({ chat: resolved });
}

export async function getChatById(req: AuthedRequest, res: Response) {
  const sessionId = await getSessionIdOrThrow(req.user!.userId);
  const chat = await getChat(sessionId, req.params.id);
  // Abrir a conversa zera não lidas (RN09) e marca como lida (best-effort).
  await prisma.chat.update({ where: { id: chat.id }, data: { unreadCount: 0 } });
  await markChatRead(req.user!.userId, chat.jid);
  // Inscreve para receber "digitando" deste contato.
  await subscribePresence(req.user!.userId, chat.jid);
  // Best-effort: re-busca status recentes do WhatsApp para corrigir marcações
  // de status herdadas (não bloqueia a resposta; chega via socket).
  refreshRecentStatuses(req.user!.userId, chat.jid).catch(() => undefined);
  return res.json({ chat: { ...chat, unreadCount: 0 } });
}

export async function getMessages(req: AuthedRequest, res: Response) {
  const sessionId = await getSessionIdOrThrow(req.user!.userId);
  const chat = await getChat(sessionId, req.params.id);
  const cursor = (req.query.cursor as string) || undefined;
  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  const search = (req.query.search as string) || undefined;
  const result = await listMessages(chat.id, cursor, limit, search);
  return res.json(result);
}

// Envia "digitando"/"parou" para o chat.
export async function postTyping(req: AuthedRequest, res: Response) {
  const sessionId = await getSessionIdOrThrow(req.user!.userId);
  const chat = await getChat(sessionId, req.params.id);
  const state = req.body?.state === 'paused' ? 'paused' : 'composing';
  await sendTyping(req.user!.userId, chat.jid, state);
  return res.json({ ok: true });
}

// Tranca/destranca o chat (tranca LOCAL — não sincroniza com o WhatsApp).
export async function postLock(req: AuthedRequest, res: Response) {
  const sessionId = await getSessionIdOrThrow(req.user!.userId);
  const chat = await getChat(sessionId, req.params.id);
  const locked = !!req.body?.locked;
  await prisma.chat.update({ where: { id: chat.id }, data: { locked } });
  return res.json({ locked });
}

// Arquiva/desarquiva o chat (sincroniza com o WhatsApp).
export async function postArchive(req: AuthedRequest, res: Response) {
  const sessionId = await getSessionIdOrThrow(req.user!.userId);
  const chat = await getChat(sessionId, req.params.id);
  const archived = !!req.body?.archived;
  await setArchived(req.user!.userId, chat.jid, archived);
  return res.json({ archived });
}

// Pede ao WhatsApp o histórico mais antigo deste chat (on-demand).
export async function requestOlderHistory(req: AuthedRequest, res: Response) {
  const userId = req.user!.userId;
  const sessionId = await getSessionIdOrThrow(userId);
  const chat = await getChat(sessionId, req.params.id);
  const requested = await fetchOlderHistory(userId, chat.jid);
  return res.status(202).json({ requested });
}

export async function postMessage(req: AuthedRequest, res: Response) {
  const userId = req.user!.userId;
  const sessionId = await getSessionIdOrThrow(userId);
  const chat = await getChat(sessionId, req.params.id);
  const { text, quotedMessageId } = req.body ?? {};
  if (!text || !String(text).trim()) {
    return res.status(400).json({ error: 'text é obrigatório' });
  }

  // Registro otimista: cria a mensagem como pending (RN04).
  const message = await prisma.message.create({
    data: {
      chatId: chat.id,
      fromMe: true,
      senderJid: 'me',
      type: 'text',
      text,
      status: 'pending',
      quotedMessageId: quotedMessageId ?? null,
    },
  });
  await prisma.chat.update({
    where: { id: chat.id },
    data: { lastMessageId: message.id, lastMessageAt: message.timestamp },
  });

  let quotedWaId: string | undefined;
  if (quotedMessageId) {
    const quoted = await prisma.message.findUnique({ where: { id: quotedMessageId } });
    quotedWaId = quoted?.waMessageId ?? undefined;
  }

  const updated = await sendText(userId, chat.jid, text, message.id, quotedWaId);
  return res.status(201).json({ message: updated });
}

export async function postMedia(req: AuthedRequest, res: Response) {
  const userId = req.user!.userId;
  const sessionId = await getSessionIdOrThrow(userId);
  const chat = await getChat(sessionId, req.params.id);
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: 'arquivo (file) é obrigatório' });

  const type = (req.body.type as MessageType) || 'document';
  const caption = (req.body.caption as string) || undefined;

  // Persiste o arquivo em storage/media.
  await fs.mkdir(env.mediaDir, { recursive: true });
  const message = await prisma.message.create({
    data: {
      chatId: chat.id,
      fromMe: true,
      senderJid: 'me',
      type,
      text: caption ?? null,
      status: 'pending',
    },
  });
  const ext = path.extname(file.originalname) || '';
  const storedPath = path.join(env.mediaDir, `${message.id}${ext}`);
  await fs.writeFile(storedPath, file.buffer);
  await prisma.media.create({
    data: {
      messageId: message.id,
      type,
      mimeType: file.mimetype,
      fileName: file.originalname,
      localPath: storedPath,
      size: file.size,
      downloaded: true,
    },
  });
  await prisma.chat.update({
    where: { id: chat.id },
    data: { lastMessageId: message.id, lastMessageAt: message.timestamp },
  });

  const updated = await sendMedia(userId, chat.jid, type, storedPath, file.mimetype, caption, message.id);
  return res.status(201).json({ message: updated });
}
