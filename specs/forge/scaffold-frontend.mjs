// =============================================================================
// scaffold-frontend.mjs — gera a BASE de um FRONTEND Vue RICO para um app da Forja, quando o
// produto pede interface web (product.interfaces inclui "web"). A base já nasce bonita e
// utilizável: casca própria (topbar + sidebar, marca própria), dashboard com métricas, e um
// MÓDULO DE RECURSO completo (lista + criar + detalhe + 404) usando o KIT @flavioneto11/ui-vue.
// O MOTOR multiagente (generate-ui.workflow.mjs) depois preenche as telas de domínio sobre esta
// base. ADITIVO ao backend: emite apps/<app>/frontend/** + k8s/<app>-frontend.yaml + service no
// devops.yaml + specs/products/<app>/brand.json (marca) + tokens.generated.css inicial.
//
// Roteamento (regra de ouro): frontend stripPrefix:false priority 10 base /<app>/; a API
// (priority 40 + strip) vence /<app>/api. Geração por concatenação + tokens @@APP@@/@@TITLE@@/@@BASE@@.
// O KIT (src/ui/**) e os tokens (tokens.generated.css) entram por codegen-sync:
//   node packages/ui-vue/build.mjs  &&  node packages/design-tokens/build.mjs
//
// Uso: node scaffold-frontend.mjs --product <name> [--force]
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveForgeTokensCss, DEFAULT_BRAND } from '../../packages/design-tokens/forge-brand.mjs';
import { loadCatalog, resolveBlocks } from './apply-capabilities.mjs';

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

// Blocos resolvidos (mesmo fecho do backend): se o produto tem o bloco de IA de controle, a SPA nasce
// com a tela do assistente (AiAssistantView com UiFileDrop) + rota + item de nav + cliente multipart.
const byId = loadCatalog();
const resolvedBlocks = resolveBlocks(product.capability_blocks || [], product.stack || 'sicat', byId);
const HAS_AI = resolvedBlocks.includes('control-ai-por-app');

const APP = product.name;
const TITLE = product.display_name || APP;
const BASE = product.base_path || ('/' + APP);
const APPDIR = path.join(REPO_ROOT, 'apps', APP);

const files = {};
const add = (rel, content) => { files[rel] = content; };

// ---- toolchain (vite + vue + vue-router) -----------------------------------
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

// ---- bootstrap -------------------------------------------------------------
add('frontend/src/main.js', [
  "import { createApp } from 'vue';",
  "import { createRouter, createWebHistory } from 'vue-router';",
  "import App from './App.vue';",
  "import { routes } from './router.js';",
  "import './tokens.generated.css';",
  "import './ui/ui.css';",
  "import './styles.css';",
  "const router = createRouter({ history: createWebHistory('@@BASE@@/'), routes });",
  "createApp(App).use(router).mount('#app');", '',
].join('\n'));

add('frontend/src/App.vue', [
  '<template>',
  '  <UiAppShell :title="title" :nav="nav" me-url="@@BASE@@/api/me">',
  '    <RouterView />',
  '  </UiAppShell>',
  '  <UiToast />',
  '  <UiConfirmDialog />',
  '</template>',
  '<script setup>',
  "import { RouterView } from 'vue-router';",
  "import { UiAppShell, UiToast, UiConfirmDialog } from './ui/index.js';",
  "import { nav } from './nav.js';",
  "const title = '@@TITLE@@';",
  '</script>', '',
].join('\n'));

// nav model — o motor anexa grupos de domínio aqui.
add('frontend/src/nav.js', [
  '// Navegação da sidebar. O motor (generate-ui) anexa grupos de domínio.',
  'export const nav = [',
  "  { group: '', items: [",
  "    { label: 'Painel', to: '/', icon: '◧' },",
  "    { label: 'Registros', to: '/records', icon: '▤' },",
  ...(HAS_AI ? ["    { label: 'Assistente', to: '/assistant', icon: '✨' },"] : []),
  '  ] },',
  '];', '',
].join('\n'));

