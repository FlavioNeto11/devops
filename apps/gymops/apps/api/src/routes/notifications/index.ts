import type { FastifyPluginAsync } from 'fastify';
import type { NotificationChannel } from '@gymops/db';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { getVapidPublicKey } from '../../lib/push.js';
import { env } from '../../env.js';

const CHANNELS: NotificationChannel[] = ['email', 'push', 'whatsapp'];

export const notificationRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /notifications/vapid-key ─────────────────────────────────────────────
  app.get('/vapid-key', async (_request, reply) => {
    const key = getVapidPublicKey();
    return reply.send({ data: { publicKey: key } });
  });

  // ── GET /notification-preferences ────────────────────────────────────────────
  app.get('/preferences', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub;

    const prefs = await db.notificationPreference.findMany({ where: { userId } });

    // Return defaults for missing channels
    const result = CHANNELS.map((channel) => {
      const found = prefs.find((p) => p.channel === channel);
      return found ?? { userId, channel, enabled: true, config: {} };
    });

    return reply.send({ data: result });
  });

  // ── PATCH /notification-preferences/:userId ───────────────────────────────────
  app.patch('/preferences/:userId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { userId: targetUserId } = request.params as { userId: string };
    const requestUserId = request.user.sub;

    // Users can only update their own preferences (managers can update anyone's)
    if (targetUserId !== requestUserId) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Cannot update another user\'s preferences' } });
    }

    const body = z.object({
      email: z.object({ enabled: z.boolean() }).optional(),
      push: z.object({ enabled: z.boolean() }).optional(),
      whatsapp: z.object({ enabled: z.boolean() }).optional(),
    }).safeParse(request.body);
    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const updates: Array<Promise<unknown>> = [];

    for (const [channel, pref] of Object.entries(body.data) as Array<[NotificationChannel, { enabled: boolean } | undefined]>) {
      if (!pref) continue;
      updates.push(
        db.notificationPreference.upsert({
          where: { userId_channel: { userId: targetUserId, channel } },
          update: { enabled: pref.enabled },
          create: { userId: targetUserId, channel, enabled: pref.enabled },
        }),
      );
    }

    await Promise.all(updates);

    const prefs = await db.notificationPreference.findMany({ where: { userId: targetUserId } });
    return reply.send({ data: prefs });
  });

  // ── POST /notifications/subscribe ────────────────────────────────────────────
  app.post('/subscribe', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub;

    const body = z.object({
      subscription: z.object({
        endpoint: z.string().url(),
        keys: z.object({
          p256dh: z.string(),
          auth: z.string(),
        }),
      }),
    }).safeParse(request.body);
    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid subscription' } });

    // Store subscription in push notification preference config
    await db.notificationPreference.upsert({
      where: { userId_channel: { userId, channel: 'push' } },
      update: { enabled: true, config: body.data.subscription as object },
      create: { userId, channel: 'push', enabled: true, config: body.data.subscription as object },
    });

    return reply.status(201).send({ data: { subscribed: true } });
  });

  // ── POST /notifications/test ──────────────────────────────────────────────────
  app.post('/test', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = z.object({
      channel: z.enum(['email', 'push', 'whatsapp']),
      organizationId: z.string().uuid().optional(),
    }).safeParse(request.body);
    if (!body.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const userId = request.user.sub;
    const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, phone: true } });
    if (!user) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });

    const orgId = body.data.organizationId;
    let status = 'sent';
    let errorMessage: string | undefined;

    try {
      if (body.data.channel === 'email') {
        const { sendActivityAssigned } = await import('../../lib/mailer.js');
        await sendActivityAssigned({
          to: user.email,
          name: user.name,
          activityTitle: 'Notificação de teste — GymOps',
          assignerName: 'Sistema GymOps',
          activityId: 'test',
        });
      }

      if (body.data.channel === 'push') {
        const pref = await db.notificationPreference.findUnique({
          where: { userId_channel: { userId, channel: 'push' } },
        });
        if (pref?.config) {
          const { sendPushNotification } = await import('../../lib/push.js');
          await sendPushNotification(
            pref.config as { endpoint: string; keys: { p256dh: string; auth: string } },
            { title: 'GymOps', body: 'Notificação de teste funcionando!', url: '/' },
          );
        }
      }

      if (body.data.channel === 'whatsapp') {
        if (!user.phone) {
          return reply.status(422).send({ error: { code: 'PHONE_REQUIRED', message: 'Cadastre seu telefone no perfil para testar o WhatsApp' } });
        }
        if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM) {
          return reply.status(503).send({ error: { code: 'WHATSAPP_NOT_CONFIGURED', message: 'WhatsApp não configurado' } });
        }
        const { sendWhatsApp } = await import('../../lib/whatsapp.js');
        await sendWhatsApp(user.phone, 'GymOps: Notificação de teste via WhatsApp funcionando!');
      }
    } catch (e) {
      status = 'failed';
      errorMessage = String(e);
    }

    if (orgId) {
      await db.notificationDelivery.create({
        data: { userId, organizationId: orgId, channel: body.data.channel, type: 'test', status, ...(errorMessage ? { errorMessage } : {}) },
      }).catch(() => {});
    }

    if (status === 'failed') {
      return reply.status(502).send({ error: { code: 'DELIVERY_FAILED', message: errorMessage ?? 'Failed to send' } });
    }

    return reply.send({ data: { sent: true } });
  });

  // ── GET /notifications/deliveries ────────────────────────────────────────────
  app.get('/deliveries', { preHandler: [app.authenticate] }, async (request, reply) => {
    const query = z.object({
      organizationId: z.string().uuid().optional(),
      channel: z.enum(['email', 'push', 'whatsapp']).optional(),
      status: z.string().optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
      page: z.coerce.number().int().min(1).default(1),
    }).safeParse(request.query);

    if (!query.success)
      return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid query' } });

    const userId = request.user.sub;
    const { organizationId, channel, status, dateFrom, dateTo, page } = query.data;

    const LIMIT = 50;
    const isOrgAdmin = organizationId
      ? !!(await db.membership.findFirst({ where: { userId, organizationId, scopeType: 'organization', role: { in: ['owner', 'org_manager'] }, deletedAt: null } }))
      : false;

    const where = {
      ...(isOrgAdmin && organizationId ? { organizationId } : { userId }),
      ...(channel ? { channel } : {}),
      ...(status ? { status } : {}),
      ...(dateFrom || dateTo ? { createdAt: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } } : {}),
    };

    const [deliveries, total] = await Promise.all([
      db.notificationDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * LIMIT,
        take: LIMIT,
        select: { id: true, channel: true, type: true, status: true, errorMessage: true, createdAt: true, userId: true },
      }),
      db.notificationDelivery.count({ where }),
    ]);

    return reply.send({ data: deliveries, meta: { total, page, limit: LIMIT } });
  });
};
