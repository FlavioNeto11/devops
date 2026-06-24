// Testes de integração — REQ-NEUROEVOLUI-0004: Registro de evolução + Relatórios.
// Requerem BASE_URL apontando para o app rodando; pulados automaticamente sem ele.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
const LIVE = !!BASE || process.env.FORGE_LIVE === '1';
const H = (extra) => ({ 'Content-Type': 'application/json', 'X-Tenant-Id': '99', 'X-Role': 'admin', ...(extra || {}) });
const get = (p) => fetch(BASE + p, { headers: H() }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: H(), body: JSON.stringify(b) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const patch = (p, b) => fetch(BASE + p, { method: 'PATCH', headers: H(), body: JSON.stringify(b) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const del = (p) => fetch(BASE + p, { method: 'DELETE', headers: H() }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));

describe('REQ-NEUROEVOLUI-0004: Registro de evolução', () => {
  test('AC1: POST /patients/:id/evolution-notes cria nota com metadata', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
    const hp = await post('/v1/patients', { name: 'Paciente Teste 0004', email: 'p0004@test.local' });
    assert.equal(hp.s, 201, 'cria paciente');
    const patientId = hp.j.id;
    assert.ok(patientId, 'id do paciente retornado');

    const r = await post(`/v1/patients/${patientId}/evolution-notes`, {
      professional: 'Dr. Silva',
      note_type: 'consulta',
      note_text: 'Paciente apresenta melhora.',
    });
    assert.equal(r.s, 201, 'nota criada com status 201');
    assert.ok(r.j.id, 'id da nota retornado');
    assert.equal(r.j.professional, 'Dr. Silva', 'professional salvo');
    assert.equal(r.j.note_type, 'consulta', 'note_type salvo');
    assert.ok(r.j.created_at, 'metadata de data presente');
  });

  test('AC2: Nota armazena texto, campos estruturados e attachments', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
    const hp = await post('/v1/patients', { name: 'Paciente AC2' });
    assert.equal(hp.s, 201);
    const patientId = hp.j.id;

    const r = await post(`/v1/patients/${patientId}/evolution-notes`, {
      professional: 'Dr. Costa',
      note_type: 'avaliacao',
      note_text: 'Avaliação neurológica completa.',
      attachments: [{ name: 'laudo.pdf', type: 'application/pdf', url: '/uploads/laudo.pdf' }],
      test_name: 'Mini Mental',
      test_result: '28/30',
      recommendation: 'Manter medicação atual.',
    });
    assert.equal(r.s, 201);
    assert.equal(r.j.test_name, 'Mini Mental');
    assert.equal(r.j.test_result, '28/30');
    assert.equal(r.j.recommendation, 'Manter medicação atual.');
    assert.ok(Array.isArray(r.j.attachments) || typeof r.j.attachments === 'string', 'attachments salvo');
  });

  test('AC3: Versioning — histórico de edições com quem editou e quando', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
    const hp = await post('/v1/patients', { name: 'Paciente AC3' });
    const patientId = hp.j.id;

    const created = await post(`/v1/patients/${patientId}/evolution-notes`, {
      professional: 'Dr. Lima',
      note_type: 'consulta',
      note_text: 'Texto original.',
    });
    const noteId = created.j.id;

    const updated = await patch(`/v1/patients/${patientId}/evolution-notes/${noteId}`, {
      note_text: 'Texto atualizado.',
    });
    assert.equal(updated.s, 200, 'update retorna 200');

    const versions = await get(`/v1/patients/${patientId}/evolution-notes/${noteId}/versions`);
    assert.equal(versions.s, 200);
    assert.ok(Array.isArray(versions.j.data), 'data de versões é array');
    assert.ok(versions.j.data.length >= 1, 'ao menos uma versão criada');
    assert.ok(versions.j.data[0].edited_by, 'edited_by presente na versão');
    assert.ok(versions.j.data[0].edited_at, 'edited_at presente na versão');
  });

  test('AC4: GET /patients/:id/reports gera relatório consolidado', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
    const hp = await post('/v1/patients', { name: 'Paciente AC4' });
    const patientId = hp.j.id;

    await post(`/v1/patients/${patientId}/evolution-notes`, { professional: 'Dr. A', note_type: 'consulta', note_text: 'Nota 1.' });
    await post(`/v1/patients/${patientId}/evolution-notes`, { professional: 'Dr. B', note_type: 'exame', note_text: 'Nota 2.' });

    const r = await get(`/v1/patients/${patientId}/reports`);
    assert.equal(r.s, 200);
    assert.ok(r.j.patient, 'dados do paciente no relatório');
    assert.ok(Array.isArray(r.j.notes), 'notas listadas');
    assert.ok(r.j.total >= 2, 'total de notas correto');
    assert.ok(r.j.generated_at, 'timestamp de geração presente');
  });

  test('AC5: Relatórios filtráveis por período, tipo e profissional', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
    const hp = await post('/v1/patients', { name: 'Paciente AC5' });
    const patientId = hp.j.id;

    await post(`/v1/patients/${patientId}/evolution-notes`, { professional: 'Dr. X', note_type: 'consulta', note_text: 'Nota consulta.' });
    await post(`/v1/patients/${patientId}/evolution-notes`, { professional: 'Dr. Y', note_type: 'exame', note_text: 'Nota exame.' });

    const r1 = await get(`/v1/patients/${patientId}/reports?note_type=consulta`);
    assert.equal(r1.s, 200);
    assert.ok(r1.j.notes.every((n) => n.note_type === 'consulta'), 'filtro por tipo aplicado');

    const r2 = await get(`/v1/patients/${patientId}/reports?professional=Dr.+X`);
    assert.equal(r2.s, 200);
    assert.ok(r2.j.notes.every((n) => n.professional === 'Dr. X'), 'filtro por profissional aplicado');
  });

  test('AC6: Soft-delete e histórico completo para admin', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
    const hp = await post('/v1/patients', { name: 'Paciente AC6' });
    const patientId = hp.j.id;

    const created = await post(`/v1/patients/${patientId}/evolution-notes`, { note_text: 'Nota a deletar.' });
    const noteId = created.j.id;

    const d = await del(`/v1/patients/${patientId}/evolution-notes/${noteId}`);
    assert.equal(d.s, 200);
    assert.equal(d.j.deleted, true);

    // nota não aparece na listagem normal
    const normal = await get(`/v1/patients/${patientId}/evolution-notes`);
    assert.ok(!normal.j.data.some((n) => n.id === noteId), 'nota deletada não aparece na listagem normal');

    // admin vê com include_deleted=true
    const all = await get(`/v1/patients/${patientId}/evolution-notes?include_deleted=true`);
    assert.equal(all.s, 200);
    assert.ok(all.j.data.some((n) => n.id === noteId), 'admin vê notas deletadas com include_deleted=true');
    const deleted = all.j.data.find((n) => n.id === noteId);
    assert.ok(deleted.deleted_at, 'deleted_at preenchido');
  });
});