add('frontend/src/router.js', [
  "import DashboardView from './views/DashboardView.vue';",
  "import ResourceListView from './views/ResourceListView.vue';",
  "import ResourceFormView from './views/ResourceFormView.vue';",
  "import ResourceDetailView from './views/ResourceDetailView.vue';",
  ...(HAS_AI ? ["import AiAssistantView from './views/AiAssistantView.vue';"] : []),
  "import NotFoundView from './views/NotFoundView.vue';",
  'export const routes = [',
  "  { path: '/', name: 'dashboard', component: DashboardView },",
  "  { path: '/records', name: 'records', component: ResourceListView },",
  "  { path: '/records/new', name: 'record-new', component: ResourceFormView },",
  "  { path: '/records/:id', name: 'record', component: ResourceDetailView, props: true },",
  "  { path: '/records/:id/edit', name: 'record-edit', component: ResourceFormView, props: true },",
  ...(HAS_AI ? ["  { path: '/assistant', name: 'assistant', component: AiAssistantView },"] : []),
  "  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },",
  '];', '',
].join('\n'));

// ---- client de API: fábrica de recurso (list/get/create/update/remove) ------
add('frontend/src/api.js', [
  '// Client da API (base absoluta sob o subpath). Sem ${} — concatenação. Gerado pela Forge.',
  "const BASE = import.meta.env.VITE_API_BASE_URL || '@@BASE@@/api';",
  'async function request(method, path, body) {',
  "  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });",
  '  const data = await res.json().catch(() => ({}));',
  "  if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); e.status = res.status; throw e; }",
  '  return data;',
  '}',
  'function qs(params) {',
  '  const p = new URLSearchParams();',
  "  for (const k in (params || {})) { const v = params[k]; if (v !== '' && v !== null && v !== undefined) p.append(k, v); }",
  "  const s = p.toString(); return s ? ('?' + s) : '';",
  '}',
  '// fábrica de recurso REST: o backend expõe /v1/<name>. list aceita page/pageSize/sort/dir/filtros.',
  'export function resourceFactory(name) {',
  '  const root = "/v1/" + name;',
  '  return {',
  '    list: (params) => request("GET", root + qs(params)).then((d) => (d && d.data !== undefined ? d : { data: d || [], total: (d || []).length })),',
  '    get: (id) => request("GET", root + "/" + id),',
  '    create: (body) => request("POST", root, body),',
  '    update: (id, body) => request("PUT", root + "/" + id, body),',
  '    remove: (id) => request("DELETE", root + "/" + id),',
  '  };',
  '}',
  'export const health = () => request("GET", "/health");',
  "export const records = resourceFactory('records');",
  ...(HAS_AI ? [
    '',
    '// Assistente de IA (bloco control-ai-por-app). Aceita ARQUIVOS (multimodal): envia multipart/form-data',
    "// quando há File[] (campo 'files'); senão JSON (retrocompat). NUNCA setamos Content-Type no multipart",
    '// (o browser põe o boundary). Erros estruturados (status + message) sobem p/ a view.',
    'export async function assistant(message, files) {',
    '  const list = Array.isArray(files) ? files.filter(Boolean) : [];',
    '  let res;',
    '  if (list.length) {',
    '    const fd = new FormData();',
    "    fd.append('message', String(message || ''));",
    "    for (const f of list) fd.append('files', f, f.name);",
    "    res = await fetch(BASE + '/v1/assistant', { method: 'POST', body: fd });",
    '  } else {',
    "    res = await fetch(BASE + '/v1/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: String(message || '') }) });",
    '  }',
    '  const data = await res.json().catch(() => ({}));',
    "  if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); e.status = res.status; throw e; }",
    '  return data;',
    '}',
    "export const assistantHealth = () => request('GET', '/v1/assistant/health');",
  ] : []),
  '',
].join('\n'));

