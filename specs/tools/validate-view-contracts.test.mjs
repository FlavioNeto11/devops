// Testes do validate-view-contracts.mjs — anti-fabricação de contrato nas VIEWS.
// Fixture mínima reproduz as CLASSES de defeito do PR #211 (contaviva-360):
// campo de payload errado, enum inexistente, rota/método fabricado, multipart
// contra rota JSON-only, campo de resposta fabricado, CTA para rota removida e
// rota registrada inalcançável — e prova que o app LIMPO passa com exit 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  parsePathExpr, apiTemplateMatch, findApiRoute, routerTemplateMatch, resolveNavExpr,
} from './validate-view-contracts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, 'validate-view-contracts.mjs');

// ---- unidades ---------------------------------------------------------------------------------

test('parsePathExpr: literal, concat com id (=> :_dyn), qs() como query, BASE removido', () => {
  assert.deepEqual(parsePathExpr("'/v1/tasks'").template, '/v1/tasks');
  assert.equal(parsePathExpr("'/v1/tasks/' + id + '/comments'").template, '/v1/tasks/:_dyn/comments');
  assert.equal(parsePathExpr("'/v1/nf/report' + qs(params)").template, '/v1/nf/report');
  assert.equal(parsePathExpr("BASE + '/v1/nf/' + id + '/pdf'").template, '/v1/nf/:_dyn/pdf');
  assert.equal(parsePathExpr('`${BASE}/v1/items/${id}`').template, '/v1/items/:_dyn');
  const trailing = parsePathExpr("'/v1/assistant/audit' + (qs ? '?' + qs : '')");
  assert.equal(trailing.template, '/v1/assistant/audit');
  assert.equal(parsePathExpr('somethingDynamic').ok, false, 'sem literal inicial => sem prova');
});

test('findApiRoute: rota ESTÁTICA prioriza sobre {param} (semântica do router real)', () => {
  const contract = {
    paths: [
      { template: '/v1/nf/{id}', methods: new Set(['get']), fields: new Set(), open: true },
      { template: '/v1/nf/report', methods: new Set(['get']), fields: new Set(), open: false },
    ],
  };
  assert.equal(findApiRoute(contract, '/v1/nf/report').template, '/v1/nf/report');
  assert.equal(findApiRoute(contract, '/v1/nf/:_dyn').template, '/v1/nf/{id}');
  assert.equal(findApiRoute(contract, '/v1/outra'), null);
});

test('apiTemplateMatch: citado dinâmico NÃO casa com literal do contrato', () => {
  assert.equal(apiTemplateMatch('/v1/pf/{id}/assets', '/v1/pf/:_dyn/assets'), true);
  assert.equal(apiTemplateMatch('/v1/pf/new', '/v1/pf/:_dyn'), false);
  assert.equal(apiTemplateMatch('/v1/pf/{id}', '/v1/pf/123'), true);
});

test('routerTemplateMatch: :param casa com qualquer segmento; literal exige igualdade', () => {
  assert.equal(routerTemplateMatch('/pj/:id', '/pj/:_dyn'), true);
  assert.equal(routerTemplateMatch('/pj/new', '/pj/:_dyn'), false, 'dinâmico vs literal: sem prova => sem match');
  assert.equal(routerTemplateMatch('/pj/new', '/pj/new'), true);
  assert.equal(routerTemplateMatch('/dashboard/pj/:id', '/pj/:_dyn'), false, 'comprimentos diferentes');
});

test('resolveNavExpr: literal, objeto {name}, ident -> const/computed com literais', () => {
  assert.deepEqual(resolveNavExpr("'/tasks'").targets, ['/tasks']);
  assert.deepEqual(resolveNavExpr("{ name: 'tasks-list' }").names, ['tasks-list']);
  const script = "const roleRoute = computed(() => role === 'pf' ? '/dashboard/pf' : '/dashboard/admin');\n";
  assert.deepEqual(resolveNavExpr('roleRoute', script).targets.sort(), ['/dashboard/admin', '/dashboard/pf']);
  assert.equal(resolveNavExpr('props.to', script).unresolved, 1, 'expressão irrastreável conta como dinâmica');
});

// ---- fixture end-to-end -----------------------------------------------------------------------

const BACKEND = `
const STATUS = ['pendente', 'pago', 'cancelado'];
export function registerRoutes(app) {
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/me', async (req) => ({ email: null, name: null, role: null }));
  app.get('/v1/tasks', async (req) => { const { status } = req.query || {}; return { data: [], total: 0 }; });
  app.get('/v1/tasks/:id', async (req) => { return rows[0]; });
  app.post('/v1/tasks', async (req, reply) => {
    const b = req.body || {};
    if (!b.title) { reply.code(400); return { error: { message: 'title obrigatório' } }; }
    if (b.status && !STATUS.includes(b.status)) { reply.code(400); return { error: { message: 'x' } }; }
    reply.code(201); return { id: 1, title: b.title };
  });
  app.patch('/v1/tasks/:id/status', async (req, reply) => {
    const { novo_status } = req.body || {};
    if (!novo_status || !STATUS.includes(novo_status)) { reply.code(400); return { error: { message: 'x' } }; }
    return { id: 1, status: novo_status };
  });
  app.get('/v1/report', async (req) => {
    const report = { gerado_em: 1, resumo: {}, notas: [] };
    return report;
  });
}
`;

