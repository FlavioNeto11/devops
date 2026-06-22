// =============================================================================
// scaffold-frontend.mjs — gera um FRONTEND Vue REAL (SPA) para um app gerado pela Forja,
// quando o produto pede interface web (product.interfaces inclui "web"). ADITIVO: emite
// apps/<app>/frontend/** + apps/<app>/k8s/<app>-frontend.yaml + anexa o service frontend ao
// devops.yaml — sem tocar no gerador de backend (baixo risco). Mais rico que o painel único
// do StockPilot: vue-router + views (Dashboard/Lista/Detalhe) + componentes reutilizáveis +
// client de API + design-tokens + estados loading/empty/error + a11y. Recurso genérico `records`.
//
// Roteamento (regra de ouro): frontend stripPrefix:false, priority 10, base /<app>/; a API
// (priority 40 + strip) continua vencendo /<app>/api. Código gerado por concatenação + tokens
// @@APP@@/@@TITLE@@/@@BASE@@ (Vue usa {{ }}, não ${}; api.js usa concatenação).
//
// Uso: node scaffold-frontend.mjs --product <name> [--force]
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SPECS_DIR, '..');

function parseArgs(argv) { const a = {}; for (let i = 0; i < argv.length; i++) { if (argv[i] === '--product') a.product = argv[++i]; else if (argv[i] === '--force') a.force = true; } return a; }
const args = parseArgs(process.argv.slice(2));
if (!args.product) { console.error('uso: node scaffold-frontend.mjs --product <name> [--force]'); process.exit(2); }
const pp = path.join(SPECS_DIR, 'products', args.product, 'product.json');
if (!fs.existsSync(pp)) { console.error('produto não encontrado: ' + pp); process.exit(1); }
const product = JSON.parse(fs.readFileSync(pp, 'utf8'));
const interfaces = Array.isArray(product.interfaces) ? product.interfaces : ['api'];
if (!interfaces.includes('web')) { console.log('[scaffold-frontend] ' + product.name + ': interfaces sem "web" — só-API, nada a gerar.'); process.exit(0); }

const APP = product.name;
const TITLE = product.display_name || APP;
const BASE = product.base_path || ('/' + APP);
const APPDIR = path.join(REPO_ROOT, 'apps', APP);

const files = {};
const add = (rel, content) => { files[rel] = content; };

add('frontend/package.json', JSON.stringify({
  name: '@@APP@@-frontend', version: '1.0.0', private: true, type: 'module',
  scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
  dependencies: { vue: '^3.4.0', 'vue-router': '^4.3.0' },
  devDependencies: { vite: '^5.2.0', '@vitejs/plugin-vue': '^5.0.0' },
}, null, 2) + '\n');

add('frontend/vite.config.js', [
  "import { defineConfig } from 'vite';",
  "import vue from '@vitejs/plugin-vue';",
  '// base = @@BASE@@/ p/ os assets resolverem sob o subpath do Traefik. Proxy dev -> API local.',
  'export default defineConfig({',
  "  base: '@@BASE@@/',",
  '  plugins: [vue()],',
  "  server: { proxy: { '@@BASE@@/api': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (p) => p.replace('@@BASE@@/api', '') } } },",
  '});', '',
].join('\n'));

add('frontend/Dockerfile', [
  '# @@TITLE@@ frontend (Vue SPA) — build node -> nginx. Gerado pela Forge.',
  'FROM node:20-alpine AS build', 'WORKDIR /app',
  'COPY package*.json ./', 'RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi',
  'COPY . .', 'RUN npm run build',
  'FROM nginx:alpine', 'COPY nginx.conf /etc/nginx/conf.d/default.conf',
  'COPY --from=build /app/dist /usr/share/nginx/html@@BASE@@', '', 'EXPOSE 80', '',
].join('\n'));

add('frontend/nginx.conf', [
  '# Servir a SPA sob @@BASE@@/ (prefix+alias MIME-safe). Gerado pela Forge.',
  'server {', '  listen 80;', '  server_name _;',
  '  location = /healthz { return 200 "ok"; add_header Content-Type text/plain; }',
  '  location = @@BASE@@ { return 301 @@BASE@@/; }',
  '  location @@BASE@@/ {',
  '    alias /usr/share/nginx/html@@BASE@@/;',
  '    try_files $uri $uri/ @@BASE@@/index.html;',
  '  }',
  '}', '',
].join('\n'));

add('frontend/index.html', [
  '<!DOCTYPE html>', '<html lang="pt-BR">', '<head>', '  <meta charset="utf-8">',
  '  <meta name="viewport" content="width=device-width, initial-scale=1">',
  '  <base href="@@BASE@@/">', '  <title>@@TITLE@@</title>',
  '</head>', '<body>', '  <div id="app"></div>', '  <script type="module" src="/src/main.js"></script>', '</body>', '</html>', '',
].join('\n'));