// ---- views (sobre o kit) ---------------------------------------------------
add('frontend/src/views/DashboardView.vue', [
  '<template>',
  '  <UiPageLayout title="Painel" eyebrow="@@TITLE@@" subtitle="Visão geral do sistema." :loading="loading" :error="error" @retry="load">',
  '    <template #actions><UiButton to="/records/new">Novo registro</UiButton></template>',
  '    <div class="dash-metrics">',
  '      <UiMetricCard label="Registros" :value="total" tone="primary" />',
  "      <UiMetricCard label=\"API\" :value=\"live ? 'No ar' : 'Fora'\" :tone=\"live ? 'success' : 'error'\" />",
  '      <UiMetricCard label="Recentes" :value="recent.length" tone="neutral" hint="últimos carregados" />',
  '    </div>',
  '    <UiCard title="Registros recentes">',
  '      <UiDataTable :columns="columns" :rows="recent" :empty="{ title: \'Sem registros\', description: \'Crie o primeiro registro.\' }" clickable-rows @row-click="open" />',
  '    </UiCard>',
  '  </UiPageLayout>',
  '</template>',
  '<script setup>',
  "import { ref, onMounted } from 'vue';",
  "import { useRouter } from 'vue-router';",
  "import { UiPageLayout, UiCard, UiMetricCard, UiDataTable, UiButton } from '../ui/index.js';",
  "import { records, health } from '../api.js';",
  'const router = useRouter();',
  "const columns = [{ key: 'id', label: 'ID' }, { key: 'title', label: 'Título' }, { key: 'status', label: 'Status', format: 'badge' }];",
  'const loading = ref(true), error = ref(null), total = ref(0), live = ref(false), recent = ref([]);',
  'async function load() {',
  '  loading.value = true; error.value = null;',
  '  try {',
  '    try { await health(); live.value = true; } catch { live.value = false; }',
  '    const r = await records.list({ pageSize: 5 });',
  '    recent.value = r.data || []; total.value = r.total ?? recent.value.length;',
  '  } catch (e) { error.value = e; } finally { loading.value = false; }',
  '}',
  "const open = (row) => router.push('/records/' + row.id);",
  'onMounted(load);',
  '</script>',
  '<style scoped>',
  '.dash-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--ui-space-4); }',
  '</style>', '',
].join('\n'));

add('frontend/src/views/ResourceListView.vue', [
  '<template>',
  '  <UiPageLayout title="Registros" subtitle="Todos os registros do sistema." :error="r.error.value" @retry="r.load">',
  '    <template #actions><UiButton to="/records/new">Novo registro</UiButton></template>',
  '    <UiDataTable :columns="columns" :rows="r.items.value" :loading="r.loading.value" row-key="id" clickable-rows',
  "      :empty=\"{ title: 'Nenhum registro', description: 'Comece criando um novo registro.' }\" @row-click=\"open\">",
  '      <template #empty-action><UiButton to="/records/new">Criar registro</UiButton></template>',
  '    </UiDataTable>',
  '  </UiPageLayout>',
  '</template>',
  '<script setup>',
  "import { onMounted } from 'vue';",
  "import { useRouter } from 'vue-router';",
  "import { UiPageLayout, UiDataTable, UiButton, useResource } from '../ui/index.js';",
  "import { records } from '../api.js';",
  'const router = useRouter();',
  "const columns = [{ key: 'id', label: 'ID' }, { key: 'title', label: 'Título', sortable: true }, { key: 'status', label: 'Status', format: 'badge' }];",
  'const r = useResource(records);',
  "const open = (row) => router.push('/records/' + row.id);",
  'onMounted(r.load);',
  '</script>', '',
].join('\n'));

