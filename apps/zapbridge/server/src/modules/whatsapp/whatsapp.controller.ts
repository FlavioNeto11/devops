import { Response } from 'express';
import { AuthedRequest } from '../../types';
import { prisma } from '../../lib/prisma';
import { startSession, reconnectSession, disconnectSession, repairDuplicateChats, hasValidCreds } from './baileys.manager';

export async function startWhatsApp(req: AuthedRequest, res: Response) {
  const result = await startSession(req.user!.userId);
  return res.status(202).json(result);
}

// Inicia a sessão pedindo pairing code em vez de QR.
export async function pairWhatsApp(req: AuthedRequest, res: Response) {
  const { phoneNumber } = req.body ?? {};
  if (!phoneNumber || String(phoneNumber).replace(/\D/g, '').length < 8) {
    return res.status(400).json({ error: 'phoneNumber válido (com DDI) é obrigatório' });
  }
  const result = await startSession(req.user!.userId, String(phoneNumber));
  if (!result.pairingCode) {
    return res.status(409).json({ error: 'Não foi possível gerar o código (sessão já registrada?)' });
  }
  return res.json({ pairingCode: result.pairingCode });
}

export async function sessionStatus(req: AuthedRequest, res: Response) {
  const session = await prisma.whatsAppSession.findUnique({
    where: { userId: req.user!.userId },
  });
  if (!session) {
    return res.json({ status: 'disconnected' });
  }
  // Desconectado SEM credenciais no disco ⇒ na prática está deslogado (só
  // reconecta via novo QR). Reporta 'logged_out' para a UI mostrar o aviso certo.
  const status =
    session.status === 'disconnected' && !hasValidCreds(req.user!.userId)
      ? 'logged_out'
      : session.status;
  return res.json({
    status,
    phoneNumber: session.phoneNumber ?? null,
    lastConnectedAt: session.lastConnectedAt ?? null,
  });
}

export async function reconnect(req: AuthedRequest, res: Response) {
  await reconnectSession(req.user!.userId);
  return res.json({ status: 'connecting' });
}

export async function disconnect(req: AuthedRequest, res: Response) {
  await disconnectSession(req.user!.userId);
  return res.json({ status: 'disconnected' });
}

// Mescla chats duplicados LID × phone via pushName matching no BD.
export async function repairDuplicates(req: AuthedRequest, res: Response) {
  try {
    const result = await repairDuplicateChats(req.user!.userId);
    return res.json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e.message ?? 'Falha' });
  }
}

// Corrige lastMessageAt de todos os chats a partir do MAX(message.timestamp) real.
// Útil quando o @default(now()) do Prisma gerou timestamps falsos.
export async function repairTimestamps(req: AuthedRequest, res: Response) {
  const session = await prisma.whatsAppSession.findUnique({
    where: { userId: req.user!.userId },
  });
  if (!session) return res.status(403).json({ error: 'Sem sessão' });

  const chats = await prisma.chat.findMany({
    where: { sessionId: session.id },
    select: { id: true, lastMessageAt: true },
  });

  let fixed = 0;
  for (const c of chats) {
    const latest = await prisma.message.findFirst({
      where: { chatId: c.id },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });
    if (!latest?.timestamp) continue;
    if (!c.lastMessageAt || c.lastMessageAt.getTime() !== latest.timestamp.getTime()) {
      await prisma.chat
        .update({ where: { id: c.id }, data: { lastMessageAt: latest.timestamp } })
        .catch(() => undefined);
      fixed++;
    }
  }
  return res.json({ chats: chats.length, fixed });
}
