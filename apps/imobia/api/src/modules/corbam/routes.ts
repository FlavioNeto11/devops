// Modulo Corbam/COBAN (correspondente bancario). Casos de recuperacao de credito (limpa nome,
// score, rating). Restricoes (Gemini le Serasa via Documentos), simulacao de parcelas (deterministica
// -> mais confiavel que LLM p/ matematica), cartas de contestacao/acordo (Claude, fail-soft).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth, type Principal } from '../../lib/auth';
import { appendTimeline } from '../../lib/timeline';
import { callSpecialist } from '../../ai/engine';

/** Price (Tabela Price): valor da parcela para principal, taxa mensal e n parcelas. */
function priceInstallment(principal: number, monthlyRate: number, n: number): number {
  if (monthlyRate <= 0) return principal / n;
  const f = Math.pow(1 + monthlyRate, n);
  return (principal * monthlyRate * f) / (f - 1);
}

export async function corbamRoutes(app: FastifyInstance): Promise<void> {
  app.get('/corbam', { preHandler: requireAuth }, async (req) => {
    const p = (req as any).principal as Principal;
    const q = req.query as Record<string, string>;
    const where: any = { organizationId: p.organizationId };
    if (q.status) where.status = q.status;
    return { data: await prisma.corbamCase.findMany({ where, include: { restrictions: true }, orderBy: { createdAt: 'desc' }, take: 100 }) };
  });

  app.post('/corbam', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const b = z.object({ personName: z.string().min(2), cpf: z.string().optional(), goal: z.enum(['limpa_nome', 'score', 'rating']).default('limpa_nome'), leadId: z.string().optional(), currentScore: z.number().int().optional(), targetScore: z.number().int().optional() }).parse(req.body);
    const row = await prisma.corbamCase.create({ data: { ...b, organizationId: p.organizationId, assignedTo: p.userId } });
    await appendTimeline({ organizationId: p.organizationId, entityType: 'corbam', entityId: row.id, kind: 'corbam', actorType: 'human', actorUserId: p.userId, title: `Caso Corbam aberto (${b.goal})`, summary: b.personName });
    return reply.code(201).send({ data: row });
  });

  app.get('/corbam/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const row = await prisma.corbamCase.findFirst({ where: { id, organizationId: p.organizationId }, include: { restrictions: true, simulations: { orderBy: { createdAt: 'desc' } }, letters: { orderBy: { createdAt: 'desc' } } } });
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const timeline = await prisma.timelineEntry.findMany({ where: { organizationId: p.organizationId, entityType: 'corbam', entityId: id }, orderBy: { createdAt: 'desc' }, take: 30 });
    return { data: row, timeline };
  });

  app.put('/corbam/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const existing = await prisma.corbamCase.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    const b = z.object({ status: z.enum(['aberto', 'analisando', 'proposta', 'acordo', 'concluido', 'arquivado']).optional(), currentScore: z.number().int().optional(), rating: z.string().optional() }).parse(req.body);
    return { data: await prisma.corbamCase.update({ where: { id }, data: b }) };
  });

  app.post('/corbam/:id/restricoes', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const c = await prisma.corbamCase.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!c) return reply.code(404).send({ error: 'not_found' });
    const b = z.object({ bureau: z.string().default('serasa'), creditor: z.string().min(1), amount: z.number(), type: z.string().optional() }).parse(req.body);
    return reply.code(201).send({ data: await prisma.corbamRestriction.create({ data: { caseId: id, ...b } }) });
  });

  // Simulacao de parcelas (deterministica — Tabela Price). taxa em % ao mes.
  app.post('/corbam/:id/simular', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const c = await prisma.corbamCase.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!c) return reply.code(404).send({ error: 'not_found' });
    const b = z.object({ principal: z.number().positive(), installments: z.number().int().positive(), interestRate: z.number().min(0), scenarioLabel: z.string().optional() }).parse(req.body);
    const rate = b.interestRate / 100;
    const inst = Math.round(priceInstallment(b.principal, rate, b.installments) * 100) / 100;
    const total = Math.round(inst * b.installments * 100) / 100;
    const row = await prisma.corbamSimulation.create({ data: { caseId: id, principal: b.principal, installments: b.installments, interestRate: b.interestRate, installmentValue: inst, totalValue: total, scenarioLabel: b.scenarioLabel || `${b.installments}x` } });
    await appendTimeline({ organizationId: p.organizationId, entityType: 'corbam', entityId: id, kind: 'corbam', actorType: 'system', actorUserId: p.userId, title: `Simulação: ${b.installments}x de R$ ${inst}`, summary: `total R$ ${total}` });
    return reply.code(201).send({ data: row });
  });

  // Carta de contestacao/acordo (Claude, fail-soft).
  app.post('/corbam/:id/carta', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const c = await prisma.corbamCase.findFirst({ where: { id, organizationId: p.organizationId }, include: { restrictions: true } });
    if (!c) return reply.code(404).send({ error: 'not_found' });
    const kind = z.object({ kind: z.enum(['contestacao', 'acordo', 'proposta']).default('contestacao') }).parse(req.body).kind;
    const restr = c.restrictions.map((r) => `- ${r.creditor}: R$ ${r.amount} (${r.bureau})`).join('\n') || '(sem restrições cadastradas)';
    const out = await callSpecialist('escrita', {
      user: `Redija uma carta de ${kind} para recuperação de crédito, em pt-BR formal, para ${c.personName} (objetivo: ${c.goal}). Restrições:\n${restr}\nInclua saudação, fundamentação e fecho. Deixe claro que requer revisão jurídica.`,
      maxTokens: 1200,
    });
    if (!out) return { dormant: true, message: 'IA dormente — configure ANTHROPIC_API_KEY para redigir cartas.' };
    const row = await prisma.corbamLetter.create({ data: { caseId: id, kind, bodyText: out.text } });
    await appendTimeline({ organizationId: p.organizationId, entityType: 'corbam', entityId: id, kind: 'corbam', actorType: 'claude', title: `Claude redigiu carta de ${kind}`, payload: { model: out.model } });
    return reply.code(201).send({ data: row, model: out.model });
  });
}