add('frontend/src/views/ResourceFormView.vue', [
  '<template>',
  '  <UiPageLayout :title="isEdit ? \'Editar registro\' : \'Novo registro\'" width="narrow">',
  '    <UiCard>',
  '      <form @submit.prevent="submit">',
  '        <UiFormSection title="Dados do registro" :columns="1">',
  '          <UiFormField label="Título" :required="true" :error="f.errors.title">',
  '            <template #default="{ id, describedBy }">',
  '              <input :id="id" :aria-describedby="describedBy" :value="f.values.title" @input="f.setField(\'title\', $event.target.value)" placeholder="Ex.: Meu registro" />',
  '            </template>',
  '          </UiFormField>',
  '        </UiFormSection>',
  '        <div class="form-actions">',
  '          <UiButton variant="ghost" type="button" @click="cancel">Cancelar</UiButton>',
  '          <UiButton type="submit" :loading="f.submitting.value">{{ isEdit ? \'Salvar\' : \'Criar\' }}</UiButton>',
  '        </div>',
  '      </form>',
  '    </UiCard>',
  '  </UiPageLayout>',
  '</template>',
  '<script setup>',
  "import { computed, onMounted } from 'vue';",
  "import { useRouter } from 'vue-router';",
  "import { UiPageLayout, UiCard, UiFormSection, UiFormField, UiButton, useForm, useToast } from '../ui/index.js';",
  "import { validators } from '../ui/index.js';",
  "import { records } from '../api.js';",
  'const props = defineProps({ id: { type: String, default: null } });',
  'const router = useRouter();',
  'const toast = useToast();',
  'const isEdit = computed(() => !!props.id);',
  "const f = useForm({ initial: { title: '' }, rules: { title: [validators.required(), validators.minLen(2)] } });",
  'onMounted(async () => { if (props.id) { try { const rec = await records.get(props.id); f.values.title = rec.title || \'\'; } catch (e) { toast.error(e.message); } } });',
  'function submit() {',
  '  f.handleSubmit(async (vals) => {',
  '    try {',
  '      if (isEdit.value) await records.update(props.id, vals); else await records.create(vals);',
  "      toast.success(isEdit.value ? 'Registro salvo' : 'Registro criado');",
  "      router.push('/records');",
  '    } catch (e) { toast.error(e.message); }',
  '  });',
  '}',
  "const cancel = () => router.push('/records');",
  '</script>',
  '<style scoped>',
  '.form-actions { display: flex; justify-content: flex-end; gap: var(--ui-space-2); margin-top: var(--ui-space-3); }',
  '</style>', '',
].join('\n'));

add('frontend/src/views/ResourceDetailView.vue', [
  '<template>',
  '  <UiPageLayout :title="\'Registro #\' + id" width="narrow" :loading="loading" :error="error" @retry="load">',
  '    <template #actions>',
  '      <UiButton variant="ghost" to="/records">Voltar</UiButton>',
  '      <UiButton :to="\'/records/\' + id + \'/edit\'">Editar</UiButton>',
  '    </template>',
  '    <UiCard>',
  '      <dl class="kv">',
  '        <div><dt>Título</dt><dd>{{ rec.title }}</dd></div>',
  '        <div><dt>Status</dt><dd><UiStatusBadge :status="rec.status" /></dd></div>',
  '      </dl>',
  '    </UiCard>',
  '  </UiPageLayout>',
  '</template>',
  '<script setup>',
  "import { ref, onMounted } from 'vue';",
  "import { UiPageLayout, UiCard, UiButton, UiStatusBadge } from '../ui/index.js';",
  "import { records } from '../api.js';",
  'const props = defineProps({ id: { type: String, required: true } });',
  'const loading = ref(true), error = ref(null), rec = ref({});',
  'async function load() { loading.value = true; error.value = null; try { rec.value = await records.get(props.id); } catch (e) { error.value = e; } finally { loading.value = false; } }',
  'onMounted(load);',
  '</script>',
  '<style scoped>',
  '.kv { display: grid; gap: var(--ui-space-3); margin: 0; }',
  '.kv dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }',
  '.kv dd { margin: 2px 0 0; }',
  '</style>', '',
].join('\n'));