add('frontend/src/main.js', [
  "import { createApp } from 'vue';",
  "import { createRouter, createWebHistory } from 'vue-router';",
  "import App from './App.vue';",
  "import { routes } from './router.js';",
  "import './tokens.generated.css';",
  "import './styles.css';",
  "const router = createRouter({ history: createWebHistory('@@BASE@@/'), routes });",
  'createApp(App).use(router).mount(\'#app\');', '',
].join('\n'));

add('frontend/src/router.js', [
  "import DashboardView from './views/DashboardView.vue';",
  "import RecordListView from './views/RecordListView.vue';",
  "import RecordDetailView from './views/RecordDetailView.vue';",
  'export const routes = [',
  "  { path: '/', name: 'dashboard', component: DashboardView },",
  "  { path: '/records', name: 'records', component: RecordListView },",
  "  { path: '/records/:id', name: 'record', component: RecordDetailView, props: true },",
  '];', '',
].join('\n'));

add('frontend/src/api.js', [
  '// Client da API (base absoluta sob o subpath). Sem ${} — concatenação. Gerado pela Forge.',
  "const BASE = import.meta.env.VITE_API_BASE_URL || '@@BASE@@/api';",
  'async function request(method, path, body) {',
  "  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });",
  '  const data = await res.json().catch(() => ({}));',
  "  if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); e.status = res.status; throw e; }",
  '  return data;',
  '}',
  'export const health = () => request("GET", "/health");',
  '// recurso genérico `records` (o gerador de backend expõe /v1/records).',
  'export const records = {',
  '  list: () => request("GET", "/v1/records").then((d) => d.data || d),',
  '  get: (id) => request("GET", "/v1/records/" + id),',
  '  create: (rec) => request("POST", "/v1/records", rec),',
  '  submit: (id) => request("POST", "/v1/records/" + id + "/submit", {}),',
  '};', '',
].join('\n'));

// ---- componentes reutilizáveis -------------------------------------------------
add('frontend/src/components/StateBlock.vue', [
  '<template>',
  '  <div v-if="loading" class="state" role="status" aria-live="polite">Carregando…</div>',
  '  <div v-else-if="error" class="state state-error" role="alert">{{ error }}</div>',
  '  <div v-else-if="empty" class="state state-empty">{{ emptyText || \'Nada por aqui ainda.\' }}</div>',
  '  <slot v-else />',
  '</template>',
  '<script setup>',
  'defineProps({ loading: Boolean, error: String, empty: Boolean, emptyText: String });',
  '</script>', '',
].join('\n'));

add('frontend/src/components/DataTable.vue', [
  '<template>',
  '  <table class="dt">',
  '    <thead><tr><th v-for="c in columns" :key="c.key" scope="col">{{ c.label }}</th></tr></thead>',
  '    <tbody>',
  '      <tr v-for="row in rows" :key="row.id">',
  '        <td v-for="c in columns" :key="c.key">{{ row[c.key] }}</td>',
  '      </tr>',
  '    </tbody>',
  '  </table>',
  '</template>',
  '<script setup>',
  'defineProps({ columns: { type: Array, required: true }, rows: { type: Array, default: () => [] } });',
  '</script>', '',
].join('\n'));

add('frontend/src/components/AppShell.vue', [
  '<template>',
  '  <div class="shell">',
  '    <header class="topbar">',
  '      <span class="brand">@@TITLE@@</span>',
  '      <nav aria-label="Navegação principal">',
  '        <RouterLink to="/">Painel</RouterLink>',
  '        <RouterLink to="/records">Registros</RouterLink>',
  '      </nav>',
  '    </header>',
  '    <main class="content"><slot /></main>',
  '  </div>',
  '</template>',
  '<script setup>',
  "import { RouterLink } from 'vue-router';",
  '</script>', '',
].join('\n'));

add('frontend/src/App.vue', [
  '<template>',
  '  <AppShell><RouterView /></AppShell>',
  '</template>',
  '<script setup>',
  "import { RouterView } from 'vue-router';",
  "import AppShell from './components/AppShell.vue';",
  '</script>', '',
].join('\n'));

