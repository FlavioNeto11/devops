import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { encrypt, decrypt } from '../../lib/crypto.js';
import { env } from '../../env.js';
import { fetchTrelloBoards } from '../../imports/trello/processor.js';
import { hasOrgRole } from '../../lib/rbac.js';


export const integrationRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /integrations/trello/auth-url ────────────────────────────────────────
  app.get('/trello/auth-url', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (!env.TRELLO_API_KEY) {
      return reply.status(503).send({ error: { code: 'NOT_CONFIGURED', message: 'Trello integration not configured' } });
    }
    const returnUrl = `${env.FRONTEND_URL}/settings/integrations`;
    const url = `https://trello.com/1/authorize?expiration=never&name=GymOps&scope=read,write&response_type=token&key=${env.TRELLO_API_KEY}&return_url=${encodeURIComponent(returnUrl)}`;
    return reply.send({ data: { url } });
  });

  // ── POST /integrations/trello/connect ────────────────────────────────────────
  app.post('/trello/connect', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub;
    const body = z.object({
      token: z.string().min(1),
      organizationId: z.string().uuid(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const isAdmin = await hasOrgRole(userId, body.data.organizationId, ['owner', 'org_manager']);
    if (!isAdmin) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    if (!env.TRELLO_API_KEY) {
      return reply.status(503).send({ error: { code: 'NOT_CONFIGURED', message: 'Trello not configured' } });
    }

    // Verify token works by fetching user boards
    try {
      await fetchTrelloBoards(env.TRELLO_API_KEY, body.data.token);
    } catch {
      return reply.status(422).send({ error: { code: 'INVALID_TOKEN', message: 'Invalid Trello token' } });
    }

    const authPayload = encrypt(JSON.stringify({ apiKey: env.TRELLO_API_KEY, token: body.data.token }));

    const account = await db.integrationAccount.upsert({
      where: { organizationId_provider: { organizationId: body.data.organizationId, provider: 'trello' } },
      create: {
        organizationId: body.data.organizationId,
        provider: 'trello',
        auth: authPayload as never,
        metadata: { connectedBy: userId, connectedAt: new Date().toISOString() } as never,
      },
      update: {
        auth: authPayload as never,
        revokedAt: null,
        metadata: { connectedBy: userId, connectedAt: new Date().toISOString() } as never,
      },
    });

    return reply.status(201).send({ data: { id: account.id } });
  });

  // ── GET /integrations ─────────────────────────────────────────────────────────
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub;
    const { organizationId } = z.object({ organizationId: z.string().uuid() }).parse(request.query);
    const member = await db.membership.findFirst({ where: { userId, organizationId, deletedAt: null } });
    if (!member) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    const accounts = await db.integrationAccount.findMany({
      where: { organizationId, revokedAt: null },
      select: { id: true, provider: true, metadata: true, createdAt: true, updatedAt: true },
    });
    return reply.send({ data: accounts });
  });

  // ── GET /integrations/trello/boards ──────────────────────────────────────────
  app.get('/trello/boards', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub;
    const { organizationId } = z.object({ organizationId: z.string().uuid() }).parse(request.query);
    const member = await db.membership.findFirst({ where: { userId, organizationId, deletedAt: null } });
    if (!member) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    const account = await db.integrationAccount.findUnique({
      where: { organizationId_provider: { organizationId, provider: 'trello' }, revokedAt: null },
    });
    if (!account) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Trello not connected' } });

    const { apiKey, token } = JSON.parse(decrypt(account.auth as string)) as { apiKey: string; token: string };
    const boards = await fetchTrelloBoards(apiKey, token);
    return reply.send({ data: boards });
  });

  // ── GET /integrations/trello/health ──────────────────────────────────────────
  app.get('/trello/health', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub;
    const { organizationId } = z.object({ organizationId: z.string().uuid() }).parse(request.query);
    const member = await db.membership.findFirst({ where: { userId, organizationId, deletedAt: null } });
    if (!member) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });

    const account = await db.integrationAccount.findUnique({
      where: { organizationId_provider: { organizationId, provider: 'trello' } },
    });

    if (!account || account.revokedAt) {
      return reply.send({ data: { connected: false, healthy: false } });
    }

    let healthy = false;
    try {
      const { apiKey, token } = JSON.parse(decrypt(account.auth as string)) as { apiKey: string; token: string };
      await fetchTrelloBoards(apiKey, token);
      healthy = true;
    } catch {
      healthy = false;
    }

    return reply.send({ data: { connected: true, healthy, connectedAt: (account.metadata as { connectedAt?: string })?.connectedAt } });
  });

  // ── POST /integrations/trello/reconnect ───────────────────────────────────────
  app.post('/trello/reconnect', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (!env.TRELLO_API_KEY) {
      return reply.status(503).send({ error: { code: 'NOT_CONFIGURED', message: 'Trello integration not configured' } });
    }
    const { organizationId } = z.object({ organizationId: z.string().uuid() }).parse(request.body);
    const userId = request.user.sub;

    const isAdmin = await hasOrgRole(userId, organizationId, ['owner', 'org_manager']);
    if (!isAdmin) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const returnUrl = `${env.FRONTEND_URL}/settings/integrations`;
    const url = `https://trello.com/1/authorize?expiration=never&name=GymOps&scope=read,write&response_type=token&key=${env.TRELLO_API_KEY}&return_url=${encodeURIComponent(returnUrl)}`;
    return reply.send({ data: { url } });
  });

  // ── GET /integrations/whatsapp/status ─────────────────────────────────────────
  app.get('/whatsapp/status', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub;
    const { organizationId } = z.object({ organizationId: z.string().uuid() }).parse(request.query);
    const member = await db.membership.findFirst({ where: { userId, organizationId, deletedAt: null } });
    if (!member) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });

    const from = env.TWILIO_WHATSAPP_FROM ?? null;
    const configured = !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && from);
    const sandbox = from === '+14155238886';

    const lastErrors = await db.notificationDelivery.findMany({
      where: { organizationId, channel: 'whatsapp', status: 'failed' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { errorMessage: true, createdAt: true },
    });

    return reply.send({ data: { configured, sandbox, from, lastErrors: lastErrors.map((e) => e.errorMessage ?? '') } });
  });

  // ── DELETE /integrations/:id ──────────────────────────────────────────────────
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const account = await db.integrationAccount.findUnique({ where: { id } });
    if (!account) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Integration not found' } });

    const isAdmin = await hasOrgRole(userId, account.organizationId, ['owner', 'org_manager']);
    if (!isAdmin) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    await db.integrationAccount.update({ where: { id }, data: { revokedAt: new Date() } });
    return reply.status(204).send();
  });
};
