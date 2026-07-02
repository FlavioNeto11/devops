// Modulo Documentos ("documentar cada etapa"). Upload multipart -> PVC -> registro. Validacao
// por Gemini (visao) fail-soft: valida RG/CNH/holerite/certidoes/Serasa/extratos, extrai campos.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireAuth, type Principal } from '../../lib/auth';
import { appendTimeline } from '../../lib/timeline';
import { saveFile, readFile } from '../../lib/storage';
import { callSpecialist } from '../../ai/engine';
import type { DocumentValidation, DocumentType } from '@prisma/client';

const VALIDATIONS = ['pendente', 'valido', 'invalido', 'ilegivel', 'expirado'];
const TYPES = ['rg', 'cnh', 'holerite', 'comprovante_renda', 'certidao', 'contrato', 'serasa', 'boa_vista', 'extrato_bancario', 'matricula', 'foto', 'outro'];

function blockFor(mime: string | null, buffer: Buffer): any | null {
  const b64 = buffer.toString('base64');
  if (mime && mime.startsWith('image/')) return { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } };
  if (mime === 'application/pdf') return { type: 'document', mediaType: 'application/pdf', dataBase64: b64 };
  return null;
}

async function runValidation(docId: string, filename: string, mime: string | null, buffer: Buffer, p: Principal) {
  const block = blockFor(mime, buffer);
  if (!block) return { dormant: false, skipped: true };
  const out = await callSpecialist('visao', {
    user: `Documento "${filename}". Classifique o tipo, avalie validade/legibilidade e extraia os campos principais.`,
    blocks: [block],
    jsonMode: true,
    maxTokens: 500,
  });
  if (!out) return { dormant: true };
  let parsed: any = {};
  try { parsed = JSON.parse(out.text || '{}'); } catch { parsed = {}; }
  const validation = (VALIDATIONS.includes(parsed.validation) ? parsed.validation : 'pendente') as DocumentValidation;
  const type = (TYPES.includes(parsed.type) ? parsed.type : undefined) as DocumentType | undefined;
  await prisma.document.update({
    where: { id: docId },
    data: { validation, ...(type ? { type } : {}), validationReason: String(parsed.reason || '').slice(0, 400), extractedFields: parsed.fields || {}, validatedByModel: out.model, validatedAt: new Date() },
  });
  await appendTimeline({ organizationId: p.organizationId, entityType: 'document', entityId: docId, kind: 'document_event', actorType: 'gemini', title: `Gemini validou: ${validation}`, summary: String(parsed.reason || '').slice(0, 200) });
  return { dormant: false, validation, type };
}

export async function documentosRoutes(app: FastifyInstance): Promise<void> {
  app.get('/documentos', { preHandler: requireAuth }, async (req) => {
    const p = (req as any).principal as Principal;
    const q = req.query as Record<string, string>;
    const where: any = { organizationId: p.organizationId };
    for (const k of ['entityType', 'entityId', 'propertyId', 'leadId', 'inspectionId', 'corbamCaseId']) if (q[k]) where[k] = q[k];
    return { data: await prisma.document.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }) };
  });

  app.post('/documentos', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const file = await (req as any).file();
    if (!file) return reply.code(400).send({ error: 'no_file' });
    const buffer = await file.toBuffer();
    const q = req.query as Record<string, string>;
    const { storageKey, sizeBytes } = await saveFile(p.organizationId, file.filename, buffer);
    const doc = await prisma.document.create({
      data: {
        organizationId: p.organizationId,
        type: (TYPES.includes(q.type) ? q.type : 'outro') as DocumentType,
        filename: file.filename,
        storageKey,
        mimeType: file.mimetype,
        sizeBytes,
        uploadedBy: p.userId,
        entityType: q.entityType || null,
        entityId: q.entityId || null,
        propertyId: q.propertyId || null,
        leadId: q.leadId || null,
        inspectionId: q.inspectionId || null,
        corbamCaseId: q.corbamCaseId || null,
      },
    });
    await appendTimeline({ organizationId: p.organizationId, entityType: q.entityType || 'document', entityId: q.entityId || doc.id, kind: 'document_event', actorType: 'human', actorUserId: p.userId, title: `Documento enviado: ${file.filename}` });
    const result = await runValidation(doc.id, file.filename, file.mimetype, buffer, p).catch(() => ({ dormant: true }));
    const fresh = await prisma.document.findUnique({ where: { id: doc.id } });
    return reply.code(201).send({ data: fresh, ai: result });
  });

  app.post('/documentos/:id/validate', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const { id } = req.params as { id: string };
    const doc = await prisma.document.findFirst({ where: { id, organizationId: p.organizationId } });
    if (!doc) return reply.code(404).send({ error: 'not_found' });
    const buffer = await readFile(doc.storageKey);
    const result = await runValidation(doc.id, doc.filename, doc.mimeType, buffer, p);
    const fresh = await prisma.document.findUnique({ where: { id } });
    return { data: fresh, ai: result };
  });

  // Download (org-scoped: a key comeca com "<org>/").
  app.get('/files/*', { preHandler: requireAuth }, async (req, reply) => {
    const p = (req as any).principal as Principal;
    const key = (req.params as any)['*'] as string;
    if (!key.startsWith(`${p.organizationId}/`)) return reply.code(403).send({ error: 'forbidden' });
    const doc = await prisma.document.findFirst({ where: { organizationId: p.organizationId, storageKey: key } });
    try {
      const buf = await readFile(key);
      reply.header('Content-Type', doc?.mimeType || 'application/octet-stream');
      return reply.send(buf);
    } catch {
      return reply.code(404).send({ error: 'not_found' });
    }
  });
}