// ---- views -------------------------------------------------------------------
add('frontend/src/views/DashboardView.vue', [
  '<template>',
  '  <section>',
  '    <h1>Painel</h1>',
  '    <StateBlock :loading="loading" :error="error">',
  '      <div class="cards">',
  '        <div class="card"><span class="big">{{ total }}</span><span>registros</span></div>',
  '        <div class="card"><span class="big">{{ live ? \'no ar\' : \'—\' }}</span><span>API</span></div>',
  '      </div>',
  '      <RouterLink class="btn" to="/records">Ver registros →</RouterLink>',
  '    </StateBlock>',
  '  </section>',
  '</template>',
  '<script setup>',
  "import { ref, onMounted } from 'vue';",
  "import { RouterLink } from 'vue-router';",
  "import StateBlock from '../components/StateBlock.vue';",
  "import { records, health } from '../api.js';",
  'const loading = ref(true), error = ref(""), total = ref(0), live = ref(false);',
  'onMounted(async () => {',
  '  try { await health(); live.value = true; const rs = await records.list(); total.value = (rs || []).length; }',
  '  catch (e) { error.value = e.message; } finally { loading.value = false; }',
  '});',
  '</script>', '',
].join('\n'));

add('frontend/src/views/RecordListView.vue', [
  '<template>',
  '  <section>',
  '    <h1>Registros</h1>',
  '    <form class="new" @submit.prevent="create">',
  '      <label for="t">Novo registro</label>',
  '      <input id="t" v-model="title" placeholder="título" required />',
  '      <button class="btn" type="submit">Criar</button>',
  '    </form>',
  '    <StateBlock :loading="loading" :error="error" :empty="!rows.length" empty-text="Nenhum registro ainda.">',
  '      <DataTable :columns="columns" :rows="rows" />',
  '    </StateBlock>',
  '  </section>',
  '</template>',
  '<script setup>',
  "import { ref, onMounted } from 'vue';",
  "import StateBlock from '../components/StateBlock.vue';",
  "import DataTable from '../components/DataTable.vue';",
  "import { records } from '../api.js';",
  "const columns = [{ key: 'id', label: 'ID' }, { key: 'title', label: 'Título' }, { key: 'status', label: 'Status' }];",
  'const loading = ref(true), error = ref(""), rows = ref([]), title = ref("");',
  'async function load() { loading.value = true; try { rows.value = await records.list(); } catch (e) { error.value = e.message; } finally { loading.value = false; } }',
  'async function create() { if (!title.value) return; try { await records.create({ title: title.value }); title.value = ""; await load(); } catch (e) { error.value = e.message; } }',
  'onMounted(load);',
  '</script>', '',
].join('\n'));

add('frontend/src/views/RecordDetailView.vue', [
  '<template>',
  '  <section>',
  '    <RouterLink to="/records">← Registros</RouterLink>',
  '    <StateBlock :loading="loading" :error="error">',
  '      <h1>Registro #{{ rec.id }}</h1>',
  '      <dl class="kv"><dt>Título</dt><dd>{{ rec.title }}</dd><dt>Status</dt><dd>{{ rec.status }}</dd></dl>',
  '    </StateBlock>',
  '  </section>',
  '</template>',
  '<script setup>',
  "import { ref, onMounted } from 'vue';",
  "import { RouterLink } from 'vue-router';",
  "import StateBlock from '../components/StateBlock.vue';",
  "import { records } from '../api.js';",
  'const props = defineProps({ id: String });',
  'const loading = ref(true), error = ref(""), rec = ref({});',
  'onMounted(async () => { try { rec.value = await records.get(props.id); } catch (e) { error.value = e.message; } finally { loading.value = false; } });',
  '</script>', '',
].join('\n'));

// tokens placeholder (design-tokens codegen-sync sobrescreve; mínimo p/ build standalone)
add('frontend/src/tokens.generated.css', [
  '/* GERADO (placeholder) — design-tokens codegen-sync sobrescreve. NÃO EDITAR à mão. */',
  ':root{--p-bg:#0b0d12;--p-surface:#11151d;--p-line:#232a36;--p-text:#e6e9ef;--p-muted:#94a3b8;--p-accent:#4f46e5;--p-ok:#4ade80;--p-radius:12px}', '',
].join('\n'));

add('frontend/src/styles.css', [
  '*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:var(--p-bg);color:var(--p-text)}',
  '.shell{min-height:100vh}.topbar{display:flex;align-items:center;gap:1.5rem;padding:1rem 1.5rem;border-bottom:1px solid var(--p-line)}',
  '.brand{font-weight:700}.topbar nav{display:flex;gap:1rem}.topbar a{color:var(--p-muted);text-decoration:none}.topbar a.router-link-active{color:var(--p-text)}',
  '.content{padding:1.5rem;max-width:980px;margin:0 auto}h1{margin:.2rem 0 1rem}',
  '.btn{display:inline-block;background:var(--p-accent);color:#fff;border:none;border-radius:8px;padding:.55rem 1rem;text-decoration:none;cursor:pointer;font-size:.95rem}',
  '.state{padding:1.2rem;color:var(--p-muted)}.state-error{color:#fca5a5}.state-empty{color:var(--p-muted)}',
  '.cards{display:flex;gap:1rem;margin-bottom:1.2rem}.card{background:var(--p-surface);border:1px solid var(--p-line);border-radius:var(--p-radius);padding:1.2rem;display:flex;flex-direction:column;gap:.2rem;min-width:140px}.card .big{font-size:1.8rem;font-weight:700}',
  '.dt{width:100%;border-collapse:collapse;background:var(--p-surface);border:1px solid var(--p-line);border-radius:var(--p-radius);overflow:hidden}.dt th,.dt td{text-align:left;padding:.6rem .8rem;border-bottom:1px solid var(--p-line)}.dt th{color:var(--p-muted);font-size:.85rem}',
  '.new{display:flex;gap:.5rem;align-items:end;margin-bottom:1rem;flex-wrap:wrap}.new label{display:block;font-size:.85rem;color:var(--p-muted)}.new input{background:var(--p-surface);border:1px solid var(--p-line);color:var(--p-text);border-radius:8px;padding:.5rem .7rem}',
  '.kv{display:grid;grid-template-columns:auto 1fr;gap:.4rem 1rem}.kv dt{color:var(--p-muted)}',
  '@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}',
  'a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid var(--p-accent);outline-offset:2px}', '',
].join('\n'));

