import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../utils/asyncHandler';
import { authGuard } from '../../middleware/auth';
import {
  getChats,
  getChatById,
  openChat,
  getMessages,
  postMessage,
  postMedia,
  postReaction,
  postForward,
  requestOlderHistory,
  postTyping,
  postArchive,
  postLock,
} from './chats.controller';

// Upload em memória (MVP); limite de 32MB.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 32 * 1024 * 1024 } });

const router = Router();
router.use(authGuard);

router.get('/', asyncHandler(getChats));
router.post('/open', asyncHandler(openChat));
router.get('/:id', asyncHandler(getChatById));
router.get('/:id/messages', asyncHandler(getMessages));
router.post('/:id/history/older', asyncHandler(requestOlderHistory));
router.post('/:id/typing', asyncHandler(postTyping));
router.post('/:id/archive', asyncHandler(postArchive));
router.post('/:id/lock', asyncHandler(postLock));
router.post('/:id/messages', asyncHandler(postMessage));
router.post('/:id/messages/:msgId/react', asyncHandler(postReaction));
router.post('/:id/messages/:msgId/forward', asyncHandler(postForward));
router.post('/:id/media', upload.single('file'), asyncHandler(postMedia));

export default router;
