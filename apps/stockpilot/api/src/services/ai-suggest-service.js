// services/ai-suggest-service.js — REQ-STOCKPILOT-0008: assistente de IA que SUGERE a quantidade de
// reposição de um produto (bloco structured-outputs; caminho leve de ia-grafo + rag-pgvector).
//
// GROUNDING (RAG-lite sobre o banco): o assistente raciocina SOMENTE sobre dados REAIS do produto
// (estoque atual/mínimo) e o histórico recente de `product_orders` do tenant — nada de inventar. O
// pgvector (semantic search sobre manuais de fornecedor) fica como NOTA DE EVOLUÇÃO (ver abaixo);
// aqui a recuperação é uma consulta determinística ao Postgres, já escopada por tenant.
//
// SAÍDA ESTRUTURADA validada por schema { suggested_quantity:int, rationale:string,
// confidence:'low'|'medium'|'high', sources:[] }. FAIL-CLOSED: saída que não casa o schema → AppError
// estruturado (NUNCA fallback silencioso nem heurística chumbada). DRY-RUN: a sugestão NÃO cria pedido
// nem altera estado — o operador confirma (a rota de reposição continua sendo a única que persiste).
// SEM chave (ANTHROPIC_API_KEY) → 503 claro (fail-closed); o resto do app fica intacto.
//
// Tudo é injetável (db/products/orders/llm) → testável SEM Postgres e SEM rede (LLM mockado).
//
// NOTA DE EVOLUÇÃO (pgvector/RAG completo): para citar manuais de fornecedor e histórico de vendas por
// similaridade semântica, criar `CREATE EXTENSION vector`, uma tabela ai_documentos(embedding vector)
// com índice ivfflat e ingest (fatia+embeda+upsert), recuperando top-K por similaridade. Embeddings
// ficam na OpenAI (Anthropic não expõe /embeddings). Reusar packages/ai-core/src/rag.js.
import { pool } from '../db.js';
import * as productsRepo from '../repositories/products-repo.js';
import * as ordersRepo from '../repositories/orders-repo.js';
import { AppError } from '../lib/app-error.js';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const CONFIDENCE = ['low', 'medium', 'high'];

// --- erros tipados -----------------------------------------------------------
// Saída fora do schema → AppError estruturado (statusCode 502). `.status` é setado para o wrap do
// server.js (que mapeia o HTTP por `e.status`) — fail-closed, sem fallback silencioso.
function aiInvalidOutput(detail) {
  const e = new AppError('IA retornou saída fora do schema esperado: ' + detail, {
    code: 'AI_INVALID_OUTPUT', statusCode: 502,
  });
  e.status = 502;
  return e;
}

// Sem chave de IA → 503 claro (fail-closed). Não é AppError de gateway: é indisponibilidade do recurso.
function aiUnavailable() {
  const e = new Error('assistente de IA indisponível: ANTHROPIC_API_KEY não configurada');
  e.status = 503;
  e.code = 'AI_UNAVAILABLE';
  return e;
}

// --- LLM (env → função de chamada, ou null se sem chave) ----------------------
// Retorna `null` quando NÃO há chave configurada (→ o orquestrador faz 503 fail-closed). Só importa o
// SDK (@anthropic-ai/sdk) quando há chave — o app sobe e os testes rodam sem a dependência instalada.
export async function llmFromEnv(env = process.env) {
  const apiKey = String(env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) return null;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  return async ({ system, user, model = MODEL, maxTokens = 400 }) => {
    const r = await client.messages.create({
      model, max_tokens: maxTokens, system,
      messages: [{ role: 'user', content: user }],
    });
    return (r.content || []).map((b) => b.text || '').join('');
  };
}

// --- grounding (RAG-lite determinístico) -------------------------------------
// Monta o contexto factual a partir do produto + histórico REAL de pedidos. `sources` são exatamente
// os trechos de dados usados (citáveis) — o assistente deve referenciá-los, não inventar.
export function buildGrounding({ product, history = [] }) {
  const current = Number(product.current_stock);
  const min = Number(product.min_stock);
  const deficit = min - current;
  const delivered = history.filter((o) => o.status === 'delivered').length;
  const failed = history.filter((o) => o.status === 'failed').length;
  const open = history.filter((o) => o.status === 'pending' || o.status === 'processing').length;
  const last = history[0] || null;

  const sources = [
    `estoque_atual=${current} unidades`,
    `estoque_minimo=${min} unidades`,
    `deficit_vs_minimo=${deficit} unidades`,
    `pedidos_no_periodo=${history.length} (entregues=${delivered}, falhos=${failed}, abertos=${open})`,
  ];
  if (last) sources.push(`ultimo_pedido: status=${last.status}, criado_em=${String(last.created_at)}`);

  return {
    product: { id: product.id, name: product.name, current_stock: current, min_stock: min },
    history_summary: { count: history.length, delivered, failed, open, deficit },
    sources,
  };
}

