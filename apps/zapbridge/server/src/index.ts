import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import { env } from './config/env';
import { initIO } from './realtime/io';
import { restoreSessions } from './modules/whatsapp/baileys.manager';

import { authGuard } from './middleware/auth';
import { asyncHandler } from './utils/asyncHandler';
import { me } from './modules/auth/auth.controller';
import authRoutes from './modules/auth/auth.routes';
import whatsappRoutes from './modules/whatsapp/whatsapp.routes';
import chatsRoutes from './modules/chats/chats.routes';
import contactsRoutes from './modules/contacts/contacts.routes';
import groupsRoutes from './modules/groups/groups.routes';
import mediaRoutes from './modules/media/media.routes';
import pushRoutes from './modules/push/push.routes';
import settingsRoutes from './modules/settings/settings.routes';

const app = express();
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, service: 'zapbridge-server' }));

app.use('/auth', authRoutes);
app.get('/me', authGuard, asyncHandler(me));
app.use('/whatsapp', whatsappRoutes);
app.use('/chats', chatsRoutes);
app.use('/contacts', contactsRoutes);
app.use('/groups', groupsRoutes);
app.use('/media', mediaRoutes);
app.use('/push', pushRoutes);
app.use('/settings', settingsRoutes);

// Handler de erro central: respeita `err.status` quando presente.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err?.status ?? 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: err?.message ?? 'Erro interno' });
});

const server = http.createServer(app);
initIO(server);

server.listen(env.port, () => {
  console.log(`zapbridge-server ouvindo em http://0.0.0.0:${env.port}`);
  // Tenta reconectar sessões previamente ativas.
  restoreSessions().catch((e) => console.error('[restoreSessions]', e));
});
