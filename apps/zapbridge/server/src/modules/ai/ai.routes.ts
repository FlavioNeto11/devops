// Rotas da camada de IA. authGuard em tudo; requireConsent nos endpoints que
// processam conteúdo (RN11). Rate-limit simples (10/min por usuário) nos /ai/*.
import { Router, type Response, type NextFunction } from 'express';
import multer from 'multer';
import type { AuthedRequest } from '../../types';
import { authGuard } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireConsent } from './consent';
import * as c from './ai.controller';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 10 } });

// Rate-limit em memória (10 req/min por usuário) — espelha a regra dos /ai/* do gymops.
const hits = new Map<string, number[]>();
function rateLimit(req: AuthedRequest, res: Response, next: NextFunction): void {
  const id = req.user?.userId ?? 'anon';
  const now = Date.now();
  const win = (hits.get(id) ?? []).filter((t) => now - t < 60_000);
  if (win.length >= 10) {
    res.status(429).json({ error: 'muitas requisições — tente em instantes' });
    return;
  }
  win.push(now);
  hits.set(id, win);
  next();
}

// ---- Router principal: /ai/* ------------------------------------------------
const router = Router();
router.use(authGuard, rateLimit);

// consentimento + settings (NÃO exigem consentimento prévio)
router.get('/consent', asyncHandler(c.getConsent));
router.post('/consent', asyncHandler(c.postConsent));
router.post('/consent/revoke', asyncHandler(c.postRevoke));
router.get('/settings', asyncHandler(c.getConsent));
router.put('/settings', asyncHandler(c.putSettings));
router.post('/data/purge', asyncHandler(c.postPurge)); // apagar dados de IA (sempre permitido)

// processamento de conteúdo (exige consentimento)
router.post('/rewrite', requireConsent(), asyncHandler(c.postRewrite));
router.get('/search', requireConsent(), asyncHandler(c.getSearch));
router.post('/assistant', requireConsent(), asyncHandler(c.postAssistant));
router.post('/confirm', requireConsent(), asyncHandler(c.postConfirm));
router.get('/kb', asyncHandler(c.getKb));
router.post('/kb', requireConsent(), upload.array('files'), asyncHandler(c.postKb));
router.delete('/kb/:sid', asyncHandler(c.deleteKb));
router.post('/media/:messageId/understand', requireConsent(), asyncHandler(c.postUnderstandMedia));

export default router;

// ---- Router por-chat: montado em /chats/:id/ai ------------------------------
export const aiChatRouter = Router({ mergeParams: true });
aiChatRouter.use(authGuard, rateLimit);
aiChatRouter.get('/settings', asyncHandler(c.getChatAi));
aiChatRouter.put('/settings', asyncHandler(c.putChatAi));
aiChatRouter.post('/suggest', requireConsent(), asyncHandler(c.postSuggest));
aiChatRouter.get('/summary', requireConsent(), asyncHandler(c.getSummary));
aiChatRouter.get('/triage', requireConsent(), asyncHandler(c.getTriage));
aiChatRouter.post('/learn-style', requireConsent(), asyncHandler(c.postLearnStyle));
