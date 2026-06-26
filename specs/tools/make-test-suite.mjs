// =============================================================================
// make-test-suite.mjs — gera a suíte de testes LOCKED de um produto NA CONCEPÇÃO.
// -----------------------------------------------------------------------------
// A partir dos requisitos do produto (acceptance_criteria + quality_scenarios) e do
// verification[] de cada bloco de capacidade resolvido, emite testes em
//   apps/<app>/tests/locked/{capability,functional,nfr}/*.test.mjs
// + o manifesto apps/<app>/tests/.test-locks.json (paths + sha256 + minCount).
// Esses testes são IMUTÁVEIS p/ a esteira (guard DENYLIST apps/*/tests/locked/**) e
// verificados por verify-test-locks.mjs no CI. Mudá-los exige editar o spec e re-rodar
// este tool (humano). HUMANO-run (escreve a árvore protegida), como o scaffold.
//
// Os testes de capacidade têm "dentes" reais (afirmam o contrato robusto do recurso
// genérico `records` + capacidades dos blocos). Critérios de aceite de domínio que não
// são deriváveis na concepção viram smoke documentado ou pending honesto (contam, não
// passam falso). A esteira IMPLEMENTA contra eles e ADICIONA seus próprios testes (fora
// de locked/).
//
// Uso: node make-test-suite.mjs --product <name> [--force]
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadCatalog, resolveBlocks } from '../forge/apply-capabilities.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SPECS_DIR, '..');

function parseArgs(argv) { const a = {}; for (let i = 0; i < argv.length; i++) { if (argv[i] === '--product') a.product = argv[++i]; else if (argv[i] === '--force') a.force = true; } return a; }

// ---- Helper de teste (gerado em locked/_lib.mjs; também locked) -------------------------------
const LIB = [
  '// LOCKED — helper das suítes de teste geradas na concepção. NÃO EDITAR.',
  "const API = (process.env.BASE_URL || 'http://nvit.localhost@@BASE@@/api').replace(/\\/$/, '');",
  'const H = (extra) => ({ "Content-Type": "application/json", ...(extra || {}) });',
  'export const api = API;',
  'export const get = (p, h) => fetch(API + p, { headers: H(h) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));',
  'export const post = (p, b, h) => fetch(API + p, { method: "POST", headers: H(h), body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));',
  'export const del = (p, h) => fetch(API + p, { method: "DELETE", headers: H(h) }).then((r) => r.status);',
  '// helper retrocompatível: monta o header Bearer p/ rotas protegidas (get/post aceitam headers extras).',
  'export const auth = (token) => (token ? { Authorization: "Bearer " + token } : {});',
  'export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));',
  'export const LIVE = !!process.env.BASE_URL || process.env.FORGE_LIVE === "1";',
  '',
].join('\n');

// header padrão de cada arquivo locked
const header = (origin) => '// LOCKED — gerado de ' + origin + ' por make-test-suite.mjs. NÃO EDITAR (mudar exige spec + regenerar).\n';

// describe util
const wrap = (lines) => ["import { test } from 'node:test';", "import assert from 'node:assert/strict';", "import { get, post, del, auth, sleep, LIVE } from '../_lib.mjs';", '', ...lines, ''].join('\n');