// Prompt grounded: instrui saída SOMENTE JSON no schema e proíbe inventar dados fora do contexto.
export function buildPrompt(grounding) {
  const system = [
    'Você é o assistente de reposição de estoque do StockPilot.',
    'Sugira a QUANTIDADE de reposição de um produto usando SOMENTE os dados fornecidos no contexto',
    '(estoque atual/mínimo e o histórico de pedidos recentes). NÃO invente dados ausentes.',
    'Se o contexto for insuficiente para uma boa estimativa, use confidence "low".',
    'A sugestão é um RASCUNHO para o operador confirmar — você NÃO cria o pedido.',
    'Responda SOMENTE com um objeto JSON válido (sem texto fora do JSON), no formato:',
    '{"suggested_quantity": <inteiro >= 0>, "rationale": <string curta em pt-BR>, '
      + '"confidence": "low"|"medium"|"high", "sources": [<strings citando os dados usados>]}',
  ].join('\n');

  const user = [
    `Produto: ${grounding.product.name} (id ${grounding.product.id})`,
    `Estoque atual: ${grounding.product.current_stock} | Estoque mínimo: ${grounding.product.min_stock}`,
    'Dados de apoio (use-os e cite-os em "sources"):',
    ...grounding.sources.map((s) => `- ${s}`),
    'Sugira a quantidade de reposição adequada para voltar a operar com folga sobre o mínimo,',
    'e justifique em 1 frase.',
  ].join('\n');

  return { system, user };
}

// --- parse + validação estrita da saída estruturada (JSON mode) --------------
// Aceita JSON puro ou cercado por ```json. Qualquer desvio do schema → AppError (fail-closed).
function parseJsonLoose(text) {
  const s = String(text || '').trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced && fenced[1] ? fenced[1] : s).trim();
  try { return JSON.parse(body); } catch { /* tenta extrair o objeto */ }
  const i = body.indexOf('{'); const j = body.lastIndexOf('}');
  if (i >= 0 && j > i) { try { return JSON.parse(body.slice(i, j + 1)); } catch { /* */ } }
  return null;
}

export function parseSuggestion(text) {
  const parsed = parseJsonLoose(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw aiInvalidOutput('não é um objeto JSON');
  }
  const qty = parsed.suggested_quantity;
  if (!Number.isInteger(qty) || qty < 0) {
    throw aiInvalidOutput('suggested_quantity deve ser inteiro >= 0');
  }
  if (!CONFIDENCE.includes(parsed.confidence)) {
    throw aiInvalidOutput('confidence fora do enum (low|medium|high)');
  }
  if (typeof parsed.rationale !== 'string' || !parsed.rationale.trim()) {
    throw aiInvalidOutput('rationale ausente');
  }
  if (parsed.sources !== undefined && !Array.isArray(parsed.sources)) {
    throw aiInvalidOutput('sources deve ser uma lista');
  }
  return {
    suggested_quantity: qty,
    rationale: parsed.rationale.trim(),
    confidence: parsed.confidence,
    sources: Array.isArray(parsed.sources) ? parsed.sources.map((x) => String(x)) : [],
  };
}

// --- orquestrador (DRY-RUN) --------------------------------------------------
// Sugere a quantidade de reposição de UM produto. Não persiste nada (dry-run): retorna o rascunho para
// o operador confirmar. `deps.llm`: função de chamada do modelo (default = llmFromEnv()); se ausente
// (sem chave) → 503 fail-closed. `db/products/orders/historyDays` injetáveis → testável sem infra.
export async function suggestReorder(productId, tenant, deps = {}) {
  const {
    db = pool,
    products = productsRepo,
    orders = ordersRepo,
    historyDays = Number(process.env.AI_HISTORY_DAYS) || 90,
  } = deps;

  // Fail-closed: resolve o LLM ANTES de qualquer trabalho. Sem chave → 503 claro.
  const call = 'llm' in deps ? deps.llm : await llmFromEnv();
  if (!call) throw aiUnavailable();

  const product = await products.findById(productId, tenant, db);
  if (!product) { const e = new Error('produto não encontrado'); e.status = 404; throw e; }

  // RAG-lite: recupera o histórico REAL do tenant para fundamentar a sugestão.
  const history = await orders.listRecentByProduct(productId, tenant, historyDays, db);
  const grounding = buildGrounding({ product, history });
  const { system, user } = buildPrompt(grounding);

  const text = await call({ system, user, model: MODEL, maxTokens: 400 });
  const suggestion = parseSuggestion(text); // fail-closed se inválida

  return {
    product: grounding.product,
    suggestion,
    grounding: { history_summary: grounding.history_summary, sources: grounding.sources },
    applied: false, // DRY-RUN: nada é persistido; o operador decide criar (ou não) o pedido.
    model: MODEL,
  };
}
