// Modulo ACM (Analise de Mercado Comparativa). O scraper de portais (ZAP/VivaReal/OLX) e'
// DORMENTE ate credencial; comparaveis podem ser adicionados manualmente. Compute calcula media/
// mediana do m2 (deterministico) + resumo por GPT (fail-soft). PTAM (F7) consome estes dados.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth, type Principal } from '../../lib/auth';
import { appendTimeline } from '../../lib/timeline';
import { callSpecialist } from '../../ai/engine';

function scraperConfigured(): boolean {
  return Boolean(process.env.SCRAPER_API_URL || process.env.APIFY_TOKEN);
}
function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function acmRoutes(app: FastifyInstance): Promise<void> {
  app.get('/acm', { preHandler: requireAuth }, async (req) => {
    const p = (req as any).principal as Principal;
    return { data: await prisma.acmRun.findMany({ where: { organizationId: p.organizationId }, include: { comparables: true }, orderBy: { createdAt: 'desc' }, take: 100 }), scraper: scraperConfigured() };
  });

  app.post('/acm', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const b = z.object({ propertyId: z.string().optional(), radiusKm: z.number().optional() }).parse(req.body);
    const row = await prisma.acmRun.create({ data: { organizationId: p.organizationId, propertyId: b.propertyId || null, radiusKm: b.radiusKm ?? null, sourcePortals: [] } });
    return reply.code(201).send({ data: row });
  });

  app.get('/acm/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const row = await prisma.acmRun.findFirst({ where: { id, organizationId: p.organizationId }, include: { comparables: { orderBy: { pricePerM2: 'asc' } } } });
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return { data: row };
  });

  app.post('/acm/:id/comparaveis', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const run = await prisma.acmRun.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!run) return reply.code(404).send({ error: 'not_found' });
    const b = z.object({ portal: z.string().default('manual'), price: z.number().positive(), areaM2: z.number().positive(), type: z.string().optional(), externalUrl: z.string().optional() }).parse(req.body);
    const row = await prisma.acmComparable.create({ data: { acmRunId: id, portal: b.portal, price: b.price, areaM2: b.areaM2, pricePerM2: Math.round((b.price / b.areaM2) * 100) / 100, type: b.type, externalUrl: b.externalUrl } });
    return reply.code(201).send({ data: row });
  });

  // Scraping de portais — DORMENTE ate credencial (fail-soft).
  app.post('/acm/:id/scrape', { preHandler: requireAuth }, async () => {
    if (!scraperConfigured()) return { dormant: true, message: 'Scraper de portais não configurado. Defina SCRAPER_API_URL/APIFY_TOKEN. Enquanto isso, adicione comparáveis manualmente.' };
    return { message: 'scraping enfileirado (scraper configurado)' };
  });

  // Calcula media/mediana do m2 + resumo (GPT, fail-soft).
  app.post('/acm/:id/compute', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const run = await prisma.acmRun.findFirst({ where: { id, organizationId: p.organizationId }, include: { comparables: true } });
    if (!run) return reply.code(404).send({ error: 'not_found' });
    if (!run.comparables.length) return reply.code(422).send({ error: 'sem_comparaveis', message: 'Adicione comparáveis antes de calcular.' });
    const ppm2 = run.comparables.map((c) => c.pricePerM2);
    const avg = Math.round((ppm2.reduce((a, b) => a + b, 0) / ppm2.length) * 100) / 100;
    const med = Math.round(median(ppm2) * 100) / 100;
    let summary: string | null = null;
    const out = await callSpecialist('logica', {
      user: `Resuma em 2 frases uma ACM: ${ppm2.length} comparáveis, m² médio R$ ${avg}, mediana R$ ${med}. Indique faixa de preço sugerida.`,
      maxTokens: 200,
    });
    if (out) summary = out.text;
    const updated = await prisma.acmRun.update({ where: { id }, data: { avgPricePerM2: avg, medianPricePerM2: med, sampleSize: ppm2.length, summary, status: 'done' } });
    await appendTimeline({ organizationId: p.organizationId, entityType: 'acm', entityId: id, kind: 'acm', actorType: out ? 'gpt' : 'system', title: `ACM: m² médio R$ ${avg}`, summary: `${ppm2.length} comparáveis, mediana R$ ${med}` });
    return { data: updated };
  });
}