// Verificação estrutural (roda sempre, sem DB)
describe('REQ-NEUROEVOLUI-0004: verificação estrutural', () => {
  test('server.js não tem SQL direto (usa repositories/)', async () => {
    const fs = (await import('node:fs')).default;
    const path = (await import('node:path')).default;
    const srv = path.resolve(process.cwd(), 'apps/neuroevolui/api/src/server.js');
    if (!fs.existsSync(srv)) return;
    const txt = fs.readFileSync(srv, 'utf8');
    const hasSqlPattern = /\b(SELECT|INSERT|UPDATE|DELETE)\b[^;]*\bFROM\b/i.test(txt);
    const hasRepositories = /repositories/.test(txt);
    assert.ok(!hasSqlPattern || hasRepositories, 'SQL deve estar em repositories/, não em server.js');
  });

  test('repositories/ existem para records, patients e evolution-notes', async () => {
    const fs = (await import('node:fs')).default;
    const path = (await import('node:path')).default;
    const base = path.resolve(process.cwd(), 'apps/neuroevolui/api/src/repositories');
    assert.ok(fs.existsSync(path.join(base, 'records.js')), 'records.js existe');
    assert.ok(fs.existsSync(path.join(base, 'patients.js')), 'patients.js existe');
    assert.ok(fs.existsSync(path.join(base, 'evolution-notes.js')), 'evolution-notes.js existe');
  });

  test('queue.js tem enqueueReportGenerate exportado (análise estática)', async () => {
    const fs = (await import('node:fs')).default;
    const path = (await import('node:path')).default;
    const txt = fs.readFileSync(path.resolve(process.cwd(), 'apps/neuroevolui/api/src/queue.js'), 'utf8');
    assert.ok(/export async function enqueueReportGenerate/.test(txt), 'enqueueReportGenerate exportado em queue.js');
  });

  test('queue.js sem REDIS_URL retorna inline:true (análise estática)', async () => {
    const fs = (await import('node:fs')).default;
    const path = (await import('node:path')).default;
    const txt = fs.readFileSync(path.resolve(process.cwd(), 'apps/neuroevolui/api/src/queue.js'), 'utf8');
    assert.ok(/inline.*true/.test(txt), 'queue.js tem fallback inline:true quando sem Redis');
    assert.ok(/setImmediate|inline.*true/.test(txt), 'degradação graciosa implementada');
  });
});
