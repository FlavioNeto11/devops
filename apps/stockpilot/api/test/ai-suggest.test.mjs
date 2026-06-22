// ai-suggest.test.mjs — REQ-STOCKPILOT-0008: assistente de IA que SUGERE a quantidade de reposição.
// Testes PUROS (sem Postgres, sem rede): grounding do prompt (dados reais), parse/validação da saída
// estruturada (fail-closed), DRY-RUN (não persiste) e fail-closed sem chave (503). O LLM e os
// repositórios são injetados → nenhuma infra é tocada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGrounding, buildPrompt, parseSuggestion, suggestReorder, llmFromEnv, MODEL,
} from '../src/services/ai-suggest-service.js';

const PRODUCT = { id: 5, name: 'Álcool 70%', current_stock: 5, min_stock: 50 };
const HISTORY = [
  { id: 101, status: 'delivered', created_at: '2026-05-01T10:00:00Z' },
  { id: 102, status: 'failed', created_at: '2026-04-15T10:00:00Z' },
  { id: 103, status: 'pending', created_at: '2026-06-01T10:00:00Z' },
];

// --- grounding: o prompt é fundamentado nos dados REAIS -----------------------
test('buildGrounding extrai estoque/déficit/histórico reais como fontes citáveis', () => {
  const g = buildGrounding({ product: PRODUCT, history: HISTORY });
  assert.equal(g.product.current_stock, 5);
  assert.equal(g.product.min_stock, 50);
  assert.equal(g.history_summary.deficit, 45);
  assert.equal(g.history_summary.delivered, 1);
  assert.equal(g.history_summary.failed, 1);
  assert.equal(g.history_summary.open, 1);
  assert.ok(g.sources.some((s) => s.includes('estoque_atual=5')));
  assert.ok(g.sources.some((s) => s.includes('estoque_minimo=50')));
  assert.ok(g.sources.some((s) => s.includes('deficit_vs_minimo=45')));
});

test('buildPrompt grounding: o texto enviado ao modelo cita os números REAIS e exige JSON', () => {
  const g = buildGrounding({ product: PRODUCT, history: HISTORY });
  const { system, user } = buildPrompt(g);
  assert.match(user, /Álcool 70%/);
  assert.match(user, /Estoque atual: 5/);
  assert.match(user, /Estoque mínimo: 50/);
  assert.match(user, /estoque_atual=5/);
  assert.match(system, /SOMENTE.*JSON/s);
  assert.match(system, /suggested_quantity/);
});

// --- saída estruturada: parse + validação estrita (fail-closed) ---------------
test('parseSuggestion: JSON válido → objeto normalizado', () => {
  const out = parseSuggestion('{"suggested_quantity": 60, "rationale": "repor", "confidence": "high", "sources": ["estoque_atual=5"]}');
  assert.equal(out.suggested_quantity, 60);
  assert.equal(out.confidence, 'high');
  assert.equal(out.rationale, 'repor');
  assert.deepEqual(out.sources, ['estoque_atual=5']);
});

test('parseSuggestion: aceita JSON cercado por ```json e ausência de sources → []', () => {
  const out = parseSuggestion('```json\n{"suggested_quantity": 10, "rationale": "x", "confidence": "low"}\n```');
  assert.equal(out.suggested_quantity, 10);
  assert.deepEqual(out.sources, []);
});

test('parseSuggestion FAIL-CLOSED: não-JSON → AppError estruturado (502), sem fallback', () => {
  let err;
  try { parseSuggestion('desculpe, não consigo responder em JSON'); } catch (e) { err = e; }
  assert.ok(err, 'deve lançar');
  assert.equal(err.name, 'AppError');
  assert.equal(err.code, 'AI_INVALID_OUTPUT');
  assert.equal(err.status, 502);
});

