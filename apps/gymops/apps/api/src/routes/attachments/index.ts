import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { resolveActivityPermission } from '../../lib/rbac.js';
import { env } from '../../env.js';

const ALLOWED_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/msword', // doc
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
]);

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

async function getR2Client() {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
    return null;
  }
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export const attachmentRoutes: FastifyPluginAsync = async (app) => {
  // ── POST /activities/:id/attachments/presign ─────────────────────────────────
  app.post('/activities/:id/attachments/presign', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: activityId } = request.params as { id: string };
    const userId = request.user.sub;

    const canView = await resolveActivityPermission({ userId, activityId, action: 'view' });
    if (!canView) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const body = z.object({
      filename: z.string().min(1).max(255),
      mimeType: z.string(),
      sizeBytes: z.number().int().positive(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    if (!ALLOWED_MIMES.has(body.data.mimeType)) {
      return reply.status(422).send({ error: { code: 'INVALID_MIME', message: 'File type not allowed' } });
    }
    if (body.data.sizeBytes > MAX_SIZE) {
      return reply.status(422).send({ error: { code: 'FILE_TOO_LARGE', message: 'Maximum file size is 10MB' } });
    }

    const r2 = await getR2Client();
    if (!r2) {
      // R2 not configured — return mock for dev
      const objectKey = `attachments/${activityId}/${Date.now()}-${body.data.filename}`;
      return reply.send({
        data: { uploadUrl: null, objectKey, expiresIn: 300, note: 'R2 not configured' },
      });
    }

    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const objectKey = `attachments/${activityId}/${Date.now()}-${body.data.filename}`;

    const uploadUrl = await getSignedUrl(
      r2,
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: objectKey,
        ContentType: body.data.mimeType,
        ContentLength: body.data.sizeBytes,
      }),
      { expiresIn: 300 },
    );

    return reply.send({ data: { uploadUrl, objectKey, expiresIn: 300 } });
  });

  // ── POST /activities/:id/attachments ─────────────────────────────────────────
  app.post('/activities/:id/attachments', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: activityId } = request.params as { id: string };
    const userId = request.user.sub;

    const canView = await resolveActivityPermission({ userId, activityId, action: 'view' });
    if (!canView) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const body = z.object({
      objectKey: z.string().min(1),
      filename: z.string().min(1).max(255),
      mimeType: z.string(),
      sizeBytes: z.number().int().positive().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const attachment = await db.activityAttachment.create({
      data: {
        activityId,
        objectKey: body.data.objectKey,
        filename: body.data.filename,
        mimeType: body.data.mimeType,
        sizeBytes: body.data.sizeBytes,
        uploadedBy: userId,
      },
    });

    await db.activityEvent.create({
      data: { activityId, actorId: userId, eventType: 'attached', payload: { filename: body.data.filename } },
    });

    return reply.status(201).send({ data: attachment });
  });

  // ── GET /activities/:id/attachments ──────────────────────────────────────────
  app.get('/activities/:id/attachments', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id: activityId } = request.params as { id: string };
    const userId = request.user.sub;

    const canView = await resolveActivityPermission({ userId, activityId, action: 'view' });
    if (!canView) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Activity not found' } });

    const attachments = await db.activityAttachment.findMany({
      where: { activityId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    // Generate presigned GET URLs if R2 is configured
    const r2 = await getR2Client();
    const enriched = await Promise.all(
      attachments.map(async (a) => {
        let downloadUrl: string | null = null;
        if (r2 && a.objectKey && env.R2_BUCKET_NAME) {
          const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
          const { GetObjectCommand } = await import('@aws-sdk/client-s3');
          downloadUrl = await getSignedUrl(
            r2,
            new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: a.objectKey }),
            { expiresIn: 3600 },
          );
        } else if (a.externalUrl) {
          downloadUrl = a.externalUrl;
        }
        return { ...a, downloadUrl };
      }),
    );

    return reply.send({ data: enriched });
  });

  // ── DELETE /attachments/:id ──────────────────────────────────────────────────
  app.delete('/attachments/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    const attachment = await db.activityAttachment.findUnique({ where: { id, deletedAt: null } });
    if (!attachment) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Attachment not found' } });

    const canEdit = await resolveActivityPermission({ userId, activityId: attachment.activityId, action: 'edit' });
    if (!canEdit) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    await db.activityAttachment.update({ where: { id }, data: { deletedAt: new Date() } });
    return reply.status(204).send();
  });
};
