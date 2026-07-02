// Modulo PTAM (Parecer Tecnico de Avaliacao Mercadologica, ABNT NBR 14653). Claude (escrita)
// redige a fundamentacao tecnica/juridica a partir do imovel + ACM. Fail-soft (dormente sem chave).
// O valor estimado e' calculado deterministicamente (area x m2 da ACM) quando possivel.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth, type Principal } from '../../lib/auth';
import { appendTimeline } from '../../lib/timeline';
import { callSpecialist } from '../../ai/engine';

export async function ptamRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ptam', { preHandler: requireAuth }, async (req) => {
    const p = (req as any).principal as Principal;
    return { data: await prisma.ptam.findMany({ where: { organizationId: p.organizationId }, orderBy: { createdAt: 'desc' }, take: 100 }) };
  });

  app.get('/ptam/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const row = await prisma.ptam.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return { data: row };
  });

  app.post('/ptam', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const b = z.object({ propertyId: z.string().optional(), acmRunId: z.string().optional(), estimatedValue: z.number().optional() }).parse(req.body);

    const property = b.propertyId ? await prisma.property.findFirst({ where: { id: b.propertyId, organizationId: p.organizationId }, include: { address: true } }) : null;
    const acm = b.acmRunId ? await prisma.acmRun.findFirst({ where: { id: b.acmRunId, organizationId: p.organizationId } }) : null;

    // valor estimado deterministico: informado > area x m2 da ACM > preco de venda
    let estimated = b.estimatedValue ?? null;
    if (estimated == null && property?.areaTotal && acm?.avgPricePerM2) estimated = Math.round(property.areaTotal * acm.avgPricePerM2);
    if (estimated == null && property?.priceSale) estimated = Number(property.priceSale);

    const ctx = [
      property ? `Imóvel: ${property.title}, ${property.type}, ${property.bedrooms}q/${property.bathrooms}b, ${property.areaTotal || property.areaUsable || '?'}m², ${property.address?.city || ''}.` : 'Imóvel: (não vinculado).',
      acm ? `ACM: m² médio R$ ${acm.avgPricePerM2}, mediana R$ ${acm.medianPricePerM2}, ${acm.sampleSize} amostras.` : 'ACM: (não vinculada).',
      estimated ? `Valor estimado de referência: R$ ${estimated}.` : '',
    ].filter(Boolean).join('\n');

    const out = await callSpecialist('escrita', {
      user: `Redija um PTAM (Parecer Técnico de Avaliação Mercadológica) conforme ABNT NBR 14653, em pt-BR formal e pericial. Estruture: 1) Identificação e finalidade; 2) Caracterização do imóvel; 3) Metodologia (método comparativo direto de dados de mercado); 4) Análise da amostra e homogeneização; 5) Conclusão do valor; 6) Ressalvas. Deixe claro que requer assinatura de profissional habilitado (CRECI/CNAI).\n\nDados:\n${ctx}`,
      maxTokens: 1800,
    });

    const ptam = await prisma.ptam.create({
      data: {
        organizationId: p.organizationId, propertyId: b.propertyId || null, acmRunId: b.acmRunId || null,
        estimatedValue: estimated ?? undefined,
        narrativeText: out ? out.text : null,
        status: out ? 'generated' : 'draft',
        generatedByModel: out ? out.model : null,
        confidenceGrade: acm && acm.sampleSize >= 5 ? 'II' : 'I',
      },
    });
    await appendTimeline({ organizationId: p.organizationId, entityType: 'ptam', entityId: ptam.id, kind: 'ptam', actorType: out ? 'claude' : 'human', actorUserId: p.userId, title: out ? 'Claude redigiu o PTAM' : 'PTAM criado (IA dormente)', summary: estimated ? `valor ref. R$ ${estimated}` : undefined });
    if (!out) return reply.code(201).send({ data: ptam, dormant: true, message: 'IA dormente — configure ANTHROPIC_API_KEY para redigir o parecer. Valor estimado calculado.' });
    return reply.code(201).send({ data: ptam, model: out.model });
  });
}
