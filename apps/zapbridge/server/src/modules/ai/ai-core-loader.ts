// =============================================================================
// Carregador dos pacotes @flavioneto11/* (ESM-only) a partir deste backend CommonJS.
// -----------------------------------------------------------------------------
// O server do ZapBridge compila com `module: commonjs` (app legado, 27 arquivos com
// imports sem extensão). Os kits da plataforma são ESM puro (`"type":"module"`, só
// condição `import` no `exports`). Um `import` estático seria transpilado pelo tsc
// para `require()`, que LANÇA em pacote ESM. O truque `new Function('s','return import(s)')`
// esconde o dynamic import do transpilador → preserva o `import()` NATIVO do Node, que
// carrega ESM dentro de CJS. Tipos vêm dos `.d.ts` (apagados em runtime); só o valor é
// carregado de forma lazy e cacheado. openai/@anthropic-ai/sdk/pg/prom-client/zod são
// CJS-friendly e seguem com `import` normal.
// =============================================================================

type AiCoreModule = typeof import('@flavioneto11/ai-core');
type AiKitModule = typeof import('@flavioneto11/ai-kit');
type FileIngestModule = typeof import('@flavioneto11/file-ingest-kit');
type AiIngestMiddlewareModule = typeof import('@flavioneto11/ai-ingest-middleware');

// `new Function(...)` impede o tsc de reescrever o import() para require().
const importEsm = new Function('specifier', 'return import(specifier)') as <T = unknown>(
  specifier: string,
) => Promise<T>;

let _aiCore: AiCoreModule | null = null;
let _aiKit: AiKitModule | null = null;
let _fileIngest: FileIngestModule | null = null;
let _aiIngestMw: AiIngestMiddlewareModule | null = null;

export async function loadAiCore(): Promise<AiCoreModule> {
  if (!_aiCore) _aiCore = await importEsm<AiCoreModule>('@flavioneto11/ai-core');
  return _aiCore;
}

export async function loadAiKit(): Promise<AiKitModule> {
  if (!_aiKit) _aiKit = await importEsm<AiKitModule>('@flavioneto11/ai-kit');
  return _aiKit;
}

export async function loadFileIngest(): Promise<FileIngestModule> {
  if (!_fileIngest) _fileIngest = await importEsm<FileIngestModule>('@flavioneto11/file-ingest-kit');
  return _fileIngest;
}

export async function loadAiIngestMiddleware(): Promise<AiIngestMiddlewareModule> {
  if (!_aiIngestMw) _aiIngestMw = await importEsm<AiIngestMiddlewareModule>('@flavioneto11/ai-ingest-middleware');
  return _aiIngestMw;
}
