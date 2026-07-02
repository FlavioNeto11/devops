// Fabrica de rotas CRUD org-scoped (reutilizada por todos os modulos). Aplica requireAuth,
// isolamento por organizationId e RBAC por papel nas mutacoes. Envelope { data } / { data, total }.
import type { FastifyInstance } from 'fastify';
import type { ZodSchema } from 'zod';
import type { MembershipRole } from '@prisma/client';
import { requireAuth, requireRole, type Principal } from './auth';

export interface CrudOptions {
  resource: string; // caminho REST (ex.: 'imoveis')
  model: any; // delegate do Prisma (ex.: prisma.property)
  createSchema: ZodSchema;
  updateSchema: ZodSchema;
  writeRoles?: MembershipRole[]; // papeis que podem criar/editar/excluir (default: todos autenticados)
  include?: Record<string, unknown>; // include do Prisma p/ get/list
  orderBy?: Record<string, unknown>;
  searchFields?: string[]; // campos p/ filtro ?q= (contains, case-insensitive)
  /** transforma o body de criacao antes de persistir (injeta org, deriva campos). */
  onCreate?: (data: any, principal: Principal) => any;
  /** efeito colateral apos criar (ex.: enfileirar embedding, timeline). */
  afterWrite?: (row: any, principal: Principal, action: 'create' | 'update') => Promise<void>;
}

export function registerCrud(app: FastifyInstance, opts: CrudOptions): void {
  const { resource, model } = opts;
  const writeGuard = opts.writeRoles ? [requireAuth, requireRole(...opts.writeRoles)] : [requireAuth];

  // LIST
  app.get(`/${resource}`, { preHandler: requireAuth }, async (req) => {
    const p = (req as any).principal as Principal;
    const query = req.query as Record<string, string>;
    const where: any = { organizationId: p.organizationId };
    if (query.q && opts.searchFields?.length) {
      where.OR = opts.searchFields.map((f) => ({ [f]: { contains: query.q, mode: 'insensitive' } }));
    }
    for (const key of Object.keys(query)) {
      if (['q', 'skip', 'take'].includes(key)) continue;
      // filtros exatos por campo (?status=disponivel)
      where[key] = query[key];
    }
    const take = Math.min(Number(query.take) || 50, 200);
    const skip = Number(query.skip) || 0;
    const [rows, total] = await Promise.all([
      model.findMany({ where, include: opts.include, orderBy: opts.orderBy || { createdAt: 'desc' }, take, skip }),
      model.count({ where }),
    ]);
    return { data: rows, total };
  });

  // GET :id
  app.get(`/${resource}/:id`, { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const row = await model.findFirst({ where: { id, organizationId: p.organizationId }, include: opts.include });
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return { data: row };
  });

  // CREATE
  app.post(`/${resource}`, { preHandler: writeGuard }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const body = opts.createSchema.parse(req.body);
    let data: any = { ...body, organizationId: p.organizationId };
    if (opts.onCreate) data = opts.onCreate(data, p);
    const row = await model.create({ data, include: opts.include });
    if (opts.afterWrite) await opts.afterWrite(row, p, 'create');
    return reply.code(201).send({ data: row });
  });

  // UPDATE
  app.put(`/${resource}/:id`, { preHandler: writeGuard }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const body = opts.updateSchema.parse(req.body);
    const existing = await model.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    const row = await model.update({ where: { id }, data: body, include: opts.include });
    if (opts.afterWrite) await opts.afterWrite(row, p, 'update');
    return { data: row };
  });

  // DELETE
  app.delete(`/${resource}/:id`, { preHandler: writeGuard }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const existing = await model.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    await model.delete({ where: { id } });
    return reply.code(204).send();
  });
}
