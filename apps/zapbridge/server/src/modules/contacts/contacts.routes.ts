import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authGuard } from '../../middleware/auth';
import { getContacts } from './contacts.controller';

const router = Router();
router.use(authGuard);
router.get('/', asyncHandler(getContacts));

export default router;
