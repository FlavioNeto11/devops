// Modulo Clientes/Leads. CRUD org-scoped + scoring por IA (GPT/logica, fail-soft) +
// vinculo lead<->imovel (interesse). Timeline registra o score gerado pela IA.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth, type Principal } from '../../lib/auth';
import { appendTimeline } from '../../lib/timeline';
import { callSpecialist } from '../../ai/engine';

const baseFields = {
  name: z.string().min(2),
  cpfCnpj: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  interest: z.enum(['compra', 'locacao', 'ambos']).default('compra'),
  stage: z.enum(['novo', 'qualificando', 'qualificado', 'negociando', 'fechado', 'perdido']).optional(),
  budgetMin: z.number().nonnegative().optional(),
  budgetMax: z.number().nonnegative().optional(),
  sourceChannel: z.string().optional(),
  notes: z.string().optional(),
};
const createSchema = z.object(baseFields);
const updateSchema = z.object(baseFields).partial();

export async function leadsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/leads', { preHandler: requireAuth }, async (req) => {
    const p = (req as any).principal as Principal;
    const q = req.query as Record<string, string>;
    const where: any = { organizationId: p.organizationId };
    if (q.stage) where.stage = q.stage;
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q, mode: 'insensitive' } }];
    const [data, total] = await Promise.all([
      prisma.lead.findMany({ where, orderBy: [{ score: 'desc' }, { createdAt: 'desc' }], take: Math.min(Number(q.take) || 80, 200) }),
      prisma.lead.count({ where }),
    ]);
    return { data, total };
  });

  app.get('/leads/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const row = await prisma.lead.findFirst({ where: { id, organizationId: p.organizationId }, include: { interests: { include: { property: true } } } });
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const timeline = await prisma.timelineEntry.findMany({ where: { organizationId: p.organizationId, entityType: 'lead', entityId: id }, orderBy: { createdAt: 'desc' }, take: 30 });
    return { data: row, timeline };
  });

  app.post('/leads', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const body = createSchema.parse(req.body);
    const row = await prisma.lead.create({ data: { ...body, organizationId: p.organizationId } });
    await appendTimeline({ organizationId: p.organizationId, entityType: 'lead', entityId: row.id, kind: 'note', actorType: 'human', actorUserId: p.userId, title: 'Lead cadastrado', summary: row.name });
    return reply.code(201).send({ data: row });
  });

  app.put('/leads/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const existing = await prisma.lead.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    const body = updateSchema.parse(req.body);
    const row = await prisma.lead.update({ where: { id }, data: body });
    if (body.stage && body.stage !== existing.stage) {
      await appendTimeline({ organizationId: p.organizationId, entityType: 'lead', entityId: id, kind: 'status_change', actorType: 'human', actorUserId: p.userId, title: `Estágio → ${body.stage}` });
    }
    return { data: row };
  });

  app.delete('/leads/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const existing = await prisma.lead.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    await prisma.lead.delete({ where: { id } });
    return reply.code(204).send();
  });

  // Lead scoring por IA (GPT). Fail-soft: sem chave, retorna dormant sem alterar o lead.
  app.post('/leads/:id/score', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const lead = await prisma.lead.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!lead) return reply.code(404).send({ error: 'not_found' });

    const prompt =
      `Avalie o potencial (0-100) deste lead imobiliário e explique em 1 frase. Responda JSON ` +
      `{"score":<0-100>,"reason":"<curto>","stage":"novo|qualificando|qualificado|negociando"}.\n` +
      `Lead: nome=${lead.name}; interesse=${lead.interest}; orçamento=${lead.budgetMin ?? '?'}-${lead.budgetMax ?? '?'}; ` +
      `canal=${lead.sourceChannel ?? '?'}; notas=${lead.notes ?? '-'}.`;
    const out = await callSpecialist('logica', { user: prompt, jsonMode: true, maxTokens: 250 });
    if (!out) return { dormant: true, message: 'IA dormente — configure OPENAI_API_KEY para lead scoring.' };

    let parsed: any = {};
    try { parsed = JSON.parse(out.text || '{}'); } catch { parsed = {}; }
    const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
    const reason = String(parsed.reason || '').slice(0, 400);
    const stage = ['novo', 'qualificando', 'qualificado', 'negociando'].includes(parsed.stage) ? parsed.stage : undefined;
    const updated = await prisma.lead.update({ where: { id }, data: { score, scoreReason: reason, ...(stage ? { stage } : {}) } });
    await appendTimeline({ organizationId: p.organizationId, entityType: 'lead', entityId: id, kind: 'ai_output', actorType: 'gpt', title: `IA pontuou o lead: ${score}/100`, summary: reason, payload: { model: out.model } });
    return { data: updated, score, reason, model: out.model, costUsd: out.costUsd };
  });

  // Vincular imovel de interesse ao lead.
  app.post('/leads/:id/interesse', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const { propertyId, note } = z.object({ propertyId: z.string(), note: z.string().optional() }).parse(req.body);
    const [lead, prop] = await Promise.all([
      prisma.lead.findFirst({ where: { id, organizationId: p.organizationId } }),
      prisma.property.findFirst({ where: { id: propertyId, organizationId: p.organizationId } }),
    ]);
    if (!lead || !prop) return reply.code(404).send({ error: 'not_found' });
    const row = await prisma.leadPropertyInterest.upsert({
      where: { leadId_propertyId: { leadId: id, propertyId } },
      create: { leadId: id, propertyId, note },
      update: { note },
    });
    return reply.code(201).send({ data: row });
  });
}
