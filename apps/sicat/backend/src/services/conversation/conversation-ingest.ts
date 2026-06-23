// conversation-ingest.ts — cola multimodal do turno conversacional (E3/SICAT).
//
// Liga a fundação JÁ PRONTA (@flavioneto11/ai-ingest-middleware + file-ingest-kit) à rota
// /v1/conversations/turns. Princípios INEGOCIÁVEIS honrados aqui:
//   1) RETROCOMPAT: só requisições multipart/form-data acionam a ingestão. Em application/json o
//      middleware é NO-OP (req.ingested = null) e o contrato textual existente fica IDÊNTICO.
//   2) FAIL-SOFT: erro de ingestão NÃO derruba a rota — o middleware degrada para texto-vazio + nota
//      (o handler segue). Aqui nunca lançamos por causa de arquivo.
//   3) SEM BYTES EM LOG/TELEMETRIA: expomos só o `manifest` (path/type/bytes/chars/status) e notas;
//      o conteúdo base64 dos blocos NUNCA é serializado fora do payload do LLM (lição de OOM).
//
// Como o conteúdo dos arquivos chega ao LLM (2 vias, complementares):
//   • TEXTO (todos os provedores): o texto extraído (pdf/docx/xls(x)/csv/txt/pptx/zip) é DOBRADO na
//     mensagem do usuário (mergeUserMessageWithFiles). Assim TODO o pipeline existente — classifier,
//     planner, RAG, working memory, síntese, guardrails, engine ai-core E legado — enxerga o arquivo
//     como texto, sem tocar no seam do LLM. Imagens sem visão degradam para "name-only" no texto.
//   • BLOCOS NATIVOS (imagem/PDF) p/ Claude: expomos os blocos via `userContent` (array no formato do
//     provedor). O caminho LangChain legado (HumanMessage) consegue anexá-los a um modelo com visão.
//     O grafo da fundação (@flavioneto11/ai-core runTurn) aceita apenas `message: string` — por isso o
//     texto extraído é a via que garante cobertura universal; os blocos nativos são um ADITIVO.

import type { Request, RequestHandler } from 'express';
import { attachIngest as kitAttachIngest } from '@flavioneto11/ai-ingest-middleware';
import { toMessageContent, supportsVision } from '@flavioneto11/file-ingest-kit';
import type { IngestResult, MediaBlock, ManifestRow } from '@flavioneto11/file-ingest-kit';

// req.ingested (anexado pelo middleware): IngestResult + bundle .text + erro fail-soft.
type ReqIngested = IngestResult & { text?: string; error?: string | null };

type ProviderName = 'anthropic' | 'openai';

/** Bloco de mensagem multimodal já no formato do provedor (image/document/image_url). */
export type MultimodalBlock = Record<string, unknown>;

export type IngestedTurn = {
  /** Mensagem do usuário com o TEXTO dos arquivos dobrado (universal, todos os provedores). */
  mergedMessage: string;
  /**
   * Conteúdo multimodal no formato do provedor (texto + blocos nativos de imagem/PDF) quando o modelo
   * suporta visão/PDF e há blocos; caso contrário `null` (o texto já cobre). Aditivo, opcional.
   */
  userContent: MultimodalBlock[] | null;
  /** Resumo SEGURO p/ telemetria/auditoria — só manifest + notas, NUNCA bytes. */
  safeManifest: Array<Pick<ManifestRow, 'path' | 'type' | 'bytes' | 'chars' | 'status'>>;
  notes: string[];
  /** Quantos blocos nativos (imagem/PDF) seguiram para o provedor. */
  nativeBlockCount: number;
  /** Erro de ingestão (fail-soft) quando houve — só p/ observabilidade, nunca derruba a rota. */
  ingestError: string | null;
};

const MAX_FILES = 20;
const MAX_BYTES = 10 * 1024 * 1024; // por arquivo (mesmo default do kit; explícito p/ clareza)

/**
 * Middleware Express de ingestão para a rota de turnos. Campo de upload: `files`.
 * No-op em JSON; fail-soft em multipart (o kit garante). Também popula req.body com os campos de
 * TEXTO do multipart (multer) — então `message`/`conversationSessionId`/`context` continuam chegando.
 */
export function conversationIngestMiddleware(): RequestHandler {
  return kitAttachIngest({ field: 'files', maxFiles: MAX_FILES, maxBytes: MAX_BYTES });
}