// ---- k8s do frontend (aditivo, arquivo separado) -----------------------------
add('k8s/@@APP@@-frontend.yaml', [
  '# @@TITLE@@ — frontend (Vue SPA) gerado pela Forge. Aditivo ao k8s do backend.',
  '---', 'apiVersion: apps/v1', 'kind: Deployment',
  'metadata: { name: @@APP@@-frontend, namespace: apps, labels: { app.kubernetes.io/name: @@APP@@-frontend, app.kubernetes.io/component: frontend, app.kubernetes.io/part-of: @@APP@@ } }',
  'spec:', '  replicas: 1', '  selector: { matchLabels: { app.kubernetes.io/name: @@APP@@-frontend } }',
  '  template:', '    metadata: { labels: { app.kubernetes.io/name: @@APP@@-frontend, app.kubernetes.io/component: frontend, app.kubernetes.io/part-of: @@APP@@ } }',
  '    spec: { containers: [ { name: frontend, image: @@APP@@-frontend:local, imagePullPolicy: IfNotPresent, ports: [ { containerPort: 80 } ], readinessProbe: { httpGet: { path: /healthz, port: 80 }, initialDelaySeconds: 3, periodSeconds: 10 } } ] }',
  '---', 'apiVersion: v1', 'kind: Service',
  'metadata: { name: @@APP@@-frontend, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@ } }',
  'spec: { selector: { app.kubernetes.io/name: @@APP@@-frontend }, ports: [ { port: 80, targetPort: 80 } ] }',
  '---', '# Frontend NÃO faz strip (regra de ouro) e priority 10 < 40 da API -> /@@APP@@/api vai p/ a API.',
  'apiVersion: traefik.io/v1alpha1', 'kind: IngressRoute',
  'metadata: { name: @@APP@@-frontend, namespace: apps, labels: { app.kubernetes.io/part-of: @@APP@@ } }',
  'spec:', '  entryPoints: [web]', '  routes:',
  '    - match: PathPrefix(`@@BASE@@`)', '      kind: Rule', '      priority: 10',
  '      services: [ { name: @@APP@@-frontend, port: 80 } ]', '',
].join('\n'));

const replace = (s) => s.replace(/@@APP@@/g, APP).replace(/@@TITLE@@/g, TITLE).replace(/@@BASE@@/g, BASE);
let written = 0;
for (const [rel, content] of Object.entries(files)) {
  const dest = path.join(APPDIR, replace(rel));
  if (fs.existsSync(dest) && !args.force) { console.log('[skip] ' + path.relative(REPO_ROOT, dest)); continue; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, replace(content));
  written++;
}

// anexa o service frontend ao devops.yaml (aditivo, se ainda não houver)
const devopsPath = path.join(APPDIR, 'devops.yaml');
if (fs.existsSync(devopsPath)) {
  let dy = fs.readFileSync(devopsPath, 'utf8');
  if (!/frontend:\s*\{?\s*type:\s*frontend/.test(dy)) {
    const line = '  frontend: { type: frontend, path: /, port: 80, expose: true, stripPrefix: false, priority: 10 }\n';
    if (/^services:/m.test(dy)) dy = dy.replace(/^services:\s*\n/m, 'services:\n' + line);
    else dy += '\nservices:\n' + line;
    fs.writeFileSync(devopsPath, dy);
    console.log('[scaffold-frontend] devops.yaml: service frontend anexado.');
  }
}

console.log('[scaffold-frontend] ' + APP + ': ' + written + ' arquivos (Vue SPA + k8s frontend). Rota ' + BASE + ' priority 10.');
console.log('  build: cd apps/' + APP + '/frontend && npm i && npm run build  |  docker build -t ' + APP + '-frontend:local .');