test('parseSuggestion FAIL-CLOSED: campos fora do schema → AppError', () => {
  // suggested_quantity não-inteiro
  assert.throws(() => parseSuggestion('{"suggested_quantity": 1.5, "rationale": "x", "confidence": "low"}'), /schema/);
  // suggested_quantity negativo
  assert.throws(() => parseSuggestion('{"suggested_quantity": -3, "rationale": "x", "confidence": "low"}'), /schema/);
  // confidence fora do enum
  assert.throws(() => parseSuggestion('{"suggested_quantity": 3, "rationale": "x", "confidence": "certeza"}'), /confidence/);
  // rationale ausente
  assert.throws(() => parseSuggestion('{"suggested_quantity": 3, "confidence": "low"}'), /rationale/);
  // sources de tipo errado
  assert.throws(() => parseSuggestion('{"suggested_quantity": 3, "rationale": "x", "confidence": "low", "sources": "a"}'), /sources/);
});

// --- fakes (sem Postgres) ----------------------------------------------------
function makeProducts(product = PRODUCT) {
  return { findById: async (id, _tenant, _db) => (product && id === product.id ? product : null) };
}
function makeOrders(history = HISTORY) {
  return {
    listRecentByProduct: async (_id, _tenant, _days, _db) => history,
    // DRY-RUN: criar pedido NUNCA deve ser chamado pelo assistente.
    create: async () => { throw new Error('VIOLAÇÃO DRY-RUN: o assistente não pode criar pedido'); },
  };
}

// --- suggestReorder: orquestração DRY-RUN ------------------------------------
test('suggestReorder: grounding chega ao LLM e a sugestão é devolvida SEM persistir (dry-run)', async () => {
  let promptSeen = null;
  const llm = async ({ system, user }) => {
    promptSeen = { system, user };
    return '{"suggested_quantity": 70, "rationale": "abaixo do mínimo", "confidence": "medium", "sources": ["estoque_atual=5"]}';
  };
  const r = await suggestReorder(5, 'acme', { llm, db: {}, products: makeProducts(), orders: makeOrders() });

  // prompt grounded com dados reais
  assert.match(promptSeen.user, /Estoque atual: 5/);
  assert.match(promptSeen.user, /Estoque mínimo: 50/);
  // saída estruturada
  assert.equal(r.suggestion.suggested_quantity, 70);
  assert.equal(r.suggestion.confidence, 'medium');
  // DRY-RUN: nada aplicado/persistido
  assert.equal(r.applied, false);
  assert.equal(r.model, MODEL);
  assert.equal(r.product.id, 5);
  assert.ok(r.grounding.sources.length > 0);
});

test('suggestReorder FAIL-CLOSED: LLM retorna não-JSON → AppError 502 (não persiste)', async () => {
  const llm = async () => 'não vou responder em JSON';
  await assert.rejects(
    () => suggestReorder(5, 'acme', { llm, db: {}, products: makeProducts(), orders: makeOrders() }),
    (e) => e.name === 'AppError' && e.status === 502,
  );
});

test('suggestReorder: produto inexistente → 404 (não chama o histórico)', async () => {
  const llm = async () => '{"suggested_quantity": 1, "rationale": "x", "confidence": "low"}';
  await assert.rejects(
    () => suggestReorder(999, 'acme', { llm, db: {}, products: makeProducts(), orders: makeOrders() }),
    (e) => e.status === 404,
  );
});

// --- fail-closed sem chave (503) ---------------------------------------------
test('suggestReorder FAIL-CLOSED: sem chave de IA (llm ausente) → 503 claro', async () => {
  await assert.rejects(
    () => suggestReorder(5, 'acme', { llm: null, db: {}, products: makeProducts(), orders: makeOrders() }),
    (e) => e.status === 503 && /ANTHROPIC_API_KEY/.test(e.message),
  );
});

test('llmFromEnv: sem ANTHROPIC_API_KEY → null (origem do 503 fail-closed)', async () => {
  assert.equal(await llmFromEnv({}), null);
  assert.equal(await llmFromEnv({ ANTHROPIC_API_KEY: '   ' }), null);
});
