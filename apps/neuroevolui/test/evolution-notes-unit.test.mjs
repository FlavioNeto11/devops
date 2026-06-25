// test/evolution-notes-unit.test.mjs — valida camadas-rigidas e estrutura do módulo sem DB/servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => readFileSync(join(dir, '..', 'api', 'src', rel), 'utf8');

test('camadas-rigidas: server.js não importa pg diretamente', () => {
  const src = readSrc('server.js');
  assert.ok(!src.includes("from 'pg'"), 'server.js não deve importar pg (SQL deve estar em repositories)');
  assert.ok(!src.includes('require(\'pg\')'), 'server.js não deve require pg');
});

test('camadas-rigidas: evolution notes routes em server.js chamam apenas services (não repositories nem pool)', () => {
  const src = readSrc('server.js');
  // Confirma que as rotas de evolution-notes e patient-reports usam services, não pool diretamente
  assert.ok(src.includes('addEvolutionNote'), 'server chama addEvolutionNote (service)');
  assert.ok(src.includes('requestPatientReport'), 'server chama requestPatientReport (service)');
  // O pool.query direto só existe no bloco /health legado — não nas novas rotas
  const evolSection = src.slice(src.indexOf('// Evolution Notes'));
  assert.ok(!evolSection.includes('pool.query'), 'seção evolution notes não usa pool.query diretamente');
});

test('camadas-rigidas: evolution-notes-service.js não importa pg', () => {
  const src = readSrc('services/evolution-notes-service.js');
  assert.ok(!src.includes("from 'pg'"), 'service não deve importar pg diretamente');
  assert.ok(!src.includes('pool.query'), 'service não deve usar pool.query (use repository)');
});

test('camadas-rigidas: patient-reports-service.js não importa pg', () => {
  const src = readSrc('services/patient-reports-service.js');
  assert.ok(!src.includes("from 'pg'"), 'service não deve importar pg diretamente');
  assert.ok(!src.includes('pool.query'), 'service não deve usar pool.query (use repository)');
});

test('camadas-rigidas: repositories exportam as funções esperadas', async () => {
  // Verifica apenas a presença das funções no código-fonte (sem instanciar pool)
  const notesRepo = readSrc('repositories/evolution-notes-repo.js');
  for (const fn of ['createEvolutionNote', 'listEvolutionNotes', 'findEvolutionNote', 'updateEvolutionNote', 'softDeleteEvolutionNote', 'createNoteVersion', 'listNoteVersions']) {
    assert.ok(notesRepo.includes(`export async function ${fn}`), `evolution-notes-repo deve exportar ${fn}`);
  }
  const reportsRepo = readSrc('repositories/patient-reports-repo.js');
  for (const fn of ['createPatientReport', 'findPatientReport', 'listPatientReports', 'markPatientReportCompleted']) {
    assert.ok(reportsRepo.includes(`export async function ${fn}`), `patient-reports-repo deve exportar ${fn}`);
  }
});

test('camadas-rigidas: server.js importa apenas services/ e repositories/ para evolution notes', () => {
  const src = readSrc('server.js');
  assert.ok(src.includes("from './services/evolution-notes-service.js'"), 'server deve importar de services');
  assert.ok(src.includes("from './services/patient-reports-service.js'"), 'server deve importar de services');
  assert.ok(!src.includes("from './repositories/evolution-notes-repo.js'"), 'server não deve importar repos de evolution-notes direto (passa pelo service)');
});

test('db.js contém migrações das 4 novas tabelas', () => {
  const src = readSrc('db.js');
  for (const table of ['evolution_notes', 'evolution_note_attachments', 'evolution_note_versions', 'patient_reports']) {
    assert.ok(src.includes(table), `db.js deve ter migração para ${table}`);
  }
});

test('redis-bullmq: fila patient-reports registrada em queue.js', () => {
  const src = readSrc('queue.js');
  assert.ok(src.includes("'patient-reports'"), 'queue.js deve definir fila patient-reports');
});

test('redis-bullmq: worker.js processa fila patient-reports', () => {
  const src = readSrc('worker.js');
  assert.ok(src.includes("'patient-reports'"), 'worker.js deve incluir patient-reports na lista de workers');
  assert.ok(src.includes('processPatientReport'), 'worker.js deve chamar processPatientReport');
});

test('redis-bullmq: enqueue patient-reports — inline sem REDIS_URL', async () => {
  const { enqueue } = await import('../api/src/queue.js');
  const result = await enqueue('patient-reports', 'report-test-unit', { reportId: 1 });
  assert.equal(result.inline, true, 'deve ser inline sem Redis');
  assert.ok(result.job_id.startsWith('inline-'), 'job_id deve ter prefixo inline-');
});