add('frontend/src/views/NotFoundView.vue', [
  '<template>',
  '  <UiPageLayout width="narrow">',
  "    <UiEmptyState title=\"Página não encontrada\" description=\"O endereço que você abriu não existe.\" icon=\"⚲\">",
  '      <template #action><UiButton to="/">Ir para o início</UiButton></template>',
  '    </UiEmptyState>',
  '  </UiPageLayout>',
  '</template>',
  '<script setup>',
  "import { UiPageLayout, UiEmptyState, UiButton } from '../ui/index.js';",
  '</script>', '',
].join('\n'));

// ---- view do assistente de IA (bloco control-ai-por-app) — ACEITA ARQUIVOS via UiFileDrop ----------
// CSP-safe: sem script/style inline, sem onclick=; só @event do Vue. Envia multipart p/ /v1/assistant.
// Fail-closed: GET /v1/assistant/health diz se a IA está no ar; 503 -> banner "desligado". A ingestão de
// arquivos é fail-soft no backend — a UI mostra o MANIFEST devolvido (nome/tipo/status), nunca bytes.
if (HAS_AI) add('frontend/src/views/AiAssistantView.vue', [
  '<!--',
  '  AiAssistantView — Assistente de IA do @@TITLE@@ (bloco control-ai-por-app).',
  '  Pergunte por texto E/OU anexe arquivos (PDF, imagem, planilha, doc, csv, zip): a IA ingere o',
  '  conteúdo (multimodal) e raciocina sobre ele. Fail-closed sem chave (banner "desligado"); fail-soft',
  '  na ingestão (arquivo ilegível não derruba a conversa). Usa SÓ o kit ui-vue e tokens --ui-*.',
  '-->',
  '<template>',
  '  <UiPageLayout eyebrow="@@TITLE@@ · IA" title="Assistente" subtitle="Pergunte e, se quiser, anexe arquivos para a IA analisar." width="wide">',
  '    <template #actions>',
  '      <UiStatusBadge :tone="health === \'online\' ? \'success\' : (health === \'offline\' ? \'neutral\' : \'warning\')" :label="healthLabel" size="sm" />',
  '      <UiButton variant="ghost" size="sm" :disabled="!messages.length" @click="clearAll">Limpar</UiButton>',
  '    </template>',
  '',
  '    <!-- fail-closed: IA desligada -->',
  '    <UiCard v-if="health === \'offline\'">',
  '      <UiEmptyState icon="🔌" title="Assistente desligado" description="Esta instalação está sem o provedor de IA (fail-closed). Configure a chave para habilitar.">',
  '        <template #action><UiButton variant="ghost" @click="checkHealth">Verificar novamente</UiButton></template>',
  '      </UiEmptyState>',
  '    </UiCard>',
  '',
  '    <div v-else class="aiv-grid">',
  '      <UiCard class="aiv-chat" title="Conversa">',
  '        <div ref="logEl" class="aiv-log" role="log" aria-live="polite" aria-label="Conversa com o assistente">',
  '          <UiEmptyState v-if="!messages.length && !thinking" icon="✨" title="Como posso ajudar?" description="Escreva uma pergunta. Anexe arquivos abaixo para a IA analisar o conteúdo." />',
  '          <article v-for="m in messages" :key="m.id" class="aiv-msg" :data-role="m.role">',
  '            <span class="aiv-msg-av" aria-hidden="true">{{ m.role === \'user\' ? \'🧑\' : \'🤖\' }}</span>',
  '            <div class="aiv-msg-body">',
  '              <p class="aiv-msg-author">{{ m.role === \'user\' ? \'Você\' : \'Assistente\' }}</p>',
  '              <div v-if="m.error" class="aiv-msg-error" role="alert"><p>{{ m.error }}</p></div>',
  '              <template v-else>',
  '                <p v-for="(p, pi) in paras(m.text)" :key="pi" class="aiv-msg-text">{{ p }}</p>',
  '                <ul v-if="m.files && m.files.length" class="aiv-files">',
  '                  <li v-for="(f, fi) in m.files" :key="fi" class="aiv-file" :data-status="f.status">',
  '                    <span class="aiv-file-name">{{ f.path }}</span>',
  '                    <span class="aiv-file-meta">{{ f.type }} · {{ f.status }}</span>',
  '                  </li>',
  '                </ul>',
  '              </template>',
  '            </div>',
  '          </article>',
  '          <article v-if="thinking" class="aiv-msg" data-role="assistant">',
  '            <span class="aiv-msg-av" aria-hidden="true">🤖</span>',
  '            <div class="aiv-msg-body"><p class="aiv-msg-author">Assistente</p><UiLoadingState title="Pensando…" /></div>',
  '          </article>',
  '        </div>',
  '',
  '        <form class="aiv-composer" @submit.prevent="onAsk">',
  '          <UiFormField label="Sua pergunta" :error="formError">',
  '            <template #default="{ id, describedBy }">',
  '              <textarea :id="id" v-model="question" class="aiv-textarea" rows="2" :aria-describedby="describedBy" :disabled="thinking || health !== \'online\'" placeholder="Ex.: Resuma o documento anexado." @keydown="onKey"></textarea>',
  '            </template>',
  '          </UiFormField>',
  '          <UiFileDrop v-model="files" :disabled="thinking || health !== \'online\'" hint="PDF, imagem, planilha, doc, csv ou zip — a IA analisa o conteúdo." />',
  '          <div class="aiv-composer-actions">',
  '            <p class="aiv-hint ui-muted">Enter envia · Shift+Enter quebra linha</p>',
  '            <UiButton type="submit" :loading="thinking" :disabled="!canSend">Perguntar</UiButton>',
  '          </div>',
  '        </form>',
  '      </UiCard>',
  '    </div>',
  '',
  '    <template #footer><p>Os arquivos são processados só para responder à sua pergunta. Sem chave de IA o assistente fica desligado (fail-closed).</p></template>',
  '  </UiPageLayout>',
  '</template>',
  '',
  '<script setup>',
  "import { ref, computed, nextTick, onMounted } from 'vue';",
  "import { UiPageLayout, UiCard, UiButton, UiFormField, UiFileDrop, UiStatusBadge, UiEmptyState, UiLoadingState, useToast } from '../ui/index.js';",
  "import { assistant, assistantHealth, health as apiHealth } from '../api.js';",
  '',
  'const toast = useToast();',
  "const health = ref('checking'); // checking | online | offline | error",
  "const healthLabel = computed(() => ({ checking: 'Verificando…', online: 'IA no ar', offline: 'IA desligada', error: 'IA com erro' }[health.value] || 'IA'));",
  'const messages = ref([]);',
  'let mid = 0;',
  'const thinking = ref(false);',
  "const question = ref('');",
  'const files = ref([]);',
  'const formError = ref(null);',
  'const logEl = ref(null);',
  '',
  "const canSend = computed(() => (question.value.trim().length > 0 || files.value.length > 0) && !thinking.value && health.value === 'online');",
  '',
  "function paras(t) { return String(t || '').split(/\\n{2,}|\\r?\\n/).map((s) => s.trim()).filter(Boolean); }",
  'async function scrollEnd() { await nextTick(); if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight; }',
  '',
  'async function checkHealth() {',
  "  health.value = 'checking';",
  '  try {',
  '    const r = await assistantHealth();',
  "    health.value = r && r.ai ? 'online' : 'offline';",
  '  } catch (e) {',
  "    if (e && e.status === 503) { health.value = 'offline'; return; }",
  "    try { await apiHealth(); health.value = 'error'; } catch { health.value = 'error'; }",
  '  }',
  '}',
  '',
  'function onKey(e) { if (e.key === \'Enter\' && !e.shiftKey) { e.preventDefault(); onAsk(); } }',
  '',
  'async function onAsk() {',
  '  const q = question.value.trim();',
  '  const fl = files.value.slice();',
  '  if (!q && !fl.length) { formError.value = \'Escreva uma pergunta ou anexe um arquivo.\'; return; }',
  "  if (health.value !== 'online') { formError.value = 'O assistente está indisponível.'; return; }",
  '  formError.value = null;',
  "  const label = q || ('(' + fl.length + ' arquivo' + (fl.length > 1 ? 's' : '') + ' anexado' + (fl.length > 1 ? 's' : '') + ')');",
  "  messages.value.push({ id: ++mid, role: 'user', text: label });",
  "  question.value = ''; files.value = [];",
  '  thinking.value = true; scrollEnd();',
  '  try {',
  '    const r = await assistant(q, fl);',
  "    messages.value.push({ id: ++mid, role: 'assistant', text: (r && (r.answer || r.text)) || 'Sem resposta.', files: (r && r.files) || [] });",
  '  } catch (e) {',
  "    if (e && e.status === 503) health.value = 'offline';",
  "    messages.value.push({ id: ++mid, role: 'assistant', error: errMsg(e) });",
  "    toast.error('Não foi possível responder.');",
  '  } finally {',
  '    thinking.value = false; scrollEnd();',
  '  }',
  '}',
  '',
  'function errMsg(e) {',
  "  if (!e) return 'Erro desconhecido.';",
  "  if (e.status === 503) return 'Assistente indisponível (fail-closed). Configure o provedor de IA.';",
  "  if (e.status === 413) return 'Arquivo grande demais para enviar.';",
  "  return e.message || 'Falha ao falar com o assistente.';",
  '}',
  '',
  'function clearAll() { messages.value = []; }',
  '',
  'onMounted(checkHealth);',
  '</script>',
  '',
  '<style scoped>',
  '.aiv-grid { display: grid; gap: var(--ui-space-4); }',
  '.aiv-chat :deep(.ui-card-body) { display: flex; flex-direction: column; gap: var(--ui-space-4); }',
  '.aiv-log { display: flex; flex-direction: column; gap: var(--ui-space-4); max-height: 52vh; min-height: 220px; overflow-y: auto; padding-right: var(--ui-space-2); }',
  '.aiv-msg { display: flex; gap: var(--ui-space-3); align-items: flex-start; }',
  '.aiv-msg[data-role="user"] { flex-direction: row-reverse; }',
  '.aiv-msg-av { flex-shrink: 0; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border)); }',
  '.aiv-msg-body { max-width: 84%; background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-md); padding: var(--ui-space-3) var(--ui-space-4); }',
  '.aiv-msg[data-role="user"] .aiv-msg-body { background: rgb(var(--ui-accent) / 0.10); border-color: rgb(var(--ui-accent) / 0.30); }',
  '.aiv-msg-author { margin: 0 0 var(--ui-space-2); font-size: var(--ui-text-xs); font-weight: 700; color: rgb(var(--ui-muted)); text-transform: uppercase; letter-spacing: .05em; }',
  '.aiv-msg-text { margin: 0 0 var(--ui-space-2); }',
  '.aiv-msg-text:last-child { margin-bottom: 0; }',
  '.aiv-msg-error { color: rgb(var(--ui-danger)); }',
  '.aiv-files { list-style: none; margin: var(--ui-space-2) 0 0; padding: var(--ui-space-2) 0 0; border-top: 1px dashed rgb(var(--ui-border)); display: flex; flex-direction: column; gap: 4px; }',
  '.aiv-file { display: flex; justify-content: space-between; gap: var(--ui-space-2); font-size: var(--ui-text-sm); }',
  '.aiv-file-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.aiv-file-meta { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); flex-shrink: 0; }',
  '.aiv-file[data-status="error"] .aiv-file-meta { color: rgb(var(--ui-danger)); }',
  '.aiv-composer { display: flex; flex-direction: column; gap: var(--ui-space-3); border-top: 1px solid rgb(var(--ui-border)); padding-top: var(--ui-space-4); }',
  '.aiv-textarea { width: 100%; background: rgb(var(--ui-bg)); color: rgb(var(--ui-fg)); border: 1px solid rgb(var(--ui-border-strong)); border-radius: var(--ui-radius-sm); padding: 8px 11px; font: inherit; resize: vertical; min-height: 56px; }',
  '.aiv-textarea:disabled { opacity: .6; cursor: not-allowed; }',
  '.aiv-composer-actions { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); flex-wrap: wrap; }',
  '.aiv-hint { margin: 0; font-size: var(--ui-text-xs); }',
  '@media (max-width: 560px) { .aiv-msg-body { max-width: 92%; } .aiv-composer-actions { flex-direction: column; align-items: stretch; } }',
  '</style>', '',
].join('\n'));

