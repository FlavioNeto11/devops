import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractChatResult } from '../src/ai/graph.js';

const grounding = [
  { id: 'REQ-GYMOPS-0001', title: 'Autenticacao', statement: 'O sistema DEVE autenticar' },
  { id: 'REQ-GYMOPS-0009', title: 'Onboarding', statement: 'O sistema DEVE guiar o onboarding' },
];

test('extract: draft via tool -> intent create, sem duplicacao, next_question vazio', () => {
  const result = {
    text: 'Proponho o requisito abaixo; revise.',
    evidence: [
      { tool: 'search_requirements', output: { results: [{ id: 'REQ-GYMOPS-0001' }] } },
      { tool: 'propose_requirement_draft', output: { title: 'Tela de boas-vindas', type: 'functional', statement: 'O sistema DEVE exibir boas-vindas', scope: { applies_to: 'product', product_scope: 'gymops' } } },
    ],
  };
  const out = extractChatResult(result, { product: 'gymops', grounding });
  assert.equal(out.intent, 'create');
  assert.equal(out.draft.title, 'Tela de boas-vindas');
  assert.equal(out.next_question, '');
  assert.equal(out.reply, 'Proponho o requisito abaixo; revise.');
  assert.deepEqual(out.citations, ['REQ-GYMOPS-0001']); // do search, dentro do grounding
  assert.equal(out.grounded, true);
});

test('extract: refino de existente -> intent edit', () => {
  const result = { text: 'Proponho a versao revisada.', evidence: [{ tool: 'propose_requirement_draft', output: { title: 'X', statement: 'O sistema DEVE X' } }] };
  const out = extractChatResult(result, { product: 'gymops', target_req_id: 'REQ-GYMOPS-0009', grounding });
  assert.equal(out.intent, 'edit');
});

test('extract: pergunta respondida com citacao -> intent question, grounded true', () => {
  const result = { text: 'A autenticacao usa OIDC.', evidence: [{ tool: 'get_requirement', output: { id: 'REQ-GYMOPS-0001', title: 'Autenticacao' } }] };
  const out = extractChatResult(result, { product: 'gymops', grounding });
  assert.equal(out.intent, 'question');
  assert.deepEqual(out.citations, ['REQ-GYMOPS-0001']);
  assert.equal(out.grounded, true);
  assert.equal(out.draft, null);
});

test('extract: pergunta sem base -> question + grounded false (badge "nao consta")', () => {
  const result = { text: 'Nao ha requisito sobre isso.', evidence: [] };
  const out = extractChatResult(result, { product: 'gymops', grounding });
  assert.equal(out.intent, 'question');
  assert.equal(out.grounded, false);
});

test('extract: reply terminando em "?" sem draft -> intent clarify (sem badge)', () => {
  const result = { text: 'Quem deve ver a tela: todos ou so no primeiro login?', evidence: [] };
  const out = extractChatResult(result, { product: 'gymops', grounding });
  assert.equal(out.intent, 'clarify');
});

test('extract: id alucinado fora do grounding e descartado', () => {
  const result = { text: 'ok', evidence: [{ tool: 'search_requirements', output: { results: [{ id: 'REQ-FAKE-9999' }, { id: 'REQ-GYMOPS-0001' }] } }] };
  const out = extractChatResult(result, { product: 'gymops', grounding });
  assert.deepEqual(out.citations, ['REQ-GYMOPS-0001']);
});
