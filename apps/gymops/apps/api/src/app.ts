import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import { env } from './env.js';
import { authRoutes } from './routes/auth/index.js';
import { organizationRoutes } from './routes/organizations/index.js';
import { unitRoutes } from './routes/units/index.js';
import { areaRoutes } from './routes/areas/index.js';
import { membershipRoutes } from './routes/memberships/index.js';
import { dashboardRoutes } from './routes/dashboards/index.js';
import { activityRoutes } from './routes/activities/index.js';
import { checklistRoutes } from './routes/checklists/index.js';
import { commentRoutes } from './routes/comments/index.js';
import { attachmentRoutes } from './routes/attachments/index.js';
import { meRoutes } from './routes/me/index.js';
import { userRoutes } from './routes/users/index.js';
import { activityTemplateRoutes } from './routes/activity-templates/index.js';
import { notificationRoutes } from './routes/notifications/index.js';
import { integrationRoutes } from './routes/integrations/index.js';
import { importRoutes } from './routes/imports/index.js';
import { aiRoutes } from './routes/ai/index.js';
import { invitationRoutes } from './routes/invitations/index.js';
import { recurrenceRoutes } from './routes/recurrences/index.js';
import { savedViewRoutes } from './routes/saved-views/index.js';
import { auditLogRoutes } from './routes/audit-logs/index.js';
import { adminRoutes } from './routes/admin/index.js';

export async function buildApp() {
  const app = Fastify({
    // Atrás do Traefik, request.ip sem trustProxy é o IP do ingress — o que
    // tornaria os rate limits "por IP" efetivamente globais. Com trustProxy,
    // o Fastify usa X-Forwarded-For (Traefik popula).
    trustProxy: true,
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
  });

  const frontendOrigin = (() => {
    try {
      return new URL(env.FRONTEND_URL).origin;
    } catch {
      return env.FRONTEND_URL;
    }
  })();

  const allowedOrigins = new Set([
    frontendOrigin,
    env.FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:7480',
    ...(env.ALLOWED_ORIGINS
      ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
      : []),
  ]);

  // ── Plugins ─────────────────────────────────────────────────────────────────
  await app.register(fastifyCors, {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(fastifyCookie);

  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: 'refresh_token', signed: false },
  });

  await app.register(fastifyRateLimit, {
    global: false,
    max: 200,
    timeWindow: '1 minute',
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  });

  // ── Auth decorator ───────────────────────────────────────────────────────────
  app.decorate('authenticate', async function (request: import('fastify').FastifyRequest) {
    try {
      await request.jwtVerify();
    } catch {
      throw { statusCode: 401, message: 'Unauthorized' };
    }
  });

  // ── Health check ────────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  }));

  // ── Routes ───────────────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(organizationRoutes, { prefix: '/organizations' });
  await app.register(unitRoutes, { prefix: '/units' });
  await app.register(areaRoutes, { prefix: '/areas' });
  await app.register(membershipRoutes, { prefix: '/memberships' });
  await app.register(dashboardRoutes, { prefix: '/dashboards' });
  await app.register(activityRoutes, { prefix: '/activities' });
  await app.register(checklistRoutes);
  await app.register(commentRoutes);
  await app.register(attachmentRoutes);
  await app.register(meRoutes, { prefix: '/me' });
  await app.register(userRoutes, { prefix: '/users' });
  await app.register(activityTemplateRoutes, { prefix: '/activity-templates' });
  await app.register(notificationRoutes, { prefix: '/notifications' });
  await app.register(integrationRoutes, { prefix: '/integrations' });
  await app.register(importRoutes, { prefix: '/imports' });
  await app.register(aiRoutes, { prefix: '/ai' });
  await app.register(invitationRoutes, { prefix: '/invitations' });
  await app.register(recurrenceRoutes, { prefix: '/recurrences' });
  await app.register(savedViewRoutes, { prefix: '/saved-views' });
  await app.register(auditLogRoutes, { prefix: '/audit-logs' });
  await app.register(adminRoutes, { prefix: '/admin' });

  // Shortcut: /auth/me — return current user info + resolved org/role context.
  // O login por senha resolve organizationId/role/primaryUnitId no /auth/login; quem entra
  // por OAuth/SSO só recebe o accessToken, então precisa recuperar esse contexto aqui (senão
  // cai no dashboard sem organização/papel). Aditivo — não altera o shape de /auth/login.
  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { db } = await import('./lib/prisma.js');
    const { resolveUserOrganization, resolveUserContext } = await import('./lib/auth-context.js');
    const user = await db.user.findUnique({
      where: { id: request.user.sub },
      select: { id: true, name: true, email: true, avatarUrl: true, isPlatformAdmin: true },
    });
    if (!user) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });

    const orgId = await resolveUserOrganization(user.id);
    const ctx = orgId
      ? await resolveUserContext(user.id, orgId)
      : { userRole: null, primaryUnitId: null, organizationId: null };

    return reply.send({
      data: {
        ...user,
        organizationId: ctx.organizationId,
        role: ctx.userRole,
        primaryUnitId: ctx.primaryUnitId,
        isPlatformAdmin: user.isPlatformAdmin,
      },
    });
  });

  // ── Error handler ────────────────────────────────────────────────────────────
  app.setErrorHandler((error, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const code = statusCode === 404 ? 'NOT_FOUND'
      : statusCode === 401 ? 'UNAUTHORIZED'
      : statusCode === 403 ? 'FORBIDDEN'
      : statusCode === 422 ? 'VALIDATION_ERROR'
      : 'INTERNAL_ERROR';

    void reply.status(statusCode).send({
      error: { code, message: error.message },
    });
  });

  return app;
}

// TypeScript augmentation
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}