// base mínima (a maior parte vem de ui.css + tokens.generated.css + scoped styles)
add('frontend/src/styles.css', [
  '/* base do app — a identidade vem de tokens.generated.css (--ui-*) + ui.css do kit. */',
  '#app { min-height: 100vh; }', '',
].join('\n'));

// ---- k8s do frontend (aditivo) ---------------------------------------------
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

// ---- marca própria (brand.json) + tokens.generated.css inicial --------------
const brandPath = path.join(SPECS_DIR, 'products', APP, 'brand.json');
let brand = { ...DEFAULT_BRAND, name: TITLE };
if (fs.existsSync(brandPath)) { try { brand = { ...brand, ...JSON.parse(fs.readFileSync(brandPath, 'utf8')) }; } catch {} }
else { fs.writeFileSync(brandPath, JSON.stringify(brand, null, 2) + '\n'); console.log('[scaffold-frontend] brand.json criado (marca default — ajuste accent/neutralBase).'); }
// tokens iniciais p/ build standalone (design-tokens build.mjs depois reescreve idempotente)
const tokPath = path.join(APPDIR, 'frontend', 'src', 'tokens.generated.css');
fs.mkdirSync(path.dirname(tokPath), { recursive: true });
fs.writeFileSync(tokPath, deriveForgeTokensCss(brand));

