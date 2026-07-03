// Testes do validate-refinement-contract.mjs — anti-fabricação de contrato nos REFs.
// Regra sob teste: rota/campo citado DEVE existir no openapi OU vir marcado
// contract:"proposed" (endpoint novo a criar). Erro é ESTRUTURADO; shape aberto
// (objeto sem properties) rebaixa campo para WARNING (ausência não é provável).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  parseContract, checkRefinement, extractApiPath, pathCandidates, templateMatch,
} from './validate-refinement-contract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Contrato FECHADO (properties declaradas) — permite provar ausência de campo.
const CONTRACT_YAML = `
openapi: 3.0.3
info: { title: fixture, version: "1.0.0" }
paths:
  /v1/reports:
    get:
      parameters:
        - { name: status, in: query, schema: { type: string, enum: [pending, confirmed, refunded, failed] } }
        - { name: X-Role, in: header, schema: { type: string } }
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      type: object
                      properties:
                        id: { type: string }
                        type: { type: string }
                        status: { type: string, enum: [pending, confirmed, refunded, failed] }
                        created_at: { type: string }
                  total: { type: integer }
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                patient_id: { type: string }
                type: { type: string }
      responses:
        '202': { description: enfileirado }
  /v1/reports/{id}:
    get:
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Report' }
  /v1/opaque:
    get:
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  data: { type: array, items: { type: object } }
                  total: { type: integer }
components:
  schemas:
    Report:
      type: object
      properties:
        id: { type: string }
        type: { type: string }
`;

const contract = parseContract(CONTRACT_YAML);

const ref = (over = {}) => ({
  id: 'REF-FIXTURE-0001',
  title: 'Lista de relatórios',
  kind: 'screen',
  status: 'proposed',
  scope: { product_scope: 'fixture' },
  anchors: [{ requirement_id: 'REQ-FIXTURE-0001', relation: 'implements' }],
  surface: { route: '/reports', name: 'Relatórios' },
  behavior: {
    states: [{ name: 'normal' }],
    data: [
      { field: 'type', source: 'api:/api/reports', editable: false },
      { field: 'status', source: 'api:/api/reports', editable: false },
    ],
    interactions: [],
  },
  source: { source_paths: ['apps/fixture'] },
  version: { baseline_version: '1.0.0', item_revision: 1 },
  ...over,
});

test('helpers: extractApiPath só pega fontes api:; candidates normalizam /api e /v1', () => {
  assert.equal(extractApiPath('api:/api/reports?x=1'), '/api/reports');
  assert.equal(extractApiPath('REQ-GYMOPS-0001'), null);
  assert.equal(extractApiPath('Unit.address'), null);
  assert.ok(pathCandidates('/api/reports').includes('/v1/reports'));
  assert.ok(templateMatch('/v1/reports/{id}', '/v1/reports/123'));
  assert.ok(templateMatch('/v1/reports/{id}', '/v1/reports/:id'));
  assert.ok(!templateMatch('/v1/reports', '/v1/records'));
  assert.ok(!templateMatch('/v1/reports/{id}/x', '/v1/reports/{id}'));
});

test('contrato: parse coleta rotas, métodos e campos (com $ref); header não é campo', () => {
  const reports = contract.paths.find((p) => p.template === '/v1/reports');
  assert.ok(reports);
  assert.deepEqual([...reports.methods].sort(), ['get', 'post']);
  for (const f of ['data', 'total', 'id', 'type', 'status', 'created_at', 'patient_id']) assert.ok(reports.fields.has(f), f);
  assert.ok(!reports.fields.has('X-Role'), 'parametro de header nao vira campo de tela');
  const byId = contract.paths.find((p) => p.template === '/v1/reports/{id}');
  assert.ok(byId.fields.has('type'), '$ref para components.schemas resolvido');
  assert.equal(reports.open, false, 'schema fechado (properties declaradas)');
  assert.equal(contract.paths.find((p) => p.template === '/v1/opaque').open, true, 'items sem properties => aberto');
});

