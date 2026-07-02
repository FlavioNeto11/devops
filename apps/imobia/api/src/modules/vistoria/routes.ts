// Modulo Vistoria/Laudos. Inspecoes + upload de fotos -> analise por Gemini (visao, fail-soft)
// -> laudo redigido por Claude (escrita, fail-soft). Timeline registra cada etapa/ator.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth, type Principal } from '../../lib/auth';
import { appendTimeline } from '../../lib/timeline';
import { saveFile } from '../../lib/storage';
import { callSpecialist } from '../../ai/engine';

export async function vistoriaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/vistorias', { preHandler: requireAuth }, async (req) => {
    const p = (req as any).principal as Principal;
    const where: any = { organizationId: p.organizationId };
    const q = req.query as Record<string, string>;
    if (q.status) where.status = q.status;
    return { data: await prisma.inspection.findMany({ where, include: { photos: true }, orderBy: { createdAt: 'desc' }, take: 100 }) };
  });

  app.post('/vistorias', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const b = z.object({ propertyId: z.string().optional(), kind: z.enum(['entrada', 'saida', 'periodica']).default('entrada'), scheduledAt: z.string().optional(), vistoriadorId: z.string().optional() }).parse(req.body);
    const row = await prisma.inspection.create({ data: { organizationId: p.organizationId, propertyId: b.propertyId || null, kind: b.kind, scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : null, vistoriadorId: b.vistoriadorId || p.userId } });
    await appendTimeline({ organizationId: p.organizationId, entityType: 'inspection', entityId: row.id, kind: 'inspection', actorType: 'human', actorUserId: p.userId, title: `Vistoria criada (${b.kind})` });
    return reply.code(201).send({ data: row });
  });

  app.get('/vistorias/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const row = await prisma.inspection.findFirst({ where: { id, organizationId: p.organizationId }, include: { photos: { orderBy: { createdAt: 'asc' } } } });
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const timeline = await prisma.timelineEntry.findMany({ where: { organizationId: p.organizationId, entityType: 'inspection', entityId: id }, orderBy: { createdAt: 'desc' }, take: 30 });
    return { data: row, timeline };
  });

  app.put('/vistorias/:id', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const existing = await prisma.inspection.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!existing) return reply.code(404).send({ error: 'not_found' });
    const b = z.object({ status: z.enum(['agendada', 'em_campo', 'analisando', 'laudo_gerado', 'concluida']).optional(), summary: z.string().optional() }).parse(req.body);
    return { data: await prisma.inspection.update({ where: { id }, data: b }) };
  });

  // Upload de foto + analise por Gemini (fail-soft).
  app.post('/vistorias/:id/fotos', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const insp = await prisma.inspection.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!insp) return reply.code(404).send({ error: 'not_found' });
    const file = await (req as any).file();
    if (!file) return reply.code(400).send({ error: 'no_file' });
    const buffer = await file.toBuffer();
    const { storageKey } = await saveFile(p.organizationId, file.filename, buffer);
    const room = (req.query as any).room || null;
    let photo = await prisma.inspectionPhoto.create({ data: { inspectionId: id, storageKey, room } });

    if (file.mimetype?.startsWith('image/')) {
      const block = { type: 'image_url', image_url: { url: `data:${file.mimetype};base64,${buffer.toString('base64')}` } };
      const out = await callSpecialist('visao', {
        user: `Descreva tecnicamente o estado físico neste cômodo (${room || 'não informado'}): paredes, piso, pintura, infiltração, fissuras. Responda JSON {"description":"","findings":[{"item":"","severity":"leve|moderada|grave"}]}.`,
        blocks: [block], jsonMode: true, maxTokens: 600,
      });
      if (out) {
        let parsed: any = {};
        try { parsed = JSON.parse(out.text || '{}'); } catch { parsed = {}; }
        photo = await prisma.inspectionPhoto.update({ where: { id: photo.id }, data: { aiDescription: String(parsed.description || '').slice(0, 1000), aiFindings: parsed.findings || [], analyzedByModel: out.model } });
        await appendTimeline({ organizationId: p.organizationId, entityType: 'inspection', entityId: id, kind: 'ai_output', actorType: 'gemini', title: 'Gemini analisou uma foto', summary: String(parsed.description || '').slice(0, 200) });
      }
    }
    return reply.code(201).send({ data: photo });
  });

  // Gera o laudo (Claude) a partir das descricoes das fotos (fail-soft).
  app.post('/vistorias/:id/laudo', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const insp = await prisma.inspection.findFirst({ where: { id, organizationId: p.organizationId }, include: { photos: true } });
    if (!insp) return reply.code(404).send({ error: 'not_found' });
    const findings = insp.photos.filter((x) => x.aiDescription).map((x) => `- ${x.room || 'ambiente'}: ${x.aiDescription}`).join('\n') || '(sem descrições de fotos)';
    const out = await callSpecialist('escrita', {
      user: `Redija um LAUDO DE VISTORIA de ${insp.kind} formal em pt-BR, com base nas observações:\n${findings}\nEstruture: identificação, estado geral, ambientes, ressalvas e conclusão. Deixe claro que requer assinatura do vistoriador.`,
      maxTokens: 1500,
    });
    if (!out) return { dormant: true, message: 'IA dormente — configure ANTHROPIC_API_KEY para gerar o laudo.' };
    const row = await prisma.inspection.update({ where: { id }, data: { laudoText: out.text, status: 'laudo_gerado' } });
    await appendTimeline({ organizationId: p.organizationId, entityType: 'inspection', entityId: id, kind: 'ai_output', actorType: 'claude', title: 'Claude redigiu o laudo de vistoria', payload: { model: out.model } });
    return { data: row, model: out.model };
  });
}
