import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../lib/prisma.js';
import { hasOrgRole } from '../../lib/rbac.js';
import { enqueueImport } from '../../lib/queues.js';
import { generatePreview, commitImport, fetchTrelloBoard } from '../../imports/trello/processor.js';
import { decrypt } from '../../lib/crypto.js';
import type { TrelloBoard, ImportMapping } from '../../imports/trello/processor.js';
import { Prisma } from '@gymops/db';

async function assertImportAccess(jobId: string, userId: string) {
  const job = await db.importJob.findUnique({ where: { id: jobId } });
  if (!job) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Import job not found' };
  const member = await db.membership.findFirst({
    where: { userId, organizationId: job.organizationId, deletedAt: null },
  });
  if (!member) throw { statusCode: 403, code: 'FORBIDDEN', message: 'Forbidden' };
  return job;
}

export const importRoutes: FastifyPluginAsync = async (app) => {
  // ── POST /imports/json ────────────────────────────────────────────────────────
  // Body: { organizationId, boardData: TrelloBoard }
  app.post('/json', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub;
    const body = z.object({
      organizationId: z.string().uuid(),
      boardData: z.record(z.unknown()),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const isAdmin = await hasOrgRole(userId, body.data.organizationId, ['owner', 'org_manager']);
    if (!isAdmin) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const board = body.data.boardData as unknown as TrelloBoard;
    if (!board.id || !board.name) {
      return reply.status(422).send({ error: { code: 'INVALID_FORMAT', message: 'Not a valid Trello board export' } });
    }

    const importJob = await db.importJob.create({
      data: {
        organizationId: body.data.organizationId,
        provider: 'json_upload',
        status: 'processing',
        source: { mode: 'json', boards: [board] } as unknown as Prisma.InputJsonValue,
        createdBy: userId,
      },
    });

    // Try queue; fall back to inline processing
    const enqueued = await enqueueImport({ type: 'dry_run', importJobId: importJob.id }).then(() => true).catch(() => false);
    if (!enqueued) {
      // Run inline
      try {
        const preview = generatePreview([board]);
        await db.importJob.update({
          where: { id: importJob.id },
          data: { status: 'awaiting_review', summary: { phase: 'preview', ...preview } as unknown as Prisma.InputJsonValue },
        });
      } catch (e) {
        await db.importJob.update({
          where: { id: importJob.id },
          data: { status: 'failed', summary: { phase: 'error', message: String(e) } as unknown as Prisma.InputJsonValue },
        });
      }
    }

    return reply.status(202).send({ data: importJob });
  });

  // ── POST /imports/api ─────────────────────────────────────────────────────────
  // Body: { organizationId, integrationAccountId, boardIds: string[] }
  app.post('/api', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub;
    const body = z.object({
      organizationId: z.string().uuid(),
      integrationAccountId: z.string().uuid(),
      boardIds: z.array(z.string()).min(1).max(10),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } });

    const isAdmin = await hasOrgRole(userId, body.data.organizationId, ['owner', 'org_manager']);
    if (!isAdmin) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    const account = await db.integrationAccount.findUnique({
      where: { id: body.data.integrationAccountId, revokedAt: null },
    });
    if (!account) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Integration not found' } });

    const importJob = await db.importJob.create({
      data: {
        organizationId: body.data.organizationId,
        integrationAccountId: body.data.integrationAccountId,
        provider: 'trello_api',
        status: 'processing',
        source: { mode: 'api', boardIds: body.data.boardIds } as unknown as Prisma.InputJsonValue,
        createdBy: userId,
      },
    });

    // Try queue; fall back to inline
    const enqueued = await enqueueImport({ type: 'dry_run', importJobId: importJob.id }).then(() => true).catch(() => false);
    if (!enqueued) {
      setImmediate(async () => {
        try {
          const { apiKey, token } = JSON.parse(decrypt(account.auth as string)) as { apiKey: string; token: string };
          const boards: TrelloBoard[] = await Promise.all(
            body.data.boardIds.map((id) => fetchTrelloBoard(id, apiKey, token)),
          );
          const preview = generatePreview(boards);
          await db.importJob.update({
            where: { id: importJob.id },
            data: {
              status: 'awaiting_review',
              source: { mode: 'api', boardIds: body.data.boardIds, boards } as unknown as Prisma.InputJsonValue,
              summary: { phase: 'preview', ...preview } as unknown as Prisma.InputJsonValue,
            },
          });
        } catch (e) {
          await db.importJob.update({
            where: { id: importJob.id },
            data: { status: 'failed', summary: { phase: 'error', message: String(e) } as unknown as Prisma.InputJsonValue },
          });
        }
      });
    }

    return reply.status(202).send({ data: importJob });
  });

  // ── GET /imports ──────────────────────────────────────────────────────────────
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.sub;
    const { organizationId } = z.object({ organizationId: z.string().uuid() }).parse(request.query);
    const member = await db.membership.findFirst({ where: { userId, organizationId, deletedAt: null } });
    if (!member) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    const jobs = await db.importJob.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, provider: true, status: true, summary: true, createdAt: true, updatedAt: true },
    });
    return reply.send({ data: jobs });
  });

  // ── GET /imports/:id ──────────────────────────────────────────────────────────
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try { await assertImportAccess(id, request.user.sub); } catch (e: unknown) {
      const err = e as { statusCode: number; code: string; message: string };
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    const job = await db.importJob.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } },
    });
    if (!job) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Import job not found' } });
    return reply.send({ data: job });
  });

  // ── GET /imports/:id/preview ──────────────────────────────────────────────────
  app.get('/:id/preview', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try { await assertImportAccess(id, request.user.sub); } catch (e: unknown) {
      const err = e as { statusCode: number; code: string; message: string };
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    const job = await db.importJob.findUnique({ where: { id }, select: { summary: true, status: true, mapping: true } });
    if (!job) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Import job not found' } });
    if (job.status === 'processing' || job.status === 'pending') {
      return reply.status(202).send({ data: { status: job.status } });
    }
    return reply.send({ data: { preview: job.summary, mapping: job.mapping } });
  });

  // ── PATCH /imports/:id/mapping ────────────────────────────────────────────────
  app.patch('/:id/mapping', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z.object({
      boards: z.array(z.object({
        trelloBoardId: z.string(),
        targetUnitId: z.string().uuid().nullable(),
        targetUnitName: z.string().min(1),
        lists: z.array(z.object({
          trelloListId: z.string(),
          type: z.enum(['area', 'ignore']),
          value: z.string().nullable(),
        })),
      })),
    }).safeParse(request.body);
    if (!body.success) return reply.status(422).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid mapping' } });

    let job: Awaited<ReturnType<typeof assertImportAccess>>;
    try { job = await assertImportAccess(id, request.user.sub); } catch (e: unknown) {
      const err = e as { statusCode: number; code: string; message: string };
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    if (job.status !== 'awaiting_review') {
      return reply.status(409).send({ error: { code: 'WRONG_STATE', message: 'Import is not awaiting review' } });
    }

    await db.importJob.update({ where: { id }, data: { mapping: body.data as unknown as Prisma.InputJsonValue } });
    return reply.send({ data: { ok: true } });
  });

  // ── POST /imports/:id/commit ──────────────────────────────────────────────────
  app.post('/:id/commit', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    let job: Awaited<ReturnType<typeof assertImportAccess>>;
    try { job = await assertImportAccess(id, userId); } catch (e: unknown) {
      const err = e as { statusCode: number; code: string; message: string };
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    if (job.status !== 'awaiting_review') {
      return reply.status(409).send({ error: { code: 'WRONG_STATE', message: 'Import is not ready to commit' } });
    }

    const mapping = job.mapping as unknown as ImportMapping;
    if (!mapping?.boards?.length) {
      return reply.status(422).send({ error: { code: 'NO_MAPPING', message: 'No mapping defined — review the wizard first' } });
    }

    await db.importJob.update({
      where: { id },
      data: { status: 'processing', summary: { phase: 'processing' } as unknown as Prisma.InputJsonValue },
    });

    // Try queue; fall back to inline (setImmediate so response is sent first)
    const enqueued = await enqueueImport({ type: 'commit', importJobId: id }).then(() => true).catch(() => false);
    if (!enqueued) {
      setImmediate(async () => {
        try {
          const source = job.source as unknown as { mode: string; boards?: TrelloBoard[]; boardIds?: string[] };
          let boards: TrelloBoard[] = [];

          if (source.mode === 'json' && source.boards) {
            boards = source.boards;
          } else if (source.mode === 'api' || source.mode === 'trello_api') {
            if (source.boards) {
              boards = source.boards;
            } else if (job.integrationAccountId) {
              const account = await db.integrationAccount.findUnique({ where: { id: job.integrationAccountId } });
              if (account) {
                const { apiKey, token } = JSON.parse(decrypt(account.auth as string)) as { apiKey: string; token: string };
                boards = await Promise.all((source.boardIds ?? []).map((bid) => fetchTrelloBoard(bid, apiKey, token)));
              }
            }
          }

          const result = await commitImport(boards, mapping, id, job.organizationId, userId);
          await db.importJob.update({
            where: { id },
            data: { status: 'committed', summary: { phase: 'result', ...result } as unknown as Prisma.InputJsonValue },
          });
        } catch (e) {
          await db.importJob.update({
            where: { id },
            data: { status: 'failed', summary: { phase: 'error', message: String(e) } as unknown as Prisma.InputJsonValue },
          });
        }
      });
    }

    return reply.status(202).send({ data: { status: 'processing' } });
  });

  // ── GET /imports/:id/items ────────────────────────────────────────────────────
  app.get('/:id/items', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = z.object({
      status: z.enum(['pending', 'mapped', 'skipped', 'failed']).optional(),
      page: z.coerce.number().int().min(1).default(1),
    }).safeParse(request.query);

    try { await assertImportAccess(id, request.user.sub); } catch (e: unknown) {
      const err = e as { statusCode: number; code: string; message: string };
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }

    const LIMIT = 50;
    const page = query.success ? query.data.page : 1;
    const statusFilter = query.success ? query.data.status : undefined;

    const [items, total] = await Promise.all([
      db.importItem.findMany({
        where: { importJobId: id, ...(statusFilter ? { status: statusFilter } : {}) },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * LIMIT,
        take: LIMIT,
      }),
      db.importItem.count({ where: { importJobId: id, ...(statusFilter ? { status: statusFilter } : {}) } }),
    ]);

    return reply.send({ data: items, meta: { total, page, limit: LIMIT } });
  });

  // ── POST /imports/:id/retry ───────────────────────────────────────────────────
  app.post('/:id/retry', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    let job: Awaited<ReturnType<typeof assertImportAccess>>;
    try { job = await assertImportAccess(id, userId); } catch (e: unknown) {
      const err = e as { statusCode: number; code: string; message: string };
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }

    if (job.status !== 'failed') {
      return reply.status(409).send({ error: { code: 'WRONG_STATE', message: 'Only failed imports can be retried' } });
    }

    const isAdmin = await hasOrgRole(userId, job.organizationId, ['owner', 'org_manager']);
    if (!isAdmin) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    await db.importJob.update({
      where: { id },
      data: { status: 'awaiting_review', summary: { phase: 'preview', message: 'Retrying...' } as unknown as Prisma.InputJsonValue },
    });

    return reply.send({ data: { status: 'awaiting_review' } });
  });

  // ── POST /imports/:id/cancel ──────────────────────────────────────────────────
  app.post('/:id/cancel', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.sub;

    let job: Awaited<ReturnType<typeof assertImportAccess>>;
    try { job = await assertImportAccess(id, userId); } catch (e: unknown) {
      const err = e as { statusCode: number; code: string; message: string };
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }

    if (!['pending', 'processing', 'awaiting_review'].includes(job.status)) {
      return reply.status(409).send({ error: { code: 'WRONG_STATE', message: 'Cannot cancel import in current state' } });
    }

    const isAdmin = await hasOrgRole(userId, job.organizationId, ['owner', 'org_manager']);
    if (!isAdmin) return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });

    await db.importJob.update({ where: { id }, data: { status: 'failed', summary: { phase: 'error', message: 'Cancelled by user' } as unknown as Prisma.InputJsonValue } });

    return reply.status(204).send();
  });
};