test('REF válida (rota + campos do contrato, com normalização /api -> /v1) passa', () => {
  const r = checkRefinement(ref(), contract);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('campo FABRICADO (report_type) em rota de schema fechado -> erro ESTRUTURADO field-not-in-contract', () => {
  const d = ref();
  d.behavior.data.push({ field: 'report_type', source: 'api:/api/reports', editable: false });
  const r = checkRefinement(d, contract);
  assert.equal(r.errors.length, 1);
  const e = r.errors[0];
  assert.equal(e.code, 'field-not-in-contract');
  assert.equal(e.ref, 'REF-FIXTURE-0001');
  assert.equal(e.field, 'report_type');
  assert.equal(e.route, '/v1/reports');
  assert.ok(Array.isArray(e.known_fields) && e.known_fields.includes('type'), 'erro lista os campos REAIS do contrato');
  assert.ok(e.hint.includes('proposed'));
});

test('rota FABRICADA (/api/settings) -> erro ESTRUTURADO route-not-in-contract', () => {
  const d = ref();
  d.behavior.data = [{ field: 'clinic_name', source: 'api:/api/settings', editable: true }];
  const r = checkRefinement(d, contract);
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'route-not-in-contract');
  assert.equal(r.errors[0].cited, '/api/settings');
  assert.ok(Array.isArray(r.errors[0].known_routes_sample));
});

test('contract:"proposed" marca endpoint NOVO a criar explicitamente -> sem erro, listado em proposed[]', () => {
  const d = ref();
  d.behavior.data = [{ field: 'clinic_name', source: 'api:/api/settings', editable: true, contract: 'proposed' }];
  const r = checkRefinement(d, contract);
  assert.deepEqual(r.errors, []);
  assert.equal(r.proposed.length, 1);
  assert.match(r.proposed[0].note, /NOVO a criar/);
});

test('campo ausente em rota de shape ABERTO -> warning field-unverifiable (não erro: ausência não é provável)', () => {
  const d = ref();
  d.behavior.data = [{ field: 'whatever', source: 'api:/v1/opaque', editable: false }];
  const r = checkRefinement(d, contract);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.warnings[0].code, 'field-unverifiable');
});

test('interaction citando rota inexistente -> erro; método não documentado -> erro; proposed -> ok', () => {
  const d = ref();
  d.behavior.interactions = [
    { trigger: 'salvar', action: 'PUT /api/settings com o formulário', result: 'salvo' },
    { trigger: 'excluir', action: 'DELETE /v1/reports', result: 'apagado' },
    { trigger: 'novo endpoint', action: 'POST /v1/settings-new', result: 'criado', contract: 'proposed' },
  ];
  const r = checkRefinement(d, contract);
  const codes = r.errors.map((e) => e.code).sort();
  assert.deepEqual(codes, ['interaction-method-not-in-contract', 'interaction-route-not-in-contract']);
  const method = r.errors.find((e) => e.code === 'interaction-method-not-in-contract');
  assert.equal(method.route, '/v1/reports');
  assert.deepEqual(method.known_methods.sort(), ['GET', 'POST']);
  assert.equal(r.proposed.length, 1);
});

