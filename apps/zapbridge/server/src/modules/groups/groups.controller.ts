import { Response } from 'express';
import { AuthedRequest } from '../../types';
import { prisma } from '../../lib/prisma';
import { getSessionIdOrThrow } from '../chats/chats.service';
import { syncGroupMetadata } from '../whatsapp/baileys.manager';

export async function getGroups(req: AuthedRequest, res: Response) {
  const sessionId = await getSessionIdOrThrow(req.user!.userId);
  // Lista grupos a partir dos chats marcados como grupo, enriquecendo com Group quando houver.
  const chats = await prisma.chat.findMany({
    where: { sessionId, isGroup: true },
    orderBy: { name: 'asc' },
    take: 200,
  });
  const groups = await prisma.group.findMany({ where: { sessionId } });
  const bySubject = new Map(groups.map((g) => [g.jid, g]));
  return res.json({
    groups: chats.map((c) => ({
      id: c.id,
      jid: c.jid,
      subject: bySubject.get(c.jid)?.subject ?? c.name,
    })),
  });
}

// Detalhes de um grupo com participantes reais (groupMetadata).
export async function getGroupById(req: AuthedRequest, res: Response) {
  const userId = req.user!.userId;
  const sessionId = await getSessionIdOrThrow(userId);

  // O :id é o id do Chat (grupo). Resolve o jid e atualiza os metadados ao vivo.
  const chat = await prisma.chat.findFirst({ where: { id: req.params.id, sessionId } });
  if (!chat || !chat.isGroup) {
    return res.status(404).json({ error: 'Grupo não encontrado' });
  }
  await syncGroupMetadata(userId, chat.jid);

  const group = await prisma.group.findUnique({
    where: { sessionId_jid: { sessionId, jid: chat.jid } },
    include: { participants: { orderBy: { isAdmin: 'desc' } } },
  });

  // Resolve nomes dos participantes a partir dos contatos conhecidos.
  const contacts = await prisma.contact.findMany({ where: { sessionId } });
  const nameByJid = new Map(contacts.map((c) => [c.jid, c.name ?? c.pushName]));

  return res.json({
    group: {
      id: chat.id,
      jid: chat.jid,
      subject: group?.subject ?? chat.name,
      description: group?.description ?? null,
      ownerJid: group?.ownerJid ?? null,
      participants:
        group?.participants.map((p) => ({
          jid: p.jid,
          name: nameByJid.get(p.jid) ?? null,
          isAdmin: p.isAdmin,
        })) ?? [],
    },
  });
}