function writeFixture({ apiJs, views, routerJs, navJs, mainJs }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vvc-'));
  const fe = path.join(tmp, 'frontend', 'src');
  const be = path.join(tmp, 'api', 'src');
  fs.mkdirSync(path.join(fe, 'views'), { recursive: true });
  fs.mkdirSync(be, { recursive: true });
  fs.writeFileSync(path.join(be, 'server.js'), BACKEND);
  fs.writeFileSync(path.join(fe, 'api.js'), apiJs);
  fs.writeFileSync(path.join(fe, 'router.js'), routerJs);
  if (navJs) fs.writeFileSync(path.join(fe, 'nav.js'), navJs);
  if (mainJs) fs.writeFileSync(path.join(fe, 'main.js'), mainJs);
  for (const [name, content] of Object.entries(views || {})) fs.writeFileSync(path.join(fe, 'views', name), content);
  return tmp;
}

function runCli(appDir) {
  try {
    const out = execFileSync(process.execPath, [CLI, '--product', 'fixture', '--app-dir', appDir], { encoding: 'utf8' });
    return { code: 0, out: JSON.parse(out) };
  } catch (e) {
    return { code: e.status, out: JSON.parse(String(e.stdout || '{}')) };
  }
}

const CLEAN_API = `
export const BASE = '/fixture/api';
export async function request(method, path, body) { return {}; }
export function qs(p) { return ''; }
export function resourceFactory(name) {
  const root = "/v1/" + name;
  return { list: (p) => request("GET", root + qs(p)), get: (id) => request("GET", root + "/" + id), create: (b) => request("POST", root, b) };
}
export const tasks = resourceFactory('tasks');
export const patchTaskStatus = (id, novo_status) => request('PATCH', '/v1/tasks/' + id + '/status', { novo_status });
export const getReport = (p) => request('GET', '/v1/report' + qs(p));
export const me = () => request('GET', '/me');
`;

const CLEAN_ROUTER = `
import TasksListView from './views/TasksListView.vue';
import TasksDetailView from './views/TasksDetailView.vue';
import NotFoundView from './views/NotFoundView.vue';
export const routes = [
  { path: '/', redirect: '/tasks' },
  { path: '/tasks', name: 'tasks-list', component: TasksListView },
  { path: '/tasks/:id', name: 'tasks-detail', component: TasksDetailView, props: true },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
];
`;

const CLEAN_NAV = `export const nav = [ { group: 'x', items: [ { label: 'Tarefas', to: '/tasks', name: 'tasks-list' } ] } ];`;

const CLEAN_LIST_VIEW = `<template>
  <div><button @click="open(row)">abrir</button></div>
</template>
<script setup>
import { tasks, patchTaskStatus } from '../api.js';
import { useRouter } from 'vue-router';
const router = useRouter();
async function load() { const d = await tasks.list({}); return d.data; }
async function marcarPago(row) { await patchTaskStatus(row.id, 'pago'); }
function open(row) { router.push('/tasks/' + row.id); }
</script>`;

const CLEAN_DETAIL_VIEW = `<template>
  <div><RouterLink to="/tasks">voltar</RouterLink></div>
</template>
<script setup>
import { getReport } from '../api.js';
async function loadReport() {
  const data = await getReport({});
  return { quando: data.gerado_em, resumo: data.resumo };
}
</script>`;

const NOT_FOUND = `<template><div>404</div></template>`;