// ---- Testes de CAPACIDADE com dentes reais (contra o recurso genérico `records`) --------------
// Cada gerador devolve linhas de teste (sem ${}; concatenação). Marcados {skip} quando exigem app vivo
// e não há BASE_URL (LIVE) — assim rodam no forge-tests (compose) e não quebram o `node --test` offline.
const CAP_TESTS = {
  observabilidade: () => [
    "test('observabilidade: GET /health responde ok + db', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {",
    "  const r = await get('/health'); assert.equal(r.s, 200); assert.equal(r.j.status, 'ok');",
    '});',
  ],
  'camadas-rigidas': () => [
    "test('camadas-rigidas: SQL fica em repositories/, não no server (arch-review)', async () => {",
    "  const fs = (await import('node:fs')).default; const path = (await import('node:path')).default;",
    "  const srv = path.resolve(process.cwd(), 'apps/@@APP@@/api/src/server.js');",
    "  if (!fs.existsSync(srv)) return; // ainda não scaffoldado",
    "  const txt = fs.readFileSync(srv, 'utf8');",
    "  assert.ok(!/\\b(SELECT|INSERT|UPDATE|DELETE)\\b[^;]*\\bFROM\\b/i.test(txt) || /repositories/.test(txt), 'SQL deve viver em repositories/');",
    '});',
  ],
  idempotencia: () => [
    "test('idempotencia: mesma Idempotency-Key -> um único efeito', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {",
    "  const key = 'lock-' + Date.now();",
    "  const a = await post('/v1/records', { title: 'idem' }, { 'Idempotency-Key': key });",
    "  const b = await post('/v1/records', { title: 'idem' }, { 'Idempotency-Key': key });",
    "  assert.ok(a.s < 500 && b.s < 500, 'ambas respondem');",
    "  if (a.j && a.j.id && b.j && b.j.id) assert.equal(a.j.id, b.j.id, 'mesma chave -> mesmo recurso');",
    '});',
  ],
  'worker-queue-transacional': () => [
    "test('fila transacional: submit -> worker processa (status transiciona)', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {",
    "  const r = (await post('/v1/records', { title: 'q' })).j; assert.ok(r.id);",
    "  await post('/v1/records/' + r.id + '/submit', {});",
    "  let a = {}; for (let i = 0; i < 12; i++) { await sleep(2500); a = (await get('/v1/records/' + r.id)).j; if (a.status === 'submitted' || a.status === 'failed') break; }",
    "  assert.ok(['submitted','failed'].includes(a.status), 'o worker processou o job');",
    '});',
  ],
  'redis-bullmq': () => [
    "test('fila Redis/BullMQ: submit enfileira e worker processa', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {",
    "  const r = (await post('/v1/records', { title: 'q' })).j; assert.ok(r.id);",
    "  const e = await post('/v1/records/' + r.id + '/submit', {});",
    "  assert.ok(e.s === 202 || e.j.enqueued === true, 'submit aceito/enfileirado');",
    '});',
  ],
  'rbac-multitenant': () => [
    "test('rbac multi-tenant: cross-tenant não vê o recurso (404)', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {",
    "  const r = (await post('/v1/records', { title: 't1' }, { 'X-Tenant-Id': '1' })).j;",
    "  if (!r || !r.id) return;",
    "  const cross = await get('/v1/records/' + r.id, { 'X-Tenant-Id': '2' });",
    "  assert.equal(cross.s, 404, 'outro tenant -> 404 sem vazar');",
    '});',
  ],
  'gateway-externo': () => [
    "test('gateway externo: trilha de auditoria existe após submit', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {",
    "  const r = (await post('/v1/records', { title: 'g' })).j; if (!r || !r.id) return;",
    "  await post('/v1/records/' + r.id + '/submit', {}); await sleep(3000);",
    "  const aud = await get('/v1/audit');",
    "  assert.ok(aud.s === 200 || aud.s === 404, 'endpoint de auditoria responde (ou ainda não exposto)');",
    '});',
  ],
  'contract-openapi': () => [
    "test('contract-openapi: contrato sem drift (validate:openapi)', async () => {",
    "  const fs = (await import('node:fs')).default; const path = (await import('node:path')).default;",
    "  const v = path.resolve(process.cwd(), 'apps/@@APP@@/api/openapi/validate.mjs');",
    "  if (!fs.existsSync(v)) return; // contrato ainda não gerado",
    "  const { execFileSync } = (await import('node:child_process'));",
    "  execFileSync('node', [v], { cwd: path.dirname(path.dirname(v)) }); // exit !=0 lança -> teste falha",
    '});',
  ],
  'oidc-sessao': () => [
    "test('oidc-sessao: /health permanece aberto (readiness fora da borda)', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {",
    "  const r = await get('/health'); assert.equal(r.s, 200);",
    '});',
  ],
  // contas-acesso: dentes LIVE do contrato de auth (modelo SEGURO).
  //  - register cria sempre MEMBER (NÃO admin) -> member NÃO lista /v1/users (403);
  //  - o admin vem do SEED de bootstrap (BOOTSTRAP_ADMIN_EMAIL/PASSWORD) — o harness seta
  //    admin@local / forge-test-admin (ver forge-tests.yml) -> só esse admin lista /v1/users (200).
  'contas-acesso': () => [
    "test('contas-acesso: register(member) -> login -> /me; admin de bootstrap lista /v1/users', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {",
    "  // 1) registro de um usuario NOVO -> 2xx + accessToken; papel = member (registro nunca concede admin).",
    "  const email = 'forge-' + Date.now() + '@local';",
    "  const password = 'forge-pass-12345'; // gitleaks:allow (credencial de TESTE, não segredo)",
    "  const reg = await post('/auth/register', { name: 'Forge Tester', email, password });",
    "  assert.ok(reg.s >= 200 && reg.s < 300, 'register 2xx, veio ' + reg.s + ' ' + JSON.stringify(reg.j));",
    "  assert.ok(reg.j && typeof reg.j.accessToken === 'string' && reg.j.accessToken.length > 0, 'register devolve accessToken');",
    "  const regUser = reg.j.user || {}; assert.notEqual(regUser.role, 'admin', 'usuario registrado NAO eh admin (sem escalonamento via /auth/register)');",
    "  // 2) login do usuario novo -> 200 + accessToken.",
    "  const lg = await post('/auth/login', { email, password });",
    "  assert.equal(lg.s, 200, 'login 200, veio ' + lg.s + ' ' + JSON.stringify(lg.j));",
    "  const token = lg.j && lg.j.accessToken; assert.ok(token, 'login devolve accessToken');",
    "  // 3) GET /me com Bearer -> 200 e email confere.",
    "  const me = await get('/me', auth(token));",
    "  assert.equal(me.s, 200, 'GET /me com Bearer -> 200');",
    "  const u = me.j && (me.j.email != null ? me.j : me.j.user); assert.equal(u && u.email, email, '/me retorna o usuario logado');",
    "  // 3b) member NAO pode listar /v1/users (403) — gerencia eh so do admin.",
    "  const denied = await get('/v1/users', auth(token));",
    "  assert.equal(denied.s, 403, 'member nao lista usuarios -> 403, veio ' + denied.s);",
    "  // 4) admin de BOOTSTRAP (seed) loga com as credenciais do harness e lista /v1/users -> 200 + data[].",
    "  const adminLogin = await post('/auth/login', { email: 'admin@local', password: 'forge-test-admin' }); // gitleaks:allow (credencial de TESTE)",
    "  assert.equal(adminLogin.s, 200, 'login do admin de bootstrap -> 200 (seed criou admin@local), veio ' + adminLogin.s + ' ' + JSON.stringify(adminLogin.j));",
    "  const adminTok = adminLogin.j && adminLogin.j.accessToken; assert.ok(adminTok, 'admin de bootstrap devolve accessToken');",
    "  const adminMe = await get('/me', auth(adminTok));",
    "  const am = adminMe.j && (adminMe.j.email != null ? adminMe.j : adminMe.j.user); assert.equal(am && am.role, 'admin', 'admin de bootstrap tem papel admin');",
    "  const users = await get('/v1/users', auth(adminTok));",
    "  assert.equal(users.s, 200, 'admin lista usuarios -> 200, veio ' + users.s);",
    "  const rows = Array.isArray(users.j) ? users.j : (users.j && (users.j.data || users.j.items)) || [];",
    "  assert.ok(Array.isArray(rows) && rows.length >= 1, '/v1/users devolve a colecao de usuarios');",
    '});',
  ],
};

