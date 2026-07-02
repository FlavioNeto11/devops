// Modulo WhatsApp (eixo central). Multiplos numeros/segmentos. O gateway real (Baileys/Evolution/
// Z-API) e' DORMENTE ate credenciais; mas ja da p/ registrar canais e SIMULAR entrada -> o Cortex
// tria a intencao (fail-soft). Prova o "WhatsApp como eixo + Cortex na triagem" do documento.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth, type Principal } from '../../lib/auth';
import { appendTimeline } from '../../lib/timeline';
import { cortexClassify, engineStatus } from '../../ai/engine';
import { env } from '../../env';

// Gateway externo: considerado configurado se existir uma env de provider (dormente por padrao).
function gatewayConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_PROVIDER_URL || process.env.EVOLUTION_API_URL || process.env.ZAPI_TOKEN);
}

export async function whatsappRoutes(app: FastifyInstance): Promise<void> {
  app.get('/whatsapp/channels', { preHandler: requireAuth }, async (req) => {
    const p = (req as any).principal as Principal;
    return { data: await prisma.channel.findMany({ where: { organizationId: p.organizationId }, orderBy: { createdAt: 'desc' } }), gateway: gatewayConfigured() };
  });

  app.post('/whatsapp/channels', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const b = z.object({ phoneNumber: z.string().min(3), segment: z.enum(['captacao', 'vendas', 'financas', 'geral']).default('geral') }).parse(req.body);
    const row = await prisma.channel.create({ data: { organizationId: p.organizationId, phoneNumber: b.phoneNumber, segment: b.segment, instanceId: `inst_${Date.now().toString(36)}` } });
    return reply.code(201).send({ data: row });
  });

  app.post('/whatsapp/channels/:id/connect', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const ch = await prisma.channel.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!ch) return reply.code(404).send({ error: 'not_found' });
    if (!gatewayConfigured()) return { dormant: true, message: 'Gateway WhatsApp não configurado. Defina WHATSAPP_PROVIDER_URL/EVOLUTION_API_URL/ZAPI_TOKEN para conectar (QR/pairing).' };
    return { message: 'conectando (gateway configurado)…' };
  });

  app.get('/whatsapp/messages', { preHandler: requireAuth }, async (req) => {
    const p = (req as any).principal as Principal;
    const q = req.query as Record<string, string>;
    const where: any = { organizationId: p.organizationId };
    if (q.channelId) where.channelId = q.channelId;
    return { data: await prisma.waMessage.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 }) };
  });

  // Simula uma mensagem recebida -> Cortex tria a intencao (fail-soft). Demonstra o fluxo.
  app.post('/whatsapp/simulate', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const b = z.object({ channelId: z.string(), text: z.string().min(1), contactName: z.string().optional() }).parse(req.body);
    const ch = await prisma.channel.findFirst({ where: { id: b.channelId, organizationId: p.organizationId } });
    if (!ch) return reply.code(404).send({ error: 'channel_not_found' });
    const triage = await cortexClassify(b.text);
    const msg = await prisma.waMessage.create({
      data: {
        organizationId: p.organizationId, channelId: b.channelId, contactName: b.contactName || 'Contato', direction: 'inbound', type: 'text', text: b.text,
        aiTriaged: !triage.dormant, aiIntent: triage.dormant ? null : `${triage.specialist}:${triage.intent}`, aiActor: triage.dormant ? null : 'cortex',
      },
    });
    await appendTimeline({ organizationId: p.organizationId, entityType: 'channel', entityId: b.channelId, kind: 'message', actorType: triage.dormant ? 'human' : 'cortex', title: `Msg recebida (${ch.segment})`, summary: triage.dormant ? b.text : `intenção: ${triage.intent} → ${triage.specialist}` });
    return reply.code(201).send({ data: msg, triage, engineDormant: engineStatus().dormant });
  });

  app.post('/whatsapp/send', { preHandler: requireAuth }, async (req) => {
    if (!gatewayConfigured()) return { dormant: true, message: 'Gateway WhatsApp não configurado — envio indisponível.' };
    return { message: 'enviado (gateway configurado)' };
  });
}
