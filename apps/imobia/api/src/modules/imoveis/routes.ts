// Modulo Imoveis (Captacao). CRUD org-scoped + endereco aninhado + busca semantica (pgvector,
// fail-soft para filtro textual) + embedding no write. Timeline registra cada etapa.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth, type Principal } from '../../lib/auth';
import { appendTimeline } from '../../lib/timeline';
import { embed, embeddingsAvailable, toVectorLiteral } from '../../ai/embeddings';

const addressSchema = z.object({
  street: z.string().optional(), number: z.string().optional(), complement: z.string().optional(),
  district: z.string().optional(), city: z.string().optional(), state: z.string().optional(), zip: z.string().optional(),
}).optional();

const baseFields = {
  purpose: z.enum(['venda', 'locacao', 'ambos']).default('venda'),
  type: z.enum(['apartamento', 'casa', 'terreno', 'comercial', 'rural', 'sala', 'galpao']).default('apartamento'),
  status: z.enum(['captacao', 'disponivel', 'reservado', 'vendido', 'locado', 'inativo']).optional(),
  title: z.string().min(3),
  description: z.string().optional(),
  priceSale: z.number().nonnegative().optional(),
  priceRent: z.number().nonnegative().optional(),
  condoFee: z.number().nonnegative().optional(),
  iptu: z.number().nonnegative().optional(),
  areaTotal: z.number().nonnegative().optional(),
  areaUsable: z.number().nonnegative().optional(),
  bedrooms: z.number().int().min(0).default(0),
  bathrooms: z.number().int().min(0).default(0),
  parking: z.number().int().min(0).default(0),
  ownerId: z.string().optional(),
  address: addressSchema,
};
const createSchema = z.object(baseFields);
const updateSchema = z.object(baseFields).partial();

const INCLUDE = { owner: true, address: true, photos: { orderBy: { order: 'asc' as const } } };

function embedText(p: any): string {
  const a = p.address || {};
  return [p.title, p.description, p.type, p.purpose, `${p.bedrooms} quartos`, `${p.bathrooms} banheiros`,
    a.district, a.city, a.state].filter(Boolean).join(' | ');
}

async function reembed(id: string) {
  if (!embeddingsAvailable()) return;
  const p = await prisma.property.findUnique({ where: { id }, include: { address: true } });
  if (!p) return;
  const vec = await embed(embedText(p));
  if (!vec) return;
  try {
    await prisma.$executeRawUnsafe(`UPDATE properties SET embedding = $1::vector WHERE id = $2`, toVectorLiteral(vec), id);
  } catch (err) {
    console.error('[imobia] reembed falhou (fail-soft):', (err as Error).message);
  }
}

export async function imoveisRoutes(app: FastifyInstance): Promise<void> {
  app.get('/imoveis', { preHandler: requireAuth }, async (req) => {
    const p = (req as any).principal as Principal;
    const q = req.query as Record<string, string>;
    const where: any = { organizationId: p.organizationId };
    if (q.status) where.status = q.status;
    if (q.purpose) where.purpose = q.purpose;
    if (q.q) where.OR = [{ title: { contains: q.q, mode: 'insensitive' } }, { code: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }];
    const [data, total] = await Promise.all([
      prisma.property.findMany({ where, include: INCLUDE, orderBy: { createdAt: 'desc' }, take: Math.min(Number(q.take) || 60, 200) }),
      prisma.property.count({ where }),
    ]);
    return { data, total, semantic: embeddingsAvailable() };
  });

  // Busca semantica: com OPENAI_API_KEY usa pgvector; senao cai p/ ILIKE (fail-soft).
  app.post('/imoveis/search', { preHandler: requireAuth }, async (req) => {
    const p = (req as any).principal as Principal;
    const { query, k } = z.object({ query: z.string().min(1), k: z.number().int().min(1).max(50).optional() }).parse(req.body);
    const limit = k || 12;
    const vec = await embed(query);
    if (vec) {
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, 1 - (embedding <=> $1::vector) AS similarity FROM properties
         WHERE organization_id = $2 AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector LIMIT $3`,
        toVectorLiteral(vec), p.organizationId, limit,
      );
      const ids = rows.map((r) => r.id);
      const props = await prisma.property.findMany({ where: { id: { in: ids } }, include: INCLUDE });
      const byId = new Map(props.map((x) => [x.id, x]));
      return { data: rows.map((r) => ({ ...byId.get(r.id), similarity: Number(r.similarity) })).filter((x) => x.id), mode: 'semantic' };
    }
    const data = await prisma.property.findMany({
      where: { organizationId: p.organizationId, OR: [{ title: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] },
      include: INCLUDE, take: limit,
    });
    return { data, mode: 'text' };
  });

  app.get('/imoveis/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const row = await prisma.property.findFirst({ where: { id, organizationId: p.organizationId }, include: { ...INCLUDE, interests: { include: { lead: true } } } });
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const timeline = await prisma.timelineEntry.findMany({ where: { organizationId: p.organizationId, entityType: 'property', entityId: id }, orderBy: { createdAt: 'desc' }, take: 30 });
    return { data: row, timeline };
  });

  app.post('/imoveis', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const body = createSchema.parse(req.body);
    const { address, ownerId, ...rest } = body;
    const code = `IM-${Date.now().toString(36).slice(-5).toUpperCase()}`;
    const row = await prisma.property.create({
      data: {
        ...rest, code, organizationId: p.organizationId,
        ...(ownerId ? { owner: { connect: { id: ownerId } } } : {}),
        ...(address ? { address: { create: address } } : {}),
      },
      include: INCLUDE,
    });
    await appendTimeline({ organizationId: p.organizationId, entityType: 'property', entityId: row.id, kind: 'status_change', actorType: 'human', actorUserId: p.userId, title: `Imóvel captado (${code})`, summary: row.title });
    reembed(row.id).catch(() => {});
    return reply.code(201).send({ data: row });
  });

  app.put('/imoveis/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const existing = await prisma.property.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    const body = updateSchema.parse(req.body);
    const { address, ownerId, ...rest } = body;
    const row = await prisma.property.update({
      where: { id },
      data: {
        ...rest,
        ...(ownerId !== undefined ? { owner: ownerId ? { connect: { id: ownerId } } : { disconnect: true } } : {}),
        ...(address ? { address: { upsert: { create: address, update: address } } } : {}),
      },
      include: INCLUDE,
    });
    if (rest.status && rest.status !== existing.status) {
      await appendTimeline({ organizationId: p.organizationId, entityType: 'property', entityId: id, kind: 'status_change', actorType: 'human', actorUserId: p.userId, title: `Status → ${rest.status}` });
    }
    reembed(id).catch(() => {});
    return { data: row };
  });

  app.delete('/imoveis/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const existing = await prisma.property.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    await prisma.property.delete({ where: { id } });
    return reply.code(204).send();
  });

  // Proprietarios (owners) — CRUD enxuto p/ o select do formulario.
  app.get('/owners', { preHandler: requireAuth }, async (req) => {
    const p = (req as any).principal as Principal;
    return { data: await prisma.owner.findMany({ where: { organizationId: p.organizationId }, orderBy: { name: 'asc' } }) };
  });
  app.post('/owners', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const body = z.object({ name: z.string().min(2), cpfCnpj: z.string().optional(), phone: z.string().optional(), email: z.string().optional(), notes: z.string().optional() }).parse(req.body);
    const row = await prisma.owner.create({ data: { ...body, organizationId: p.organizationId } });
    return reply.code(201).send({ data: row });
  });
}