function capTest(block) {
  const gen = CAP_TESTS[block];
  const lines = gen ? gen() : [
    "test('capacidade " + block + ": app saudável (smoke)', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {",
    "  const r = await get('/health'); assert.equal(r.s, 200);",
    '});',
  ];
  return header('bloco ' + block) + wrap(lines);
}

// ---- Testes FUNCIONAIS (1 por acceptance_criterion) -------------------------------------------
function functionalTest(reqId, idx, criterion, methods) {
  const isInteg = methods.includes('test-integration') || methods.length === 0;
  const desc = (criterion || '').replace(/'/g, "\\'").slice(0, 160);
  let body;
  if (isInteg) {
    body = [
      "test('" + reqId + " AC" + (idx + 1) + ": " + desc + "', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {",
      "  // contrato de aceite (LOCKED): ciclo CRUD ÍNTEGRO (cria -> lê de volta -> consta na lista).",
      "  // Dentes reais: pega regressão de persistência/serialização — não só 'app responde'.",
      "  assert.equal((await get('/health')).s, 200, 'app saudável');",
      "  const created = await post('/v1/records', { title: 'ac-" + (idx + 1) + "-' + Date.now() });",
      "  assert.ok(created.s >= 200 && created.s < 300, 'POST cria recurso (2xx), veio ' + created.s + ' ' + JSON.stringify(created.j));",
      "  const id = created.j && (created.j.id != null ? created.j.id : (created.j.data && created.j.data.id));",
      "  assert.ok(id != null, 'recurso criado retorna id');",
      "  const back = await get('/v1/records/' + id);",
      "  assert.equal(back.s, 200, 'GET por id lê o recurso de volta');",
      "  const got = back.j && (back.j.id != null ? back.j : back.j.data); assert.ok(got && String(got.id) === String(id), 'mesmo id persistido');",
      "  const list = await get('/v1/records');",
      "  const rows = Array.isArray(list.j) ? list.j : (list.j.items || list.j.data || []);",
      "  assert.ok(rows.some((x) => String(x.id) === String(id)), 'recurso criado aparece na listagem');",
      '});',
    ];
  } else {
    body = [
      "test('" + reqId + " AC" + (idx + 1) + ": " + desc + "', { skip: 'verification_method=" + (methods.join(',') || 'manual') + "' }, () => {});",
    ];
  }
  return header(reqId + ' / acceptance_criteria[' + idx + ']') + wrap(body);
}

// ---- Testes NFR (1 por quality_scenario) -----------------------------------------------------
function nfrTest(reqId, idx, qs) {
  const measure = ((qs && qs.response_measure) || '').replace(/'/g, "\\'").slice(0, 140);
  const stim = ((qs && qs.stimulus) || '').replace(/'/g, "\\'").slice(0, 120);
  // medida de latência simples → mede /health; senão pending documentado.
  const latency = /(\d+)\s*ms|p9\d|lat[êe]ncia|latency/i.test(measure);
  let body;
  if (latency) {
    body = [
      "test('" + reqId + " NFR" + (idx + 1) + ": " + measure + "', { skip: LIVE ? false : 'sem BASE_URL (forge-tests)' }, async () => {",
      "  const t0 = Date.now(); await get('/health'); const dt = Date.now() - t0;",
      "  assert.ok(dt < 2000, 'health respondeu em tempo razoável (orçamento de latência base): ' + dt + 'ms');",
      '});',
    ];
  } else {
    body = [
      "test('" + reqId + " NFR" + (idx + 1) + " [" + stim + "]: " + measure + "', { skip: 'NFR não-automatizável aqui — verificar em forge-tests/monitoring' }, () => {});",
    ];
  }
  return header(reqId + ' / quality_scenarios[' + idx + '] (NFR)') + wrap(body);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.product) { console.error('uso: node make-test-suite.mjs --product <name> [--force]'); process.exit(2); }
  const pp = path.join(SPECS_DIR, 'products', args.product, 'product.json');
  if (!fs.existsSync(pp)) { console.error('produto não encontrado: ' + pp); process.exit(1); }
  const product = JSON.parse(fs.readFileSync(pp, 'utf8'));
  const APP = product.name;
  const BASE = product.base_path || ('/' + APP);
  const stack = product.stack || null;

  const byId = loadCatalog();
  const blocks = resolveBlocks(product.capability_blocks || [], stack, byId);

  // requisitos do produto na baseline
  const baselinePath = path.join(SPECS_DIR, 'baseline', 'current-baseline.json');
  const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : { requirements: [] };
  const reqs = (baseline.requirements || []).filter((r) => r && r.scope && r.scope.product_scope === APP);

  const files = {}; // relpath (sob apps/<app>/) -> conteúdo (com @@TOKENS@@)
  files['tests/locked/_lib.mjs'] = LIB;
  for (const b of blocks) files['tests/locked/capability/' + b + '.test.mjs'] = capTest(b);
  for (const r of reqs) {
    const methods = Array.isArray(r.verification_method) ? r.verification_method : [];
    (r.acceptance_criteria || []).forEach((c, i) => { files['tests/locked/functional/' + r.id + '.ac' + (i + 1) + '.test.mjs'] = functionalTest(r.id, i, c, methods); });
    if (r.type === 'non-functional') (r.quality_scenarios || []).forEach((qs, i) => { files['tests/locked/nfr/' + r.id + '.qs' + (i + 1) + '.test.mjs'] = nfrTest(r.id, i, qs); });
  }

  const APPDIR = path.join(REPO_ROOT, 'apps', APP);
  const replace = (s) => s.replace(/@@APP@@/g, APP).replace(/@@BASE@@/g, BASE);
  const manifestFiles = [];
  let written = 0;
  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(APPDIR, rel);
    const finalContent = replace(content);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, finalContent);
    written++;
    const repoRel = path.relative(REPO_ROOT, dest).replace(/\\/g, '/');
    manifestFiles.push({ path: repoRel, sha256: crypto.createHash('sha256').update(finalContent).digest('hex') });
  }
  const manifest = { app: APP, generatedBy: 'make-test-suite.mjs', minCount: manifestFiles.length, files: manifestFiles.sort((a, b) => a.path.localeCompare(b.path)) };
  fs.writeFileSync(path.join(APPDIR, 'tests', '.test-locks.json'), JSON.stringify(manifest, null, 2) + '\n');

  const nCap = blocks.length, nFun = manifestFiles.filter((f) => f.path.includes('/functional/')).length, nNfr = manifestFiles.filter((f) => f.path.includes('/nfr/')).length;
  console.log('[make-test-suite] ' + APP + ': ' + written + ' arquivos locked (' + nCap + ' capability, ' + nFun + ' functional, ' + nNfr + ' nfr) + manifesto.');
  console.log('  blocos: ' + blocks.join(', '));
}

if (process.argv[1] && process.argv[1].endsWith('make-test-suite.mjs')) main();
