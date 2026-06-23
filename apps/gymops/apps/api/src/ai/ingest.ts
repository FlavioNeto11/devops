// Ponte ENTRE @fastify/multipart E @flavioneto11/file-ingest-kit para as rotas de IA.
//
// CONTRATO RETROCOMPATÍVEL: o caminho JSON segue idêntico. Só requisições
// multipart/form-data acionam a ingestão de arquivos. As rotas usam
// `parseMultipartIngest(request)`:
//   - JSON / outro content-type  -> { fields: {}, ingested: null }  (no-op)
//   - multipart/form-data        -> coleta arquivos + campos de TEXTO,
//                                   chama ingest(files) do kit e devolve o resultado.
//
// FAIL-SOFT: qualquer erro na coleta/ingestão é capturado e degrada para
// texto-only (ingested: null + nota); NUNCA derruba a rota (sem 500 por arquivo).
//
// SEGURANÇA: NUNCA serializa bytes/blobs em log/auditoria — apenas o manifest do
// kit (path/type/bytes/chars/status). Limites de tamanho/qtde já vêm do kit e do
// @fastify/multipart (registrado no app.ts com fileSize 10MB).

import type { FastifyRequest } from 'fastify';
import { ingest, type IngestResult } from '@flavioneto11/file-ingest-kit';

const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // alinhado ao limite do @fastify/multipart

export interface MultipartIngest {
  /** Campos de TEXTO do multipart (ex.: message, organizationId) — vazio em JSON. */
  fields: Record<string, string>;
  /** Resultado da ingestão de arquivos; null quando não houve arquivos/ingestão. */
  ingested: IngestResult | null;
}

/** true quando o corpo é multipart/form-data (única condição que aciona ingestão). */
export function isMultipart(request: FastifyRequest): boolean {
  const ct = String(request.headers['content-type'] || '').toLowerCase();
  return ct.includes('multipart/form-data');
}

/**
 * Coleta arquivos + campos de texto de um request multipart e roda a ingestão.
 * Em qualquer outro content-type é um no-op ({ fields: {}, ingested: null }).
 * Fail-soft total: nunca lança.
 */
export async function parseMultipartIngest(request: FastifyRequest): Promise<MultipartIngest> {
  if (!isMultipart(request)) return { fields: {}, ingested: null };

  const fields: Record<string, string> = {};
  const files: Array<{ filename: string; mime?: string; bytes: Buffer }> = [];

  try {
    // request.parts() requer @fastify/multipart (registrado em app.ts).
    const parts = (request as unknown as { parts: () => AsyncIterableIterator<unknown> }).parts();
    for await (const part of parts as AsyncIterableIterator<{
      type: 'file' | 'field';
      fieldname: string;
      filename?: string;
      mimetype?: string;
      value?: unknown;
      toBuffer?: () => Promise<Buffer>;
    }>) {
      if (part.type === 'file') {
        // Mesmo acima do limite, drenamos o stream p/ o multipart não travar.
        const buf = part.toBuffer ? await part.toBuffer() : Buffer.alloc(0);
        if (files.length >= MAX_FILES) continue;
        if (buf.length > MAX_FILE_BYTES) continue; // o kit também protege; aqui evitamos guardar em memória
        files.push({ filename: part.filename || 'arquivo', mime: part.mimetype, bytes: buf });
      } else {
        // campo de texto (multer/multipart popula 1:1)
        fields[part.fieldname] = part.value == null ? '' : String(part.value);
      }
    }
  } catch (err) {
    // coleta falhou (limite estourado, stream abortado, etc.) — degrada p/ texto-only.
    request.log.warn({ err: errMessage(err) }, '[ai-ingest] coleta multipart falhou; texto-only');
    return { fields, ingested: null };
  }

  if (!files.length) return { fields, ingested: null };

  try {
    const ingested = await ingest(files, { maxFiles: MAX_FILES });
    // log SÓ do manifest (nunca bytes) — lição de OOM.
    request.log.info(
      { files: ingested.manifest.map((m) => ({ path: m.path, type: m.type, status: m.status, chars: m.chars })), totalChars: ingested.totalChars, truncated: ingested.truncated },
      '[ai-ingest] arquivos ingeridos',
    );
    return { fields, ingested };
  } catch (err) {
    request.log.warn({ err: errMessage(err) }, '[ai-ingest] ingestão falhou; texto-only');
    return { fields, ingested: null };
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
