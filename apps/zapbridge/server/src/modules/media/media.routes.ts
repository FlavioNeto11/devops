import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authGuard } from '../../middleware/auth';
import { getMedia } from './media.controller';

const router = Router();
router.use(authGuard);
router.get('/:id', asyncHandler(getMedia));

export default router;
