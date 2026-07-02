import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authGuard } from '../../middleware/auth';
import { registerPushToken, deletePushToken } from './push.controller';

const router = Router();
router.use(authGuard);
router.post('/token', asyncHandler(registerPushToken));
router.delete('/token', asyncHandler(deletePushToken));

export default router;
