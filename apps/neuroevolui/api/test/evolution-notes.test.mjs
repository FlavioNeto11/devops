// test/evolution-notes.test.mjs — testes de integração para REQ-NEUROEVOLUI-0004.
// Requer servidor + banco de dados ativos (BASE_URL ou localhost:8080).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const LIVE = !!(process.env.DATABASE_URL || process.env.BASE_URL);
const SKIP = LIVE ? false : 'sem DATABASE_URL/BASE_URL';

const H = (extra) => ({ 'Content-Type': 'application/json', ...extra });
const get = (p, h) => fetch(BASE + p, { headers: H(h) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const post = (p, b, h) => fetch(BASE + p, { method: 'POST', headers: H(h), body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const patch = (p, b, h) => fetch(BASE + p, { method: 'PATCH', headers: H(h), body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const del = (p, h) => fetch(BASE + p, { method: 'DELETE', headers: H(h) }).then((r) => r.status);

test('health — servidor saudável', { skip: SKIP }, async () => {
  const r = await get('/health');
  assert.equal(r.s, 200);
  assert.equal(r.j.status, 'ok');
});

test('AC1 — POST /v1/patients/:id/evolution-notes cria nota com metadata', { skip: SKIP }, async () => {
  const pRes = await post('/v1/patients', { name: 'Paciente AC1' });
  assert.equal(pRes.s, 201, 'cria paciente');
  const patientId = pRes.j.id;
  assert.ok(patientId, 'paciente tem id');

  const nRes = await post(`/v1/patients/${patientId}/evolution-notes`, {
    professional: 'Dr. Silva',
    note_type: 'consulta',
    note_date: '2024-01-15',
    text_content: 'Paciente apresenta melhora significativa.',
  });
  assert.equal(nRes.s, 201, 'nota criada');
  const note = nRes.j;
  assert.ok(note.id, 'nota tem id');
  assert.equal(note.professional, 'Dr. Silva', 'professional salvo');
  assert.equal(note.note_type, 'consulta', 'note_type salvo');
  assert.ok(note.note_date, 'note_date salvo');
  assert.ok(note.created_at, 'created_at preenchido');
});

test('AC1 — POST sem professional retorna 400', { skip: SKIP }, async () => {
  const pRes = await post('/v1/patients', { name: 'Paciente AC1b' });
  const nRes = await post(`/v1/patients/${pRes.j.id}/evolution-notes`, { text_content: 'sem profissional' });
  assert.equal(nRes.s, 400, '400 sem professional');
});

test('AC2 — notas armazenam campos estruturados (teste, resultado, recomendação) e anexos', { skip: SKIP }, async () => {
  const pRes = await post('/v1/patients', { name: 'Paciente AC2' });
  const patientId = pRes.j.id;

  const nRes = await post(`/v1/patients/${patientId}/evolution-notes`, {
    professional: 'Dra. Santos',
    note_type: 'avaliacao',
    text_content: 'Avaliação neurológica detalhada.',
    test_name: 'MMSE',
    test_result: '27/30',
    recommendation: 'Manter acompanhamento mensal',
    attachments: [{ filename: 'laudo.pdf', mimetype: 'application/pdf', size_bytes: 102400 }],
  });
  assert.equal(nRes.s, 201, 'nota com campos estruturados criada');
  const note = nRes.j;
  assert.equal(note.test_name, 'MMSE', 'test_name armazenado');
  assert.equal(note.test_result, '27/30', 'test_result armazenado');
  assert.equal(note.recommendation, 'Manter acompanhamento mensal', 'recommendation armazenado');

  // Verificar anexos
  const aRes = await get(`/v1/patients/${patientId}/evolution-notes/${note.id}/attachments`);
  assert.equal(aRes.s, 200, 'lista anexos OK');
  assert.equal(aRes.j.data.length, 1, '1 anexo registrado');
  assert.equal(aRes.j.data[0].filename, 'laudo.pdf', 'filename correto');
  assert.equal(aRes.j.data[0].mimetype, 'application/pdf', 'mimetype correto');
});

test('AC3 — versioning: PATCH cria versão; GET /versions retorna histórico', { skip: SKIP }, async () => {
  const pRes = await post('/v1/patients', { name: 'Paciente AC3' });
  const patientId = pRes.j.id;

  const nRes = await post(`/v1/patients/${patientId}/evolution-notes`, {
    professional: 'Dr. Costa',
    text_content: 'Texto original.',
  });
  const noteId = nRes.j.id;

  // Editar nota — cria versão V2
  const eRes = await patch(`/v1/patients/${patientId}/evolution-notes/${noteId}`, {
    text_content: 'Texto editado.',
  });
  assert.equal(eRes.s, 200, 'edição retorna 200');
  assert.equal(eRes.j.text_content, 'Texto editado.', 'conteúdo atualizado');

  // Verificar histórico de versões
  const vRes = await get(`/v1/patients/${patientId}/evolution-notes/${noteId}/versions`);
  assert.equal(vRes.s, 200, 'histórico de versões retorna 200');
  assert.ok(Array.isArray(vRes.j.data), 'data é array');
  assert.ok(vRes.j.data.length >= 2, 'ao menos 2 versões (criação + edição)');
  assert.ok(typeof vRes.j.data[0].editor === 'string', 'editor registrado');
  assert.ok(vRes.j.data[0].edited_at, 'edited_at preenchido');
  assert.ok(vRes.j.data[0].snapshot, 'snapshot salvo');
});

test('AC4 — GET /v1/patients/:id/reports gera relatório consolidado', { skip: SKIP }, async () => {
  const pRes = await post('/v1/patients', { name: 'Paciente AC4' });
  const patientId = pRes.j.id;

  await post(`/v1/patients/${patientId}/evolution-notes`, { professional: 'Dr. A', note_type: 'consulta', note_date: '2024-01-10', text_content: 'Consulta inicial' });
  await post(`/v1/patients/${patientId}/evolution-notes`, { professional: 'Dr. A', note_type: 'avaliacao', note_date: '2024-02-05', text_content: 'Avaliação de progresso' });

  const rRes = await get(`/v1/patients/${patientId}/reports`);
  // Aceita 200 (inline, sem Redis) ou 202 (async, com Redis)
  assert.ok(rRes.s === 200 || rRes.s === 202, 'relatório aceito (200 inline ou 202 async)');

  if (rRes.s === 200) {
    assert.ok(rRes.j.total_notes >= 2, 'relatório contém as notas');
    assert.ok(rRes.j.patient, 'dados do paciente presentes');
    assert.ok(Array.isArray(rRes.j.notes), 'notes é array');
    assert.ok(rRes.j.generated_at, 'generated_at preenchido');
  } else {
    // async — verifica que job foi enfileirado
    assert.ok(rRes.j.id || rRes.j.enqueued, 'job enfileirado');
  }
});

test('AC5 — relatórios filtráveis por período, tipo e profissional', { skip: SKIP }, async () => {
  const pRes = await post('/v1/patients', { name: 'Paciente AC5' });
  const patientId = pRes.j.id;

  await post(`/v1/patients/${patientId}/evolution-notes`, { professional: 'DrAlpha', note_type: 'consulta', note_date: '2024-01-10', text_content: 'Nota 1' });
  await post(`/v1/patients/${patientId}/evolution-notes`, { professional: 'DraBeta', note_type: 'avaliacao', note_date: '2024-03-20', text_content: 'Nota 2' });

  // Filtrar por profissional
  const f1 = await get(`/v1/patients/${patientId}/reports?professional=DrAlpha`);
  assert.ok(f1.s === 200 || f1.s === 202, 'filtro profissional aceito');
  if (f1.s === 200) assert.equal(f1.j.total_notes, 1, 'filtro por profissional retorna 1 nota');

  // Filtrar por tipo
  const f2 = await get(`/v1/patients/${patientId}/reports?type=avaliacao`);
  assert.ok(f2.s === 200 || f2.s === 202, 'filtro tipo aceito');
  if (f2.s === 200) assert.equal(f2.j.total_notes, 1, 'filtro por tipo retorna 1 nota');

  // Filtrar por período
  const f3 = await get(`/v1/patients/${patientId}/reports?from=2024-03-01&to=2024-03-31`);
  assert.ok(f3.s === 200 || f3.s === 202, 'filtro período aceito');
  if (f3.s === 200) assert.equal(f3.j.total_notes, 1, 'filtro por período retorna 1 nota');
});

test('AC6 — soft-delete em notas + histórico completo para admin', { skip: SKIP }, async () => {
  const pRes = await post('/v1/patients', { name: 'Paciente AC6' });
  const patientId = pRes.j.id;

  const nRes = await post(`/v1/patients/${patientId}/evolution-notes`, { professional: 'Dr. Delete', text_content: 'Nota para deletar.' });
  const noteId = nRes.j.id;

  // Nota visível antes do delete
  const list1 = await get(`/v1/patients/${patientId}/evolution-notes`);
  assert.ok(list1.j.data.some((n) => n.id === noteId), 'nota visível antes do delete');

  // Member não pode deletar
  const dFail = await del(`/v1/patients/${patientId}/evolution-notes/${noteId}`, { 'X-Role': 'member' });
  assert.equal(dFail, 403, 'member recebe 403');

  // Admin pode fazer soft-delete
  const dOk = await del(`/v1/patients/${patientId}/evolution-notes/${noteId}`, { 'X-Role': 'admin' });
  assert.equal(dOk, 200, 'admin recebe 200');

  // Nota não aparece na listagem normal
  const list2 = await get(`/v1/patients/${patientId}/evolution-notes`);
  assert.ok(!list2.j.data.some((n) => n.id === noteId), 'nota oculta após soft-delete');

  // Admin vê nota com include_deleted=true (histórico completo)
  const list3 = await get(`/v1/patients/${patientId}/evolution-notes?include_deleted=true`, { 'X-Role': 'admin' });
  assert.ok(list3.j.data.some((n) => n.id === noteId), 'nota visível com include_deleted=true (admin)');
  const deletedNote = list3.j.data.find((n) => n.id === noteId);
  assert.ok(deletedNote.deleted_at, 'deleted_at preenchido');
  assert.ok(deletedNote.deleted_by, 'deleted_by preenchido');
});

test('redis-bullmq — fallback inline sem REDIS_URL não gera erro', { skip: SKIP }, async () => {
  // Verifica que o servidor responde sem crash quando Redis pode estar ausente
  const qRes = await get('/v1/health/queue');
  assert.equal(qRes.s, 200, 'health queue retorna 200');
  assert.ok(typeof qRes.j.queue === 'object', 'queue status retornado');
});
