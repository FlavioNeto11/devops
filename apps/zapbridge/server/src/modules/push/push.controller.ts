import { Response } from 'express';
import { AuthedRequest } from '../../types';
import { prisma } from '../../lib/prisma';

// Registra/atualiza o Expo push token do usuário.
export async function registerPushToken(req: AuthedRequest, res: Response) {
  const { token } = req.body ?? {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token é obrigatório' });
  }
  await prisma.user.update({ where: { id: req.user!.userId }, data: { pushToken: token } });
  return res.json({ ok: true });
}

// Remove o token (ex.: logout / desativar notificações).
export async function deletePushToken(req: AuthedRequest, res: Response) {
  await prisma.user.update({ where: { id: req.user!.userId }, data: { pushToken: null } });
  return res.json({ ok: true });
}
