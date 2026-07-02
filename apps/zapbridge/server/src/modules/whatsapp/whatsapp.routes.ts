import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authGuard } from '../../middleware/auth';
import { startWhatsApp, pairWhatsApp, sessionStatus, reconnect, disconnect, repairTimestamps, repairDuplicates } from './whatsapp.controller';

const router = Router();

router.use(authGuard);
router.post('/session/start', asyncHandler(startWhatsApp));
router.post('/session/pair', asyncHandler(pairWhatsApp));
router.get('/session/status', asyncHandler(sessionStatus));
router.post('/session/reconnect', asyncHandler(reconnect));
router.post('/session/disconnect', asyncHandler(disconnect));
router.post('/session/repair-timestamps', asyncHandler(repairTimestamps));
router.post('/session/repair-duplicates', asyncHandler(repairDuplicates));

export default router;