// O `userContent` (array com blocos nativos) é consumido HOJE somente pelo caminho LangChain legado
// (respondConversationally), que SEMPRE usa ChatOpenAI — mesmo com AI_PROVIDER=anthropic (o LEGADO
// roda em OpenAI por decisão de arquitetura; só o LLM do grafo ai-core troca para Claude). Por isso
// os blocos são montados no formato OPENAI (image_url), casando com o consumidor real e evitando
// mismatch de formato. PDFs não viram bloco nativo no OpenAI → cobertos pelo TEXTO extraído (dobrado
// na mensagem). O grafo ai-core (Claude) aceita apenas message:string, então os arquivos chegam ao
// Claude pelo TEXTO; este é o caminho de cobertura universal e os blocos são um ADITIVO p/ o legado.
const LEGACY_CONSUMER_PROVIDER: ProviderName = 'openai';

/** Modelo do consumidor legado (ChatOpenAI) — decide suporte a visão p/ blocos de IMAGEM nativos. */
function resolveLegacyOpenAiModel(): string {
  return (process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || 'gpt-5').trim();
}

function hasIngestContent(ingested: ReqIngested | null | undefined): ingested is ReqIngested {
  if (!ingested) return false;
  const textParts = Array.isArray(ingested.textParts) ? ingested.textParts : [];
  const blocks = Array.isArray(ingested.blocks) ? ingested.blocks : [];
  const manifest = Array.isArray(ingested.manifest) ? ingested.manifest : [];
  return textParts.length > 0 || blocks.length > 0 || manifest.length > 0;
}

function toSafeManifest(manifest: ManifestRow[] | undefined) {
  return (Array.isArray(manifest) ? manifest : []).slice(0, MAX_FILES).map((row) => ({
    path: row.path,
    type: row.type,
    bytes: row.bytes,
    chars: row.chars,
    status: row.status
  }));
}

function countNativeBlocks(content: MultimodalBlock[] | null): number {
  if (!Array.isArray(content)) return 0;
  return content.filter((block) => {
    const type = typeof block.type === 'string' ? block.type : '';
    return type === 'image' || type === 'document' || type === 'image_url';
  }).length;
}

/**
 * Lê req.ingested e produz o turno enriquecido. Quando NÃO há arquivos (JSON ou multipart sem files),
 * devolve `null` — o chamador segue 100% no caminho legado (retrocompat total).
 *
 * `userText` é a mensagem digitada pelo usuário (req.body.message já normalizado pelo handler).
 */
export function buildIngestedTurn(req: Request, userText: string): IngestedTurn | null {
  const ingested = (req as Request & { ingested?: ReqIngested | null }).ingested;
  if (!hasIngestContent(ingested)) return null;

  // TEXTO universal (todos os provedores): bundle (texto digitado + manifesto + texto extraído + notas)
  // como STRING. supportsVision:false força a saída string (sem blocos) — é o texto que dobramos na
  // mensagem do turno, garantindo que o conteúdo dos arquivos chegue a qualquer LLM (incl. o grafo
  // Claude, que só aceita message:string) e a todo o pipeline (classifier/planner/RAG/síntese).
  const textContent = toMessageContent(ingested, {
    provider: 'openai',
    supportsVision: false,
    supportsPdf: false,
    userText
  });
  const mergedMessage = typeof textContent === 'string' ? textContent : userText;

  // BLOCOS NATIVOS (aditivo, formato OpenAI p/ o consumidor LEGADO ChatOpenAI): só IMAGENS quando o
  // modelo OpenAI suporta visão e há blocos. PDFs ficam só no texto (OpenAI não recebe PDF nativo).
  const legacyModel = resolveLegacyOpenAiModel();
  const legacySupportsVision = supportsVision(legacyModel);
  let userContent: MultimodalBlock[] | null = null;
  if (legacySupportsVision && Array.isArray(ingested.blocks) && ingested.blocks.some((b) => b.type === 'image')) {
    const multimodal = toMessageContent(ingested, {
      provider: LEGACY_CONSUMER_PROVIDER,
      supportsVision: true,
      supportsPdf: false,
      userText
    });
    userContent = Array.isArray(multimodal) ? (multimodal as MultimodalBlock[]) : null;
  }

  return {
    mergedMessage,
    userContent,
    safeManifest: toSafeManifest(ingested.manifest),
    notes: Array.isArray(ingested.notes) ? ingested.notes.slice(0, 50) : [],
    nativeBlockCount: countNativeBlocks(userContent),
    ingestError: typeof ingested.error === 'string' ? ingested.error : null
  };
}

/** Re-export tipográfico p/ o handler tipar sem reimportar do kit. */
export type { MediaBlock };