test('fonte não-API (REQ-.../svc-.../campo de domínio) fica fora do escopo do gate', () => {
  const d = ref();
  d.behavior.data = [
    { field: 'nome', source: 'REQ-FIXTURE-0001', editable: false },
    { field: 'endereco', source: 'Unit.address', editable: false },
  ];
  const r = checkRefinement(d, contract);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

// ---- CLI end-to-end: exit code + JSON estruturado -------------------------------------------
test('CLI: REF com campo fabricado -> exit 1 + JSON com errors[]; REF válida -> exit 0', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ref-contract-'));
  const contractPath = path.join(tmp, 'openapi.yaml');
  fs.writeFileSync(contractPath, CONTRACT_YAML);
  const bad = ref();
  bad.behavior.data.push({ field: 'report_type', source: 'api:/api/reports', editable: false });
  const badPath = path.join(tmp, 'REF-FIXTURE-0001.yaml');
  fs.writeFileSync(badPath, JSON.stringify(bad)); // JSON é YAML válido
  const cli = path.join(__dirname, 'validate-refinement-contract.mjs');

  let failed = false;
  let out = '';
  try {
    execFileSync(process.execPath, [cli, '--file', badPath, '--contract', contractPath], { encoding: 'utf8' });
  } catch (e) {
    failed = true;
    out = String(e.stdout || '');
    assert.equal(e.status, 1);
  }
  assert.ok(failed, 'REF fabricada deve REPROVAR (exit 1)');
  const parsed = JSON.parse(out);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.errors[0].code, 'field-not-in-contract');

  const goodPath = path.join(tmp, 'REF-FIXTURE-0002.yaml');
  fs.writeFileSync(goodPath, JSON.stringify(ref({ id: 'REF-FIXTURE-0002' })));
  const okOut = execFileSync(process.execPath, [cli, '--file', goodPath, '--contract', contractPath], { encoding: 'utf8' });
  assert.equal(JSON.parse(okOut).ok, true);
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---- MODO NÃO-OPENAPI (F4): contrato EXTRAÍDO do backend real ---------------------------------
test('CLI sem openapi: contrato EXTRAÍDO do backend valida REFs (sem skip cego); rota fabricada reprova', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ref-extracted-'));
  const src = path.join(tmp, 'api-src');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, 'server.js'), `
    app.get('/v1/items', async (req) => { const { status } = req.query || {}; return { data: [], total: 0 }; });
    app.post('/v1/items', async (req, reply) => { const b = req.body || {}; if (!b.title) { reply.code(400); return { error: {} }; } return { id: 1 }; });
  `);
  const cli = path.join(__dirname, 'validate-refinement-contract.mjs');

  // REF válida contra a tabela extraída => exit 0, contract_mode extracted
  const good = ref({ id: 'REF-EXTRACTED-0001' });
  good.behavior.data = [
    { field: 'status', source: 'api:/v1/items', editable: false },
    { field: 'title', source: 'api:/v1/items', editable: true },
  ];
  good.behavior.interactions = [{ action: 'POST /v1/items ao salvar' }];
  const goodPath = path.join(tmp, 'REF-EXTRACTED-0001.yaml');
  fs.writeFileSync(goodPath, JSON.stringify(good));
  const okOut = execFileSync(process.execPath, [cli, '--file', goodPath, '--backend-src', src], { encoding: 'utf8' });
  const okParsed = JSON.parse(okOut);
  assert.equal(okParsed.ok, true);
  assert.equal(okParsed.contract_mode, 'extracted');

  // rota fabricada => erro estruturado (o buraco do skip fechou)
  const bad = ref({ id: 'REF-EXTRACTED-0002' });
  bad.behavior.data = [{ field: 'x', source: 'api:/v1/settings', editable: false }];
  const badPath = path.join(tmp, 'REF-EXTRACTED-0002.yaml');
  fs.writeFileSync(badPath, JSON.stringify(bad));
  let failed = false; let out = '';
  try {
    execFileSync(process.execPath, [cli, '--file', badPath, '--backend-src', src], { encoding: 'utf8' });
  } catch (e) { failed = true; out = String(e.stdout || ''); assert.equal(e.status, 1); }
  assert.ok(failed, 'rota fabricada deve REPROVAR também no modo extraído');
  assert.equal(JSON.parse(out).errors[0].code, 'route-not-in-contract');

  // campo fabricado em rota extraída de shape FECHADO => erro field-not-in-contract
  const badField = ref({ id: 'REF-EXTRACTED-0003' });
  badField.behavior.data = [{ field: 'report_type', source: 'api:/v1/items', editable: false }];
  const badFieldPath = path.join(tmp, 'REF-EXTRACTED-0003.yaml');
  fs.writeFileSync(badFieldPath, JSON.stringify(badField));
  failed = false; out = '';
  try {
    execFileSync(process.execPath, [cli, '--file', badFieldPath, '--backend-src', src], { encoding: 'utf8' });
  } catch (e) { failed = true; out = String(e.stdout || ''); }
  assert.ok(failed);
  assert.equal(JSON.parse(out).errors[0].code, 'field-not-in-contract');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('CLI: skip estruturado SÓ quando nem openapi nem backend extraível existem', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ref-skip-'));
  const goodPath = path.join(tmp, 'REF-SKIP-0001.yaml');
  fs.writeFileSync(goodPath, JSON.stringify(ref({ id: 'REF-SKIP-0001', scope: { product_scope: 'produto-sem-backend-xyz' } })));
  const cli = path.join(__dirname, 'validate-refinement-contract.mjs');
  const out = JSON.parse(execFileSync(process.execPath, [cli, '--file', goodPath], { encoding: 'utf8' }));
  assert.equal(out.ok, true);
  assert.ok(String(out.skipped || '').includes('sem contrato openapi e sem backend extraivel'));
  fs.rmSync(tmp, { recursive: true, force: true });
});
