import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authGuard } from '../../middleware/auth';
import { getGroups, getGroupById } from './groups.controller';

const router = Router();
router.use(authGuard);
router.get('/', asyncHandler(getGroups));
router.get('/:id', asyncHandler(getGroupById));

export default router;
