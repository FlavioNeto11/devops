// ai/embedder.js — embedder compartilhado (ingestão RAG + busca do assistente).
// Usa OpenAI para embeddings (Anthropic não expõe /embeddings). Fail-soft: sem
// OPENAI_API_KEY (ou erro de chamada) retorna null e o chamador degrada graciosamente
// (chunks sem vetor / busca vazia). Lazy: o SDK só é importado quando há chave.
let _embedFn; // undefined = não inicializado; null = indisponível; function = pronto

export const EMBED_MODEL = 'text-embedding-3-small';

async function getEmbedFn() {
  if (_embedFn !== undefined) return _embedFn;
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) { _embedFn = null; return null; }
  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });
    _embedFn = async (texts) => {
      const r = await client.embeddings.create({ model: EMBED_MODEL, input: texts });
      return r.data.map((d) => d.embedding);
    };
    return _embedFn;
  } catch {
    _embedFn = null;
    return null;
  }
}

// embedTexts(strings[]) -> number[][] | null. null = embeddings indisponíveis (fail-soft).
export async function embedTexts(texts) {
  const list = Array.isArray(texts) ? texts : [];
  if (!list.length) return [];
  try {
    const embedFn = await getEmbedFn();
    if (!embedFn) return null;
    return await embedFn(list);
  } catch {
    return null;
  }
}

// Conveniência: vetor único (ou null). Reusado pela busca por similaridade.
export async function embedQuery(text) {
  const out = await embedTexts([String(text || '')]);
  return out && out.length ? out[0] : null;
}

export function toVectorLiteral(embedding) {
  return `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`;
}

// Apenas para testes: reseta o cache do embedder.
export function __resetEmbedderForTest() { _embedFn = undefined; }
