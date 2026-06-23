// Testes de contrato para REF-HELPFLOW-0025 — Editar artigo (/kb-articles/:id/edit).
// Valida que o backend suporta o fluxo que a tela de edição consome:
//   1. GET /v1/kb-articles/:id   — carrega o artigo existente
//   2. PUT /v1/kb-articles/:id   — persiste as alterações
//   3. Campos editáveis (title, category, body) são aceitos e refletidos
//
// Obs.: testes só rodam em ambiente LIVE (BASE_URL definida); caso contrário são
// pulados — o build/build-only CI os ignora, e o integration CI os executa.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const API = (process.env.BASE_URL || '').replace(/\/$/, '');
const LIVE = !!API;
const H = { 'Content-Type': 'application/json' };
const post = (p, b) => fetch(API + p, { method: 'POST', headers: H, body: JSON.stringify(b) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const get = (p) => fetch(API + p, { headers: H }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const put = (p, b) => fetch(API + p, { method: 'PUT', headers: H, body: JSON.stringify(b) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const del = (p) => fetch(API + p, { method: 'DELETE', headers: H }).then((r) => r.status);

test('REF-HELPFLOW-0025: GET /v1/kb-articles/:id retorna artigo com campos editáveis (title, body, category)', {
  skip: LIVE ? false : 'sem BASE_URL',
}, async () => {
  // Cria artigo de teste
  const created = await post('/v1/kb-articles', {
    title: 'Artigo Teste Edição',
    body: 'Conteúdo inicial do artigo para teste de edição.',
    status: 'draft',
    category: 'Testes',
  });
  assert.equal(created.s, 201, 'criação retorna 201');
  const id = created.j.id;
  assert.ok(id, 'id retornado');

  try {
    // Tela de edição faz GET para preencher o formulário
    const fetched = await get('/v1/kb-articles/' + id);
    assert.equal(fetched.s, 200, 'GET retorna 200');
    assert.equal(fetched.j.title, 'Artigo Teste Edição', 'title presente');
    assert.equal(fetched.j.body, 'Conteúdo inicial do artigo para teste de edição.', 'body presente');
    assert.equal(fetched.j.category, 'Testes', 'category presente');
    assert.equal(fetched.j.status, 'draft', 'status presente');
  } finally {
    await del('/v1/kb-articles/' + id);
  }
});

test('REF-HELPFLOW-0025: PUT /v1/kb-articles/:id persiste alterações de title, body e category', {
  skip: LIVE ? false : 'sem BASE_URL',
}, async () => {
  const created = await post('/v1/kb-articles', {
    title: 'Título Original',
    body: 'Corpo original.',
    status: 'draft',
  });
  assert.equal(created.s, 201);
  const id = created.j.id;

  try {
    // Simula o payload que a tela de edição envia ao clicar em "Salvar e reindexar"
    const updated = await put('/v1/kb-articles/' + id, {
      title: 'Título Editado',
      body: 'Corpo atualizado com mais detalhes.',
      category: 'Categoria Nova',
      status: 'published',
    });
    assert.equal(updated.s, 200, 'PUT retorna 200');
    assert.equal(updated.j.title, 'Título Editado', 'title atualizado');
    assert.equal(updated.j.body, 'Corpo atualizado com mais detalhes.', 'body atualizado');
    assert.equal(updated.j.category, 'Categoria Nova', 'category atualizado');
    assert.equal(updated.j.status, 'published', 'status atualizado');
  } finally {
    await del('/v1/kb-articles/' + id);
  }
});

test('REF-HELPFLOW-0025: GET /v1/kb-articles/:id com id inexistente retorna 404 (estado notFound da tela)', {
  skip: LIVE ? false : 'sem BASE_URL',
}, async () => {
  const r = await get('/v1/kb-articles/999999999');
  assert.equal(r.s, 404, 'retorna 404 para artigo inexistente');
});
