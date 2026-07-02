// Modulo Financeiro PJ/PF. Lancamentos + categorizacao automatica (GPT, fail-soft: separa
// empresarial x pessoal) + fluxo de caixa (agregacao) + relatorio textual (Claude, fail-soft).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth, type Principal } from '../../lib/auth';
import { appendTimeline } from '../../lib/timeline';
import { callSpecialist } from '../../ai/engine';
import type { FinanceScope, FinanceKind } from '@prisma/client';

const createSchema = z.object({
  scope: z.enum(['pj', 'pf']).default('pj'),
  kind: z.enum(['receita', 'despesa']).default('despesa'),
  category: z.string().default('outros'),
  amount: z.number(),
  date: z.string().optional(),
  description: z.string().min(1),
  counterparty: z.string().optional(),
});

export async function financeiroRoutes(app: FastifyInstance): Promise<void> {
  app.get('/financeiro', { preHandler: requireAuth }, async (req) => {
    const p = (req as any).principal as Principal;
    const q = req.query as Record<string, string>;
    const where: any = { organizationId: p.organizationId };
    if (q.scope) where.scope = q.scope;
    return { data: await prisma.financeTransaction.findMany({ where, orderBy: { date: 'desc' }, take: 300 }) };
  });

  app.get('/financeiro/cashflow', { preHandler: requireAuth }, async (req) => {
    const p = (req as any).principal as Principal;
    const q = req.query as Record<string, string>;
    const where: any = { organizationId: p.organizationId };
    if (q.scope) where.scope = q.scope;
    const rows = await prisma.financeTransaction.findMany({ where });
    let receita = 0, despesa = 0;
    const byCategory: Record<string, number> = {};
    for (const r of rows) {
      const v = Number(r.amount);
      if (r.kind === 'receita') receita += v; else { despesa += v; byCategory[r.category] = (byCategory[r.category] || 0) + v; }
    }
    return { receita, despesa, saldo: receita - despesa, count: rows.length, byCategory };
  });

  app.post('/financeiro', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const b = createSchema.parse(req.body);
    const row = await prisma.financeTransaction.create({ data: { ...b, organizationId: p.organizationId, date: b.date ? new Date(b.date) : new Date() } });
    return reply.code(201).send({ data: row });
  });

  app.delete('/financeiro/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const existing = await prisma.financeTransaction.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    await prisma.financeTransaction.delete({ where: { id } });
    return reply.code(204).send();
  });

  // Categorizacao por IA (GPT): dado o texto/valor, separa PJ x PF, receita/despesa e categoria.
  app.post('/financeiro/categorize', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { description, amount } = z.object({ description: z.string().min(1), amount: z.number() }).parse(req.body);
    const out = await callSpecialist('logica', {
      user: `Classifique o lançamento financeiro. Responda JSON {"scope":"pj|pf","kind":"receita|despesa","category":"<curta>"}.\nLançamento: "${description}", valor R$ ${amount}.`,
      jsonMode: true, maxTokens: 150,
    });
    if (!out) return { dormant: true, message: 'IA dormente — configure OPENAI_API_KEY.' };
    let parsed: any = {};
    try { parsed = JSON.parse(out.text || '{}'); } catch { parsed = {}; }
    const scope = (['pj', 'pf'].includes(parsed.scope) ? parsed.scope : 'pj') as FinanceScope;
    const kind = (['receita', 'despesa'].includes(parsed.kind) ? parsed.kind : 'despesa') as FinanceKind;
    const row = await prisma.financeTransaction.create({ data: { organizationId: p.organizationId, scope, kind, category: String(parsed.category || 'outros').slice(0, 60), amount, description, aiCategorized: true } });
    await appendTimeline({ organizationId: p.organizationId, entityType: 'finance', entityId: row.id, kind: 'financial', actorType: 'gpt', title: `IA categorizou: ${scope}/${row.category}`, summary: description });
    return { data: row, model: out.model };
  });

  // Relatorio de fluxo de caixa (Claude): analisa os agregados e escreve recomendacoes.
  app.post('/financeiro/report', { preHandler: requireAuth }, async (req) => {
    const p = (req as any).principal as Principal;
    const rows = await prisma.financeTransaction.findMany({ where: { organizationId: p.organizationId } });
    let receita = 0, despesa = 0;
    const byCat: Record<string, number> = {};
    for (const r of rows) { const v = Number(r.amount); if (r.kind === 'receita') receita += v; else { despesa += v; byCat[r.category] = (byCat[r.category] || 0) + v; } }
    const out = await callSpecialist('escrita', {
      user: `Escreva um relatório curto de fluxo de caixa em pt-BR com recomendações. Dados: receita R$ ${receita}, despesa R$ ${despesa}, saldo R$ ${receita - despesa}. Despesas por categoria: ${JSON.stringify(byCat)}.`,
      maxTokens: 700,
    });
    if (!out) return { dormant: true, message: 'IA dormente — configure ANTHROPIC_API_KEY.', totals: { receita, despesa, saldo: receita - despesa } };
    return { report: out.text, model: out.model, totals: { receita, despesa, saldo: receita - despesa } };
  });
}