test('fixture LIMPA passa: exit 0, zero erros', () => {
  const tmp = writeFixture({
    apiJs: CLEAN_API,
    routerJs: CLEAN_ROUTER,
    navJs: CLEAN_NAV,
    views: { 'TasksListView.vue': CLEAN_LIST_VIEW, 'TasksDetailView.vue': CLEAN_DETAIL_VIEW, 'NotFoundView.vue': NOT_FOUND },
  });
  const r = runCli(tmp);
  assert.deepEqual(r.out.errors, [], 'sem erros: ' + JSON.stringify(r.out.errors));
  assert.equal(r.code, 0);
  assert.equal(r.out.contract_mode, 'extracted');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('payload fabricado ({status} vs {novo_status}) => payload-field-not-in-contract com arquivo:linha', () => {
  const api = CLEAN_API.replace("{ novo_status }", '{ status: novo_status }');
  const tmp = writeFixture({
    apiJs: api, routerJs: CLEAN_ROUTER, navJs: CLEAN_NAV,
    views: { 'TasksListView.vue': CLEAN_LIST_VIEW, 'TasksDetailView.vue': CLEAN_DETAIL_VIEW, 'NotFoundView.vue': NOT_FOUND },
  });
  const r = runCli(tmp);
  const e = r.out.errors.find((x) => x.code === 'payload-field-not-in-contract');
  assert.ok(e, 'esperava payload-field-not-in-contract: ' + JSON.stringify(r.out.errors));
  assert.equal(e.field, 'status');
  assert.equal(e.route, '/v1/tasks/{id}/status');
  assert.equal(e.file, 'frontend/src/api.js');
  assert.ok(e.line > 0);
  assert.ok(e.known_fields.includes('novo_status'), 'erro estruturado aponta os campos REAIS');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('enum fabricado (aprovado) no call-site de wrapper => payload-enum-not-in-contract', () => {
  const view = CLEAN_LIST_VIEW.replace("'pago'", "'aprovado'");
  const tmp = writeFixture({
    apiJs: CLEAN_API, routerJs: CLEAN_ROUTER, navJs: CLEAN_NAV,
    views: { 'TasksListView.vue': view, 'TasksDetailView.vue': CLEAN_DETAIL_VIEW, 'NotFoundView.vue': NOT_FOUND },
  });
  const r = runCli(tmp);
  const e = r.out.errors.find((x) => x.code === 'payload-enum-not-in-contract');
  assert.ok(e, JSON.stringify(r.out.errors));
  assert.equal(e.value, 'aprovado');
  assert.deepEqual(e.known_values, ['pendente', 'pago', 'cancelado']);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('rota fabricada e método inexistente => view-route/method-not-in-backend', () => {
  const view = `<template><div/></template>
<script setup>
import { request } from '../api.js';
async function a() { await request('GET', '/v1/assistant/audit'); }
async function b() { await request('PUT', '/v1/tasks/' + id); }
</script>`;
  const tmp = writeFixture({
    apiJs: CLEAN_API, routerJs: CLEAN_ROUTER, navJs: CLEAN_NAV,
    views: { 'TasksListView.vue': CLEAN_LIST_VIEW, 'TasksDetailView.vue': view, 'NotFoundView.vue': NOT_FOUND },
  });
  const r = runCli(tmp);
  assert.ok(r.out.errors.some((x) => x.code === 'view-route-not-in-backend' && x.cited === '/v1/assistant/audit'), JSON.stringify(r.out.errors));
  assert.ok(r.out.errors.some((x) => x.code === 'view-method-not-in-backend' && x.method === 'PUT' && x.route === '/v1/tasks/{id}'));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('resourceFactory de recurso inexistente => resource-route-not-in-backend', () => {
  const view = `<template><div/></template>
<script setup>
import { resourceFactory } from '../api.js';
const audit = resourceFactory('assistant/audit');
</script>`;
  const tmp = writeFixture({
    apiJs: CLEAN_API, routerJs: CLEAN_ROUTER, navJs: CLEAN_NAV,
    views: { 'TasksListView.vue': CLEAN_LIST_VIEW, 'TasksDetailView.vue': view, 'NotFoundView.vue': NOT_FOUND },
  });
  const r = runCli(tmp);
  assert.ok(r.out.errors.some((x) => x.code === 'resource-route-not-in-backend' && x.cited === '/v1/assistant/audit'), JSON.stringify(r.out.errors));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('FormData contra rota JSON-only => multipart-not-accepted (rastreado pelo wrapper do api.js)', () => {
  const api = CLEAN_API + `
export async function createAttachment(id, formData) {
  const res = await fetch(BASE + '/v1/tasks/' + id + '/status', { method: 'PATCH', body: formData });
  return res.json();
}
`;
  const view = `<template><div/></template>
<script setup>
import { createAttachment } from '../api.js';
async function up(id, file) {
  const fd = new FormData();
  fd.append('file', file);
  await createAttachment(id, fd);
}
</script>`;
  const tmp = writeFixture({
    apiJs: api, routerJs: CLEAN_ROUTER, navJs: CLEAN_NAV,
    views: { 'TasksListView.vue': CLEAN_LIST_VIEW, 'TasksDetailView.vue': view, 'NotFoundView.vue': NOT_FOUND },
  });
  const r = runCli(tmp);
  const e = r.out.errors.find((x) => x.code === 'multipart-not-accepted');
  assert.ok(e, JSON.stringify(r.out.errors));
  assert.equal(e.route, '/v1/tasks/{id}/status');
  assert.equal(e.file, 'frontend/src/views/TasksDetailView.vue');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('campo de RESPOSTA fabricado (linhas/por_mes) => response-field-not-in-contract; fallback de campo conhecido => warning', () => {
  const view = `<template><div/></template>
<script setup>
import { getReport, me } from '../api.js';
async function load() {
  const data = await getReport({});
  const linhas = data.linhas;         // fabricado (real: notas)
  return linhas;
}
async function who() {
  const user = await me();
  return (user.role || user.perfil);  // perfil não existe, mas role cobre => warning
}
</script>`;
  const tmp = writeFixture({
    apiJs: CLEAN_API, routerJs: CLEAN_ROUTER, navJs: CLEAN_NAV,
    views: { 'TasksListView.vue': CLEAN_LIST_VIEW, 'TasksDetailView.vue': view, 'NotFoundView.vue': NOT_FOUND },
  });
  const r = runCli(tmp);
  const e = r.out.errors.find((x) => x.code === 'response-field-not-in-contract');
  assert.ok(e, JSON.stringify(r.out.errors));
  assert.equal(e.field, 'linhas');
  assert.equal(e.route, '/v1/report');
  assert.ok(!r.out.errors.some((x) => x.field === 'perfil'), 'fallback de campo conhecido NÃO é erro');
  assert.ok(r.out.warnings.some((x) => x.code === 'response-field-fallback-unverifiable' && x.field === 'perfil'));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('CTA para rota removida (to=/push/wrapper local) => nav-route-not-in-router', () => {
  const view = `<template>
  <div>
    <UiButton to="/financial/dashboard">Ver financeiro</UiButton>
    <button @click="navigate('/financial/cash-flow')">fluxo</button>
  </div>
</template>
<script setup>
import { useRouter } from 'vue-router';
const router = useRouter();
function navigate(path) { router.push(path); }
function goOld() { router.push('/pj/novo'); }
</script>`;
  const tmp = writeFixture({
    apiJs: CLEAN_API, routerJs: CLEAN_ROUTER, navJs: CLEAN_NAV,
    views: { 'TasksListView.vue': CLEAN_LIST_VIEW, 'TasksDetailView.vue': view, 'NotFoundView.vue': NOT_FOUND },
  });
  const r = runCli(tmp);
  const cited = r.out.errors.filter((x) => x.code === 'nav-route-not-in-router').map((x) => x.cited).sort();
  assert.deepEqual(cited, ['/financial/cash-flow', '/financial/dashboard', '/pj/novo'], JSON.stringify(r.out.errors));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('rota registrada sem call-site => route-unreachable; meta directEntry escapa explicitamente', () => {
  const router = CLEAN_ROUTER.replace(
    "{ path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },",
    "{ path: '/dashboard/pj/:id', name: 'pj-detail', component: TasksDetailView, props: true },\n  { path: '/direta', name: 'direta', component: TasksDetailView, meta: { directEntry: true } },\n  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },",
  );
  const tmp = writeFixture({
    apiJs: CLEAN_API, routerJs: router, navJs: CLEAN_NAV,
    views: { 'TasksListView.vue': CLEAN_LIST_VIEW, 'TasksDetailView.vue': CLEAN_DETAIL_VIEW, 'NotFoundView.vue': NOT_FOUND },
  });
  const r = runCli(tmp);
  const un = r.out.errors.filter((x) => x.code === 'route-unreachable');
  assert.deepEqual(un.map((x) => x.route), ['/dashboard/pj/:id'], JSON.stringify(r.out.errors));
  assert.ok(!un.some((x) => x.route === '/direta'), 'meta directEntry é a saída EXPLÍCITA');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('rota com base duplicada (createWebHistory) => warning route-path-includes-base', () => {
  const router = CLEAN_ROUTER.replace(
    "{ path: '/tasks', name: 'tasks-list', component: TasksListView },",
    "{ path: '/tasks', name: 'tasks-list', component: TasksListView },\n  { path: '/fixture/report', name: 'report', component: TasksDetailView, meta: { directEntry: true } },",
  );
  const tmp = writeFixture({
    apiJs: CLEAN_API, routerJs: router, navJs: CLEAN_NAV,
    mainJs: "import { createRouter, createWebHistory } from 'vue-router';\nconst router = createRouter({ history: createWebHistory('/fixture/'), routes });",
    views: { 'TasksListView.vue': CLEAN_LIST_VIEW, 'TasksDetailView.vue': CLEAN_DETAIL_VIEW, 'NotFoundView.vue': NOT_FOUND },
  });
  const r = runCli(tmp);
  assert.ok(r.out.warnings.some((x) => x.code === 'route-path-includes-base' && x.route === '/fixture/report'), JSON.stringify(r.out.warnings));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('app sem frontend => skip estruturado (exit 0)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vvc-nofe-'));
  const r = runCli(tmp);
  assert.equal(r.code, 0);
  assert.ok(r.out.skipped);
  fs.rmSync(tmp, { recursive: true, force: true });
});
