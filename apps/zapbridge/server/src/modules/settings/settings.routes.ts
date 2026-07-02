import { Router, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authGuard } from '../../middleware/auth';
import { AuthedRequest } from '../../types';
import { prisma } from '../../lib/prisma';

const router = Router();
router.use(authGuard);

// Estado das configurações (não retorna o código secreto em si).
router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const s = await prisma.appSetting.findUnique({ where: { userId: req.user!.userId } });
    res.json({ theme: s?.theme ?? 'system', lockEnabled: !!s?.lockSecret });
  }),
);

// Define/altera/remove o código da tranca.
// SEGURANÇA: se já existe um código, é obrigatório informar o código ATUAL
// (currentSecret) para alterá-lo ou removê-lo — senão ninguém poderia simplesmente
// trocar/remover a tranca e ver as conversas. Ao REMOVER, as conversas são
// destrancadas (a tranca é "limpa").
router.post(
  '/lock-secret',
  asyncHandler(async (req: AuthedRequest, res: Response) => {
    const userId = req.user!.userId;
    const setting = await prisma.appSetting.findUnique({ where: { userId } });
    const existing = setting?.lockSecret ?? null;

    const newSecret = (typeof req.body?.secret === 'string' ? req.body.secret.trim() : '') || null;
    const currentSecret =
      typeof req.body?.currentSecret === 'string' ? req.body.currentSecret.trim() : '';

    // Já há um código? Exige o atual para alterar/remover.
    if (existing && currentSecret !== existing) {
      return res.status(403).json({ error: 'Código atual incorreto' });
    }

    await prisma.appSetting.upsert({
      where: { userId },
      create: { userId, lockSecret: newSecret },
      update: { lockSecret: newSecret },
    });

    // Removeu a tranca → destranca (limpa) todas as conversas trancadas.
    if (!newSecret) {
      const session = await prisma.whatsAppSession.findUnique({ where: { userId } });
      if (session) {
        await prisma.chat
          .updateMany({ where: { sessionId: session.id, locked: true }, data: { locked: false } })
          .catch(() => undefined);
      }
    }

    res.json({ lockEnabled: !!newSecret });
  }),
);

export default router;