// ---- kit ui-vue: sincroniza p/ src/ui/ (codegen-sync; o build.mjs cobre todos os apps) ------
// Aqui só garantimos que o app já tenha o kit p/ build local; o build.mjs do pacote é a fonte.

// anexa o service frontend ao devops.yaml (aditivo, se ainda não houver)
const devopsPath = path.join(APPDIR, 'devops.yaml');
if (fs.existsSync(devopsPath)) {
  let dy = fs.readFileSync(devopsPath, 'utf8');
  if (!/frontend:\s*\{?\s*type:\s*frontend/.test(dy)) {
    const line = '  frontend: { type: frontend, image: ' + APP + '-frontend, path: /, port: 80, expose: true, stripPrefix: false, priority: 10 }\n';
    if (/^services:/m.test(dy)) dy = dy.replace(/^services:\s*\n/m, 'services:\n' + line);
    else dy += '\nservices:\n' + line;
    fs.writeFileSync(devopsPath, dy);
    console.log('[scaffold-frontend] devops.yaml: service frontend anexado.');
  }
}

console.log('[scaffold-frontend] ' + APP + ': ' + written + ' arquivos (base Vue rica + k8s). Marca: ' + brand.accent + '/' + brand.neutralBase + '.');
console.log('  sincronize o kit + tokens: node packages/ui-vue/build.mjs && node packages/design-tokens/build.mjs');
console.log('  build: cd apps/' + APP + '/frontend && npm i && npm run build  |  docker build -t ' + APP + '-frontend:local .');
