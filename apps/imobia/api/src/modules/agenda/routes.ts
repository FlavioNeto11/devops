// Modulo Agenda/Eventos. CRUD + interpretacao de linguagem natural (GPT/logica, fail-soft):
// "agendar visita com Joao amanha 15h" -> compromisso estruturado.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth, type Principal } from '../../lib/auth';
import { appendTimeline } from '../../lib/timeline';
import { callSpecialist } from '../../ai/engine';

const KINDS = ['visita', 'vistoria', 'renovacao', 'reuniao', 'assinatura'] as const;
const baseFields = {
  kind: z.enum(KINDS).default('visita'),
  status: z.enum(['agendado', 'confirmado', 'concluido', 'cancelado']).optional(),
  title: z.string().min(2),
  startAt: z.string(),
  endAt: z.string().optional(),
  propertyId: z.string().optional(),
  leadId: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
};
const createSchema = z.object(baseFields);
const updateSchema = z.object(baseFields).partial();

export async function agendaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/agenda', { preHandler: requireAuth }, async (req) => {
    const p = (req as any).principal as Principal;
    const q = req.query as Record<string, string>;
    const where: any = { organizationId: p.organizationId };
    if (q.status) where.status = q.status;
    if (q.from || q.to) where.startAt = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) };
    return { data: await prisma.appointment.findMany({ where, orderBy: { startAt: 'asc' }, take: 200 }) };
  });

  app.post('/agenda', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const b = createSchema.parse(req.body);
    const row = await prisma.appointment.create({ data: { ...b, startAt: new Date(b.startAt), endAt: b.endAt ? new Date(b.endAt) : null, organizationId: p.organizationId } });
    await appendTimeline({ organizationId: p.organizationId, entityType: 'appointment', entityId: row.id, kind: 'appointment', actorType: 'human', actorUserId: p.userId, title: `Agendado: ${row.title}` });
    return reply.code(201).send({ data: row });
  });

  app.put('/agenda/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const existing = await prisma.appointment.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    const b = updateSchema.parse(req.body);
    const data: any = { ...b };
    if (b.startAt) data.startAt = new Date(b.startAt);
    if (b.endAt) data.endAt = new Date(b.endAt);
    return { data: await prisma.appointment.update({ where: { id }, data }) };
  });

  app.delete('/agenda/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const existing = await prisma.appointment.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    await prisma.appointment.delete({ where: { id } });
    return reply.code(204).send();
  });

  // Linguagem natural -> compromisso (GPT). Fail-soft: sem chave, retorna dormant.
  app.post('/agenda/parse', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { text } = z.object({ text: z.string().min(3) }).parse(req.body);
    const now = new Date().toISOString();
    const prompt =
      `Hoje é ${now}. Extraia UM compromisso do texto e responda JSON ` +
      `{"title":"","kind":"visita|vistoria|renovacao|reuniao|assinatura","startAt":"ISO-8601","location":"","notes":""}.\n` +
      `Texto: "${text}"`;
    const out = await callSpecialist('logica', { user: prompt, jsonMode: true, maxTokens: 250 });
    if (!out) return { dormant: true, message: 'IA dormente — configure OPENAI_API_KEY para interpretar texto.' };
    let parsed: any = {};
    try { parsed = JSON.parse(out.text || '{}'); } catch { parsed = {}; }
    if (!parsed.title || !parsed.startAt) return reply.code(422).send({ error: 'parse_failed', raw: out.text });
    const kind = KINDS.includes(parsed.kind) ? parsed.kind : 'visita';
    const row = await prisma.appointment.create({
      data: { organizationId: p.organizationId, title: String(parsed.title).slice(0, 200), kind, startAt: new Date(parsed.startAt), location: parsed.location || null, notes: parsed.notes || null, createdByAi: true },
    });
    await appendTimeline({ organizationId: p.organizationId, entityType: 'appointment', entityId: row.id, kind: 'appointment', actorType: 'gpt', title: `IA agendou: ${row.title}`, summary: text });
    return reply.code(201).send({ data: row, model: out.model });
  });
}
