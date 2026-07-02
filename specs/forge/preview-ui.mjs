// =============================================================================
// preview-ui.mjs — GERADOR DE PREVIEW da Forja.
//
// Dado um inventário de UI { product, screens, entities, brand } (o MESMO shape que o
// arquiteto-ux do motor generate-ui emite — ARCHITECT_SCHEMA em lib/ui-inventory.mjs),
// EMITE uma SPA Vue 3 + Vite AUTOCONTIDA que renderiza TODAS as telas propostas, com:
//   - a casca real (UiAppShell: topbar + sidebar) e a MARCA do produto (tokens --ui-*),
//   - cada tela com seus estados loading / empty / normal usando DADOS FAKE
//     (@flavioneto11/mock-data: mockRows(fields,n) / mockValue(field)),
//   - SEM backend: nada de fetch a /v1/* — tudo mock, determinístico.
//
// É o "front-load da riqueza": o dono vê e itera as telas ANTES de a esteira construir.
//
// AUTOCONTIDO POR DESIGN: o kit @flavioneto11/ui-vue é VENDORADO para dentro da SPA (src/ui/**) —
// exatamente como os apps reais recebem o kit por codegen-sync; e um mock-data próprio do preview
// (src/mock-data.js, com a MESMA API do pacote @flavioneto11/mock-data, mas contrato raw-value + id
// por linha que as views esperam) é embutido. Assim `npm ci && vite build` funciona com vanilla Vite,
// sem workspace/registry.
//
// Uso programático:
//   import { generatePreview } from './preview-ui.mjs';
//   const r = generatePreview({ product, screens, entities, brand }, { outDir });
//
// CLI:
//   node specs/forge/preview-ui.mjs --product <name> [--out <dir>] [--from <inventory.json>]
//     - lê a arquitetura de specs/products/<name>/ (architecture.json|ui-inventory.json|product.json
//       + brand.json) OU de --from <json>, e gera em apps/<name>-preview/ (ou --out).
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveForgeTokensCss } from '../../packages/design-tokens/forge-brand.mjs';
import {
  normalizeInventory, pascal, humanizeLabel, safeSlug, FIELD_TYPES, SCREEN_KINDS,
} from './lib/ui-inventory.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SPECS_DIR, '..');
const KIT_SRC = path.join(REPO_ROOT, 'packages', 'ui-vue', 'src');

// ---------------------------------------------------------------------------
// API pública: gera a árvore de arquivos da SPA de preview e (opcional) escreve em disco.
// Retorna { files: { <rel>: <content> }, dir, product, screens, entities, brand, manifest }.
// ---------------------------------------------------------------------------
export function generatePreview(inventoryIn, opts = {}) {
  const inv = normalizeInventory(inventoryIn || {});
  const product = safeSlug(opts.product || inventoryIn?.product || inv.brand.name);
  const title = inv.brand.name || product;
  // base path do preview servido pelo reqhub-api (mesma origem da Forja).
  const base = opts.base || ('/reqs/api/v1/forge/preview/' + product + '/');

  if (!inv.screens.length) throw new Error('preview-ui: inventário sem telas (screens[] vazio)');

  const entityByName = new Map(inv.entities.map((e) => [e.name, e]));
  const files = {};
  const add = (rel, content) => { files[rel] = content; };

  // --- toolchain (vite + vue + vue-router), igual aos apps reais ---
  add('package.json', JSON.stringify({
    name: product + '-preview', version: '0.0.0', private: true, type: 'module',
    description: 'Preview iterativo (dados fake) das telas propostas de ' + title + ' — gerado pela Forja, NÃO editar à mão.',
    scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
    dependencies: { vue: '^3.4.0', 'vue-router': '^4.3.0' },
    devDependencies: { vite: '^5.2.0', '@vitejs/plugin-vue': '^5.0.0' },
  }, null, 2) + '\n');

  add('vite.config.js', [
    "import { defineConfig } from 'vite';",
    "import vue from '@vitejs/plugin-vue';",
    '// base = path servido pelo reqhub-api; sem proxy (preview é 100% mock, sem backend).',
    'export default defineConfig({',
    '  base: ' + JSON.stringify(base) + ',',
    '  plugins: [vue()],',
    '});', '',
  ].join('\n'));

  add('index.html', [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '    <title>' + escapeHtml(title) + ' — Preview</title>',
    '  </head>',
    '  <body>',
    '    <div id="app"></div>',
    '    <script type="module" src="/src/main.js"></script>',
    '  </body>',
    '</html>', '',
  ].join('\n'));

  add('.gitignore', ['node_modules', 'dist', ''].join('\n'));

  // --- tokens da marca (mesmo derivador dos apps reais) ---
  add('src/tokens.generated.css', deriveForgeTokensCss(inv.brand));

  // --- estilos locais mínimos da SPA (reset + banner de preview) ---
  add('src/styles.css', PREVIEW_CSS);

  // --- VENDOR: kit @flavioneto11/ui-vue -> src/ui/** ---
  for (const rel of walk(KIT_SRC)) {
    add('src/ui/' + rel, fs.readFileSync(path.join(KIT_SRC, rel), 'utf8'));
  }

  // --- VENDOR: mock-data -> src/mock-data.js (com fallback embutido se o pacote não existir ainda) ---
  add('src/mock-data.js', readMockData());

  // --- main.js + router + nav + App.vue + banner ---
  const screens = inv.screens;
  add('src/main.js', [
    "import { createApp } from 'vue';",
    "import { createRouter, createWebHistory } from 'vue-router';",
    "import App from './App.vue';",
    "import { routes } from './router.js';",
    "import './tokens.generated.css';",
    "import './ui/ui.css';",
    "import './styles.css';",
    'const router = createRouter({ history: createWebHistory(' + JSON.stringify(base) + '), routes });',
    'createApp(App).use(router).mount(' + JSON.stringify('#app') + ');', '',
  ].join('\n'));

  add('src/App.vue', appVue(title, base));
  add('src/components/PreviewBanner.vue', PREVIEW_BANNER_VUE);
  add('src/nav.js', navJs(inv));
  add('src/router.js', routerJs(screens));

  // --- uma view por tela ---
  for (const s of screens) {
    const entity = s.entity ? entityByName.get(s.entity) : null;
    add('src/views/' + pascal(s.slug) + 'View.vue', renderView(s, entity, inv));
  }
  add('src/views/NotFoundView.vue', NOT_FOUND_VUE);

  // --- manifest (consumido pelo reqhub-api p/ saber as telas + status) ---
  const manifest = {
    product, title, base,
    generatedAt: null, // preenchido pelo workflow ao publicar (não-determinístico fica de fora do gerador)
    status: 'generated',
    brand: inv.brand,
    screens: screens.map((s) => ({ slug: s.slug, title: s.title, kind: s.kind, route: s.route, entity: s.entity || null, anchors: s.anchors, purpose: s.purpose || '' })),
    entities: inv.entities.map((e) => ({ name: e.name, label: e.label, fields: e.fields.length })),
  };
  add('preview.manifest.json', JSON.stringify(manifest, null, 2) + '\n');

  add('README.md', [
    '# Preview — ' + title,
    '',
    'SPA Vue+Vite **autocontida** (dados fake) gerada por `specs/forge/preview-ui.mjs`.',
    'Mostra TODAS as telas propostas ANTES de a esteira construir o sistema real.',
    '',
    '- **NÃO editar à mão** — é regenerada a cada iteração do preview.',
    '- Sem backend: tudo vem de `@flavioneto11/mock-data` (determinístico).',
    '- Build: `npm ci && npm run build` → `dist/` estático (servido pelo reqhub-api).',
    '',
    'Telas (' + screens.length + '): ' + screens.map((s) => s.slug).join(', ') + '.', '',
  ].join('\n'));

  const dir = opts.outDir || path.join(REPO_ROOT, 'apps', product + '-preview');
  if (opts.write !== false && opts.outDir !== null) {
    if (opts.clean !== false && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
  }

  return { files, dir, product, title, base, screens, entities: inv.entities, brand: inv.brand, manifest };
}

// ===========================================================================
// GERADORES DE ARQUIVO
// ===========================================================================

function appVue(title, base) {
  return [
    '<template>',
    '  <UiAppShell :title="title" :nav="nav">',
    '    <PreviewBanner />',
    '    <RouterView />',
    '  </UiAppShell>',
    '  <UiToast />',
    '  <UiConfirmDialog />',
    '</template>',
    '<script setup>',
    "import { RouterView } from 'vue-router';",
    "import { UiAppShell, UiToast, UiConfirmDialog } from './ui/index.js';",
    "import PreviewBanner from './components/PreviewBanner.vue';",
    "import { nav } from './nav.js';",
    'const title = ' + JSON.stringify(title) + ';',
    '</script>', '',
  ].join('\n');
}

function navJs(inv) {
  // monta a sidebar a partir de navGroups quando houver; senão agrupa por entidade (heurística simples).
  const bySlug = new Map(inv.screens.map((s) => [s.slug, s]));
  const used = new Set();
  const groups = [];

  const itemFor = (s) => ({ label: s.title, to: s.route, icon: glyphFor(s) });

  if (inv.navGroups.length) {
    for (const g of inv.navGroups) {
      const items = [];
      for (const ref of g.items) {
        // ref pode ser slug, rota ou título
        const s = bySlug.get(ref)
          || inv.screens.find((x) => x.route === ref)
          || inv.screens.find((x) => x.title === ref);
        if (s && !used.has(s.slug)) { items.push(itemFor(s)); used.add(s.slug); }
      }
      if (items.length) groups.push({ group: g.group, items });
    }
  }
  // telas não cobertas por nenhum grupo: caem num grupo "" (topo) ou "Mais".
  const leftovers = inv.screens.filter((s) => !used.has(s.slug));
  if (leftovers.length) {
    // dashboard primeiro, sem título de grupo
    const top = leftovers.filter((s) => s.kind === 'dashboard');
    const rest = leftovers.filter((s) => s.kind !== 'dashboard'
      // list/detail "novo/editar" não viram item de nav próprio (são acessados pela lista)
      && !['create', 'edit'].includes(s.kind));
    if (top.length || !groups.length) groups.unshift({ group: '', items: top.length ? top.map(itemFor) : [] });
    if (rest.length) groups.push({ group: groups.length ? 'Mais' : '', items: rest.map(itemFor) });
    // garante que pelo menos uma tela de navegação exista
  }
  // limpa grupos vazios
  const clean = groups.filter((g) => g.items && g.items.length);
  if (!clean.length) clean.push({ group: '', items: inv.screens.slice(0, 1).map(itemFor) });

  return [
    '// Navegação da sidebar do PREVIEW. Gerado por preview-ui.mjs — não editar à mão.',
    'export const nav = ' + JSON.stringify(clean, null, 2) + ';', '',
  ].join('\n');
}

function routerJs(screens) {
  const imports = screens.map((s) => "import " + pascal(s.slug) + "View from './views/" + pascal(s.slug) + "View.vue';");
  imports.push("import NotFoundView from './views/NotFoundView.vue';");
  // primeira tela (dashboard se houver) vira a rota raiz "/".
  const home = screens.find((s) => s.kind === 'dashboard') || screens[0];
  const seen = new Set();
  const routeLines = [];
  // raiz aponta p/ a home
  routeLines.push("  { path: '/', name: 'home', component: " + pascal(home.slug) + "View },");
  for (const s of screens) {
    if (s.route === '/' || seen.has(s.route)) continue;
    seen.add(s.route);
    // converte :id reais p/ uma rota navegável estática no preview (sem backend) -> mantém :id
    routeLines.push('  { path: ' + JSON.stringify(s.route) + ", name: " + JSON.stringify(s.slug) + ', component: ' + pascal(s.slug) + 'View },');
  }
  routeLines.push("  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },");
  return [
    '// Rotas do PREVIEW. Gerado por preview-ui.mjs — não editar à mão.',
    ...imports,
    'export const routes = [',
    ...routeLines,
    '];', '',
  ].join('\n');
}

// --- render por KIND (mapeamento kind->tela do ui-kit-contract.md) ----------
function renderView(screen, entity, inv) {
  switch (screen.kind) {
    case 'dashboard': return dashboardView(screen, entity, inv);
    case 'list': return listView(screen, entity);
    case 'create': return formView(screen, entity, 'create');
    case 'edit': return formView(screen, entity, 'edit');
    case 'detail': return detailView(screen, entity);
    case 'custom':
    default: return customView(screen, entity);
  }
}

// fields utilitários ---------------------------------------------------------
function tableColumns(entity) {
  const fields = (entity && entity.fields) || [];
  // até 6 colunas, priorizando campos "interessantes"
  const picked = fields.slice(0, 6);
  return picked.map((f) => ({
    key: f.name,
    label: f.label || humanizeLabel(f.name),
    align: (f.type === 'number' || f.type === 'currency') ? 'right' : 'left',
    sortable: ['text', 'number', 'currency', 'date', 'datetime'].includes(f.type),
    format: colFormat(f.type),
  }));
}
function colFormat(type) {
  switch (type) {
    case 'currency': return 'currency';
    case 'date': return 'date';
    case 'datetime': return 'datetime';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'status': return 'badge';
    default: return undefined;
  }
}
function formControl(f) {
  switch (f.type) {
    case 'longtext': return { tag: 'textarea' };
    case 'enum': case 'status': return { tag: 'select', options: f.enumValues && f.enumValues.length ? f.enumValues : ['Opção A', 'Opção B', 'Opção C'] };
    case 'boolean': return { tag: 'checkbox' };
    case 'number': case 'currency': return { tag: 'input', inputType: 'number' };
    case 'date': return { tag: 'input', inputType: 'date' };
    case 'datetime': return { tag: 'input', inputType: 'datetime-local' };
    default: return { tag: 'input', inputType: 'text' };
  }
}

// jsonInline — serializa um valor p/ embutir no <script setup> (CSP-safe: é código, não HTML).
const j = (v) => JSON.stringify(v);

// attr(name, value) — atributo HTML ESTÁTICO com valor literal (string), HTML-escapado e entre
// aspas duplas. Use para title/subtitle/eyebrow/empty-title etc. NUNCA use `:name="texto"` com texto
// literal — `:name` é uma EXPRESSÃO JS e "Visão geral." não é JS válido (quebra o vite). CSP-safe.
const attr = (name, value) => value == null || value === '' ? '' : `${name}="${escapeAttr(String(value))}"`;
// emptyObjExpr(title, description) — objeto p/ a prop :empty do UiDataTable, como expressão JS.
// USA ASPAS SIMPLES nos valores: a prop fica entre aspas DUPLAS no HTML (:empty="...") — JSON
// (aspas duplas) quebraria o delimitador. Escapa ' e \ dentro dos valores.
function emptyObjExpr(title, description) {
  const parts = [];
  if (title) parts.push("title: " + sq(title));
  if (description) parts.push("description: " + sq(description));
  return '{ ' + parts.join(', ') + ' }';
}
// sq — string literal JS entre aspas SIMPLES, segura p/ embutir em atributo de aspas duplas.
function sq(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }

// ---- LIST ------------------------------------------------------------------
function listView(screen, entity) {
  const cols = tableColumns(entity);
  const detailRoute = guessDetailRoute(screen, entity);
  const createRoute = guessCreateRoute(screen, entity);
  const entLabel = entity ? entity.label : screen.title;
  const fieldsForMock = (entity && entity.fields) || cols.map((c) => ({ name: c.key, type: 'text' }));
  return [
    '<template>',
    '  <UiPageLayout ' + attr('title', screen.title) + ' ' + attr('subtitle', screen.purpose || ('Lista de ' + entLabel.toLowerCase() + '.')) + ' eyebrow="Preview" :loading="state===' + "'loading'" + '" :error="state===' + "'error'" + ' ? errorMsg : null" @retry="reload" width="wide">',
    createRoute ? '    <template #actions><UiButton @click="noop">Novo ' + escapeHtml(singular(entLabel)) + '</UiButton></template>' : '',
    '    <template #filters>',
    '      <UiFiltersPanel v-model="filters" :fields="filterFields" @apply="reload" @clear="reload" />',
    '    </template>',
    '    <UiDataTable :columns="columns" :rows="rows" :loading="state===' + "'loading'" + '" row-key="id"',
    '      clickable-rows @row-click="noop"',
    '      :empty="' + emptyObjExpr('Nenhum ' + singular(entLabel).toLowerCase() + ' ainda', 'Quando houver dados, eles aparecem aqui.') + '">',
    createRoute ? '      <template #empty-action><UiButton @click="noop">Cadastrar ' + escapeHtml(singular(entLabel)) + '</UiButton></template>' : '',
    '    </UiDataTable>',
    '  </UiPageLayout>',
    '</template>',
    '<script setup>',
    "import { ref, computed, onMounted } from 'vue';",
    "import { UiPageLayout, UiDataTable, UiButton, UiFiltersPanel } from '../ui/index.js';",
    "import { mockRows } from '../mock-data.js';",
    'const columns = ' + j(cols) + ';',
    'const fieldDefs = ' + j(fieldsForMock.map((f) => ({ name: f.name, type: f.type, enumValues: f.enumValues }))) + ';',
    "const filterFields = [{ key: 'q', label: 'Buscar', type: 'text' }" + filterEnumFields(entity) + '];',
    "const filters = ref({ q: '' });",
    "const state = ref('loading'); // loading -> normal | empty | error",
    "const errorMsg = ref('Não foi possível carregar (preview).');",
    'const allRows = mockRows(fieldDefs, 14);',
    'const rows = computed(() => (state.value === ' + "'empty'" + ' ? [] : allRows));',
    'function reload() { state.value = ' + "'loading'" + '; setTimeout(() => { state.value = ' + "'normal'" + '; }, 280); }',
    'function noop() { /* preview: navegação/ações são ilustrativas */ }',
    'onMounted(reload);',
    '</script>', '',
  ].filter(Boolean).join('\n');
}

function filterEnumFields(entity) {
  const enums = ((entity && entity.fields) || []).filter((f) => (f.type === 'enum' || f.type === 'status') && f.enumValues && f.enumValues.length).slice(0, 2);
  if (!enums.length) return '';
  return ', ' + enums.map((f) => '{ key: ' + j(f.name) + ', label: ' + j(f.label || humanizeLabel(f.name)) + ", type: 'select', options: " + j(f.enumValues) + ' }').join(', ');
}

// ---- FORM (create/edit) ----------------------------------------------------
function formView(screen, entity, mode) {
  const fields = ((entity && entity.fields) || []).slice(0, 12);
  const ctrls = fields.map((f) => ({ f, c: formControl(f) }));
  const inner = ctrls.map(({ f, c }) => formFieldMarkup(f, c)).join('\n');
  const entLabel = entity ? entity.label : screen.title;
  const seedExpr = mode === 'edit' ? 'seedFromMock()' : 'blankForm()';
  return [
    '<template>',
    '  <UiPageLayout ' + attr('title', screen.title) + ' ' + attr('subtitle', screen.purpose || ((mode === 'edit' ? 'Editar ' : 'Cadastrar ') + singular(entLabel).toLowerCase() + '.')) + ' eyebrow="Preview" width="narrow">',
    '    <UiCard ' + attr('title', singular(entLabel)) + '>',
    '      <form @submit.prevent="submit">',
    '        <UiFormSection :columns="2">',
    fields.length ? inner : '          <p class="pv-note">Sem campos definidos para esta entidade.</p>',
    '        </UiFormSection>',
    '        <div class="pv-form-actions">',
    '          <UiButton variant="ghost" type="button" @click="noop">Cancelar</UiButton>',
    '          <UiButton type="submit" :loading="saving">' + (mode === 'edit' ? 'Salvar alterações' : 'Criar') + '</UiButton>',
    '        </div>',
    '      </form>',
    '    </UiCard>',
    '  </UiPageLayout>',
    '</template>',
    '<script setup>',
    "import { ref } from 'vue';",
    "import { UiPageLayout, UiCard, UiFormSection, UiFormField, UiButton, useToast } from '../ui/index.js';",
    "import { mockValue } from '../mock-data.js';",
    'const toast = useToast();',
    'const fieldDefs = ' + j(fields.map((f) => ({ name: f.name, type: f.type, enumValues: f.enumValues }))) + ';',
    'function blankForm() { const o = {}; for (const f of fieldDefs) o[f.name] = f.type === ' + "'boolean'" + ' ? false : ' + "''" + '; return o; }',
    'function seedFromMock() { const o = {}; for (const f of fieldDefs) o[f.name] = mockValue(f); return o; }',
    'const formv = ref(' + seedExpr + ');',
    'const saving = ref(false);',
    'function submit() { saving.value = true; setTimeout(() => { saving.value = false; toast.success(' + "'Pré-visualização: nada foi salvo (sem backend).'" + '); }, 350); }',
    'function noop() {}',
    '</script>',
    '<style scoped>',
    '.pv-form-actions { display: flex; justify-content: flex-end; gap: var(--ui-space-2); margin-top: var(--ui-space-5); }',
    '.pv-note { color: rgb(var(--ui-muted)); }',
    '</style>', '',
  ].filter(Boolean).join('\n');
}

function formFieldMarkup(f, c) {
  const label = f.label || humanizeLabel(f.name);
  const req = f.required ? ' required' : '';
  // v-model SEMPRE por ACESSO POR ÍNDICE com o nome serializado por LITERAL DE ASPAS SIMPLES (sq):
  // a prop fica entre aspas DUPLAS no HTML (v-model="…"), então um literal de aspas duplas (JSON)
  // quebraria o delimitador do atributo. sq escapa ' e \. Nunca interpola f.name cru numa expressão
  // Vue — defesa-em-profundidade: mesmo um nome inesperado não escapa do atributo nem injeta expressão.
  const vmodel = 'v-model="formv[' + sq(f.name) + ']"';
  if (c.tag === 'textarea') {
    return [
      '          <UiFormField ' + attr('label', label) + req + ' v-slot="{ id }">',
      '            <textarea class="pv-control" :id="id" ' + vmodel + ' rows="3"></textarea>',
      '          </UiFormField>',
    ].join('\n');
  }
  if (c.tag === 'select') {
    const opts = c.options.map((o) => '              <option ' + attr('value', String(o)) + '>' + escapeHtml(String(o)) + '</option>').join('\n');
    return [
      '          <UiFormField ' + attr('label', label) + req + ' v-slot="{ id }">',
      '            <select class="pv-control" :id="id" ' + vmodel + '>',
      '              <option value="">—</option>',
      opts,
      '            </select>',
      '          </UiFormField>',
    ].join('\n');
  }
  if (c.tag === 'checkbox') {
    return [
      '          <UiFormField ' + attr('label', label) + req + ' v-slot="{ id }">',
      '            <input type="checkbox" :id="id" ' + vmodel + ' />',
      '          </UiFormField>',
    ].join('\n');
  }
  return [
    '          <UiFormField label=' + j(label) + req + ' v-slot="{ id }">',
    '            <input class="pv-control" :id="id" ' + attr('type', c.inputType || 'text') + ' ' + vmodel + ' />',
    '          </UiFormField>',
  ].join('\n');
}

// ---- DETAIL ----------------------------------------------------------------
function detailView(screen, entity) {
  const fields = ((entity && entity.fields) || []).slice(0, 12);
  const entLabel = entity ? entity.label : screen.title;
  return [
    '<template>',
    '  <UiPageLayout ' + attr('title', screen.title) + ' ' + attr('subtitle', screen.purpose || ('Detalhe de ' + singular(entLabel).toLowerCase() + '.')) + ' eyebrow="Preview" :loading="state===' + "'loading'" + '" width="default">',
    '    <template #actions><UiButton variant="ghost" @click="noop">Editar</UiButton></template>',
    '    <UiCard ' + attr('title', singular(entLabel)) + '>',
    fields.length ? '      <dl class="pv-dl">' : '      <p class="pv-note">Sem campos definidos.</p>',
    fields.length ? fields.map((f) => detailRow(f)).join('\n') : '',
    fields.length ? '      </dl>' : '',
    '    </UiCard>',
    '  </UiPageLayout>',
    '</template>',
    '<script setup>',
    "import { ref, onMounted } from 'vue';",
    "import { UiPageLayout, UiCard, UiButton, UiStatusBadge, format } from '../ui/index.js';",
    "import { mockValue } from '../mock-data.js';",
    'const fieldDefs = ' + j(fields.map((f) => ({ name: f.name, type: f.type, label: f.label || humanizeLabel(f.name), enumValues: f.enumValues }))) + ';',
    "const state = ref('loading');",
    'const record = ref({});',
    'function load() { state.value = ' + "'loading'" + '; setTimeout(() => { const o = {}; for (const f of fieldDefs) o[f.name] = mockValue(f); record.value = o; state.value = ' + "'normal'" + '; }, 280); }',
    'function fmt(f) { const v = record.value[f.name]; return format.formatValue(v, ' + "f.type === 'currency' ? 'currency' : f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime' : f.type === 'number' ? 'number' : f.type === 'boolean' ? 'boolean' : undefined" + '); }',
    'function isStatus(f) { return f.type === ' + "'status'" + ' || f.type === ' + "'enum'" + '; }',
    'function noop() {}',
    'onMounted(load);',
    '</script>',
    '<style scoped>',
    '.pv-dl { display: grid; grid-template-columns: minmax(140px, 220px) 1fr; gap: var(--ui-space-2) var(--ui-space-4); margin: 0; }',
    '.pv-dl dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }',
    '.pv-dl dd { margin: 0; }',
    '.pv-note { color: rgb(var(--ui-muted)); }',
    '</style>', '',
  ].filter(Boolean).join('\n');
}
function detailRow(f) {
  const label = f.label || humanizeLabel(f.name);
  if (f.type === 'status' || f.type === 'enum') {
    // :status por ACESSO POR ÍNDICE com literal de ASPAS SIMPLES (sq) — o atributo usa aspas duplas
    // (:status="…"), então JSON (aspas duplas) quebraria o delimitador. Nunca record.<name> cru.
    return [
      '        <dt>' + escapeHtml(label) + '</dt>',
      '        <dd><UiStatusBadge :status="record[' + sq(f.name) + ']" /></dd>',
    ].join('\n');
  }
  return [
    '        <dt>' + escapeHtml(label) + '</dt>',
    '        <dd>{{ fmt(' + j({ name: f.name, type: f.type }) + ') }}</dd>',
  ].join('\n');
}

// ---- DASHBOARD -------------------------------------------------------------
function dashboardView(screen, entity, inv) {
  // métricas a partir das entidades; tabela de "atividade recente" da 1a entidade com fields.
  const metricEntities = inv.entities.slice(0, 4);
  const firstWithFields = inv.entities.find((e) => e.fields && e.fields.length) || entity;
  const cols = firstWithFields ? tableColumns(firstWithFields) : [];
  const fieldsForMock = firstWithFields ? firstWithFields.fields.map((f) => ({ name: f.name, type: f.type, enumValues: f.enumValues })) : [];
  const metrics = metricEntities.map((e, i) => ({
    label: e.label, key: e.name, tone: ['primary', 'success', 'neutral', 'warning'][i % 4],
  }));
  return [
    '<template>',
    '  <UiPageLayout ' + attr('title', screen.title) + ' ' + attr('subtitle', screen.purpose || 'Visão geral.') + ' eyebrow="Preview" :loading="state===' + "'loading'" + '" width="wide">',
    '    <div class="pv-metrics">',
    '      <UiMetricCard v-for="m in metrics" :key="m.key" :label="m.label" :value="m.value" :tone="m.tone" :hint="m.hint" />',
    '    </div>',
    cols.length ? '    <UiCard title="Atividade recente" subtitle="Amostra de dados (preview).">' : '',
    cols.length ? '      <UiDataTable :columns="columns" :rows="rows" :loading="state===' + "'loading'" + '" row-key="id"' : '',
    cols.length ? '        :empty="' + emptyObjExpr('Sem atividade') + '" />' : '',
    cols.length ? '    </UiCard>' : '',
    '  </UiPageLayout>',
    '</template>',
    '<script setup>',
    "import { ref, onMounted } from 'vue';",
    "import { UiPageLayout, UiMetricCard" + (cols.length ? ', UiCard, UiDataTable' : '') + " } from '../ui/index.js';",
    "import { mockRows, mockValue } from '../mock-data.js';",
    "const state = ref('loading');",
    'const metricDefs = ' + j(metrics) + ';',
    'const metrics = ref(metricDefs.map((m) => ({ ...m, value: ' + "'—'" + ', hint: ' + "''" + ' })));',
    cols.length ? 'const columns = ' + j(cols) + ';' : '',
    cols.length ? 'const fieldDefs = ' + j(fieldsForMock) + ';' : '',
    cols.length ? 'const rows = ref([]);' : '',
    'function load() {',
    '  state.value = ' + "'loading'" + ';',
    '  setTimeout(() => {',
    "    metrics.value = metricDefs.map((m) => ({ ...m, value: mockValue({ name: m.key + '_count', type: 'number' }), hint: 'total' }));",
    cols.length ? '    rows.value = mockRows(fieldDefs, 8);' : '',
    '    state.value = ' + "'normal'" + ';',
    '  }, 300);',
    '}',
    'onMounted(load);',
    '</script>',
    '<style scoped>',
    '.pv-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--ui-space-4); }',
    '</style>', '',
  ].filter(Boolean).join('\n');
}

// ---- CUSTOM ----------------------------------------------------------------
function customView(screen, entity) {
  // tela custom sem entidade clara: mostra propósito + (se houver entidade) uma tabela de amostra.
  const cols = entity ? tableColumns(entity) : [];
  const fieldsForMock = entity ? entity.fields.map((f) => ({ name: f.name, type: f.type, enumValues: f.enumValues })) : [];
  return [
    '<template>',
    '  <UiPageLayout ' + attr('title', screen.title) + ' ' + attr('subtitle', screen.purpose || 'Tela do sistema.') + ' eyebrow="Preview" :loading="state===' + "'loading'" + '" width="wide">',
    cols.length
      ? '    <UiDataTable :columns="columns" :rows="rows" :loading="state===' + "'loading'" + '" row-key="id" :empty="' + emptyObjExpr('Sem dados') + '" />'
      : [
          '    <UiCard ' + attr('title', screen.title) + '>',
          '      <UiEmptyState ' + attr('title', screen.title) + ' ' + attr('description', screen.purpose || 'Conteúdo desta tela aparece aqui no sistema final.') + ' icon="✦" />',
          '    </UiCard>',
        ].join('\n'),
    '  </UiPageLayout>',
    '</template>',
    '<script setup>',
    "import { ref, onMounted } from 'vue';",
    "import { UiPageLayout" + (cols.length ? ', UiDataTable' : ', UiCard, UiEmptyState') + " } from '../ui/index.js';",
    cols.length ? "import { mockRows } from '../mock-data.js';" : '',
    "const state = ref('loading');",
    cols.length ? 'const columns = ' + j(cols) + ';' : '',
    cols.length ? 'const fieldDefs = ' + j(fieldsForMock) + ';' : '',
    cols.length ? 'const rows = ref([]);' : '',
    'function load() { state.value = ' + "'loading'" + '; setTimeout(() => { ' + (cols.length ? 'rows.value = mockRows(fieldDefs, 10); ' : '') + 'state.value = ' + "'normal'" + '; }, 280); }',
    'onMounted(load);',
    '</script>', '',
  ].filter(Boolean).join('\n');
}

// ===========================================================================
// helpers de roteamento/rótulo
// ===========================================================================
function glyphFor(s) {
  const map = { dashboard: '◧', list: '▤', create: '＋', edit: '✎', detail: '▣', custom: '✦' };
  return map[s.kind] || '•';
}
function guessDetailRoute(screen, entity) {
  if (!entity) return null;
  return null; // preview não navega para backend; mantido p/ extensão futura
}
function guessCreateRoute() { return true; } // sempre oferece a CTA "Novo" (ilustrativa)
function singular(label) {
  const s = String(label || '').trim();
  // heurística pt-BR leve: remove plural simples
  if (/ões$/i.test(s)) return s.replace(/ões$/i, 'ão');
  if (/ais$/i.test(s)) return s.replace(/ais$/i, 'al');
  if (/ns$/i.test(s)) return s.replace(/ns$/i, 'm');
  if (/s$/i.test(s) && s.length > 3) return s.replace(/s$/i, '');
  return s;
}

function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, base));
    else out.push(path.relative(base, abs).replace(/\\/g, '/'));
  }
  return out;
}

// mock-data do preview: módulo AUTOCONTIDO embutido (mesma API mockValue/mockRows do pacote
// @flavioneto11/mock-data, mas com o CONTRATO que as VIEWS deste gerador esperam):
//   - mockRows INJETA um `id` por linha (as views usam row-key="id" no UiDataTable);
//   - currency/date/number são RAW (número/ISO), pois as views formatam via ui-vue format.formatValue,
//     que faz Number(value) — uma string "R$ ..." já formatada viraria NaN -> "—".
// Por isso o preview NÃO vendora packages/mock-data (que devolve strings já formatadas e não injeta id):
// os contratos divergem de propósito. Determinístico, sem entropia, pt-BR.
function readMockData() {
  return '// VENDORADO p/ o preview — não editar. Contrato próprio do preview (raw values + id por linha).\n'
    + MOCK_DATA_FALLBACK;
}

// ===========================================================================
// ESTÁTICOS
// ===========================================================================

const PREVIEW_CSS = [
  '/* estilos locais do preview — reset mínimo + controles de form. Tokens --ui-* da marca. */',
  'html, body { margin: 0; padding: 0; }',
  'body { background: rgb(var(--ui-bg)); color: rgb(var(--ui-fg)); font-family: var(--ui-font-sans); font-size: var(--ui-text-md); }',
  '#app { min-height: 100vh; }',
  'a { color: rgb(var(--ui-accent-strong)); }',
  '.pv-control { width: 100%; box-sizing: border-box; padding: 8px 10px; font: inherit; color: rgb(var(--ui-fg));',
  '  background: rgb(var(--ui-surface)); border: 1px solid rgb(var(--ui-border-strong)); border-radius: var(--ui-radius-md); }',
  '.pv-control:focus { outline: 2px solid rgb(var(--ui-accent) / 0.5); outline-offset: 1px; border-color: rgb(var(--ui-accent)); }',
  '',
].join('\n');

const PREVIEW_BANNER_VUE = [
  '<template>',
  '  <div class="pv-banner" role="status">',
  '    <span class="pv-dot" aria-hidden="true">●</span>',
  '    <span><strong>Preview</strong> — telas propostas com dados de exemplo. Nada é salvo; ainda não foi construído.</span>',
  '  </div>',
  '</template>',
  '<script setup></script>',
  '<style scoped>',
  '.pv-banner { display: flex; align-items: center; gap: var(--ui-space-2); margin: var(--ui-space-4) var(--ui-space-5) 0;',
  '  padding: 8px 14px; font-size: var(--ui-text-sm); color: rgb(var(--ui-accent-strong));',
  '  background: rgb(var(--ui-accent) / 0.10); border: 1px solid rgb(var(--ui-accent) / 0.30); border-radius: var(--ui-radius-md); }',
  '.pv-dot { font-size: 9px; }',
  '</style>', '',
].join('\n');

const NOT_FOUND_VUE = [
  '<template>',
  '  <UiPageLayout title="Tela não encontrada" eyebrow="Preview" width="narrow">',
  '    <UiEmptyState title="404" description="Esta rota não existe no preview." icon="∅">',
  '      <template #action><UiButton to="/">Voltar ao início</UiButton></template>',
  '    </UiEmptyState>',
  '  </UiPageLayout>',
  '</template>',
  '<script setup>',
  "import { UiPageLayout, UiEmptyState, UiButton } from '../ui/index.js';",
  '</script>', '',
].join('\n');

// mock-data CANÔNICO do preview (mesma API do pacote irmão: mockValue(field), mockRows(fields,n)),
// porém com o contrato que as views esperam: mockRows injeta `id` por linha e currency/date/number são
// RAW (as views formatam via ui-vue format). Determinístico por hash do nome do campo (sem
// Math.random/Date.now). pt-BR, honesto-mas-genérico.
const MOCK_DATA_FALLBACK = `
// hash FNV-1a determinístico (string -> uint32)
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
// modulo robusto a seeds negativos (>> é shift COM sinal em JS): normaliza p/ índice válido.
function pick(arr, seed) { return arr[((seed % arr.length) + arr.length) % arr.length]; }

const FIRST = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Larissa', 'Marcos', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Sofia', 'Tiago'];
const LAST = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Lima', 'Costa', 'Ferreira', 'Almeida', 'Ribeiro', 'Carvalho', 'Gomes', 'Martins', 'Rocha'];
const COMPANIES = ['Aurora Ltda', 'Vértice S.A.', 'Brisa Comércio', 'Nexa Serviços', 'Horizonte ME', 'Prisma Tech', 'Raízes Agro', 'Onda Digital'];
const CITIES = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Curitiba', 'Porto Alegre', 'Recife', 'Salvador', 'Fortaleza'];
const STATUSES = ['ativo', 'pendente', 'concluído', 'cancelado', 'em análise'];
const WORDS = ['relatório', 'cadastro', 'pedido', 'fatura', 'contrato', 'cliente', 'produto', 'serviço', 'pagamento', 'documento'];

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function pad(n, w) { return String(n).padStart(w, '0'); }

function fieldNameHints(name) {
  const n = String(name || '').toLowerCase();
  return {
    isEmail: /e?-?mail/.test(n),
    isName: /(name|nome|cliente|responsavel|respons|titular|contato)/.test(n) && !/(file|arquivo|user_?name)/.test(n),
    isCompany: /(company|empresa|razao|fantasia|fornecedor)/.test(n),
    isCity: /(city|cidade|municipio)/.test(n),
    isPhone: /(phone|tel|celular|fone|whats)/.test(n),
    isCpf: /(cpf)/.test(n),
    isCnpj: /(cnpj)/.test(n),
    isDoc: /(documento|doc|registro)/.test(n),
    isMoney: /(price|preco|valor|total|amount|salario|custo|receita|despesa)/.test(n),
    isTitle: /(title|titulo|assunto|descricao_curta)/.test(n),
  };
}

export function mockValue(field) {
  const f = field && typeof field === 'object' ? field : { name: String(field || 'campo'), type: 'text' };
  const name = f.name || 'campo';
  const seed = hash(name + ':' + (f.type || 'text'));
  const type = f.type || 'text';
  const hints = fieldNameHints(name);

  switch (type) {
    case 'number': {
      // determinístico, faixa plausível
      return 1 + (seed % 9999);
    }
    case 'currency': {
      const cents = (seed % 900000) + 1000; // 10.00 .. 9010.00
      return Math.round(cents) / 100;
    }
    case 'boolean': return (seed % 2) === 0;
    case 'date': {
      const day = 1 + (seed % 28); const month = 1 + ((seed >>> 5) % 12); const year = 2024 + ((seed >>> 9) % 2);
      return year + '-' + pad(month, 2) + '-' + pad(day, 2);
    }
    case 'datetime': {
      const day = 1 + (seed % 28); const month = 1 + ((seed >>> 5) % 12); const year = 2024 + ((seed >>> 9) % 2);
      const hh = (seed >>> 3) % 24; const mm = (seed >>> 7) % 60;
      return year + '-' + pad(month, 2) + '-' + pad(day, 2) + 'T' + pad(hh, 2) + ':' + pad(mm, 2) + ':00';
    }
    case 'enum':
    case 'status': {
      const opts = Array.isArray(f.enumValues) && f.enumValues.length ? f.enumValues : STATUSES;
      return pick(opts, seed);
    }
    case 'longtext': {
      const a = pick(WORDS, seed); const b = pick(WORDS, seed >>> 4); const c = pick(WORDS, seed >>> 8);
      return capitalize(a) + ' referente a ' + b + ' e ' + c + ', registrado para acompanhamento e revisão posterior.';
    }
    default: {
      // text — usa pistas do nome do campo
      if (hints.isEmail) {
        const fn = pick(FIRST, seed).toLowerCase(); const ln = pick(LAST, seed >>> 4).toLowerCase();
        return fn + '.' + ln + '@exemplo.com.br';
      }
      if (hints.isCompany) return pick(COMPANIES, seed);
      if (hints.isCity) return pick(CITIES, seed);
      if (hints.isName) return pick(FIRST, seed) + ' ' + pick(LAST, seed >>> 4);
      if (hints.isPhone) return '(' + (10 + (seed % 90)) + ') 9' + pad(seed % 10000, 4) + '-' + pad((seed >>> 6) % 10000, 4);
      if (hints.isCpf) return pad(seed % 1000, 3) + '.' + pad((seed >>> 4) % 1000, 3) + '.' + pad((seed >>> 8) % 1000, 3) + '-' + pad((seed >>> 12) % 100, 2);
      if (hints.isCnpj) return pad(seed % 100, 2) + '.' + pad((seed >>> 3) % 1000, 3) + '.' + pad((seed >>> 7) % 1000, 3) + '/0001-' + pad((seed >>> 11) % 100, 2);
      if (hints.isTitle) return capitalize(pick(WORDS, seed)) + ' ' + pad(1 + (seed % 999), 3);
      // genérico legível
      return capitalize(pick(WORDS, seed)) + ' ' + pick(['Alfa', 'Beta', 'Gama', 'Delta', 'Ômega'], seed >>> 5);
    }
  }
}

export function mockRows(fields, n = 10) {
  const defs = Array.isArray(fields) ? fields : [];
  const count = Math.max(0, Math.min(200, n | 0));
  const rows = [];
  for (let i = 0; i < count; i++) {
    const row = { id: i + 1 };
    for (const f of defs) {
      const def = (f && typeof f === 'object') ? f : { name: String(f), type: 'text' };
      // varia por linha mantendo determinismo: injeta o índice no nome do campo p/ o hash
      row[def.name] = mockValue({ name: def.name + '#' + i, type: def.type, enumValues: def.enumValues });
    }
    rows.push(row);
  }
  return rows;
}

export default { mockValue, mockRows };
`;

// ===========================================================================
// CLI
// ===========================================================================
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--product') a.product = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--from' || k === '--inventory') a.from = argv[++i]; // --inventory é alias de --from (usado pelo forge-preview.yml)
    else if (k === '--base') a.base = argv[++i];
    else if (k === '--no-clean') a.noClean = true;
  }
  return a;
}

// carrega o inventário de UI de specs/products/<name>/ (ou de um JSON único).
function loadInventoryForProduct(name) {
  const pdir = path.join(SPECS_DIR, 'products', name);
  const candidates = ['ui-inventory.json', 'architecture.json', 'screens.json'];
  let inv = null;
  for (const c of candidates) {
    const p = path.join(pdir, c);
    if (fs.existsSync(p)) {
      try { inv = JSON.parse(fs.readFileSync(p, 'utf8')); break; } catch (e) { /* tenta o próximo */ }
    }
  }
  // brand.json é a fonte da marca; se o inventário não trouxe brand, usa-o.
  const brandPath = path.join(pdir, 'brand.json');
  let brand = null;
  if (fs.existsSync(brandPath)) { try { brand = JSON.parse(fs.readFileSync(brandPath, 'utf8')); } catch {} }
  if (inv && !inv.brand && brand) inv.brand = brand;
  // product.json p/ nome/título (e brand fallback)
  const ppath = path.join(pdir, 'product.json');
  if (fs.existsSync(ppath)) {
    try {
      const prod = JSON.parse(fs.readFileSync(ppath, 'utf8'));
      if (inv && !inv.brand) inv.brand = brand || { name: prod.display_name || prod.name, accent: '#4f46e5', neutralBase: 'slate', radius: 'md' };
      if (inv) inv.product = inv.product || prod.name;
    } catch {}
  }
  return inv;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.product && !a.from) {
    console.error('uso: node specs/forge/preview-ui.mjs --product <name> [--out <dir>] [--from <inventory.json>] [--base <path>]');
    process.exit(2);
  }
  let inv;
  if (a.from) {
    inv = JSON.parse(fs.readFileSync(path.resolve(a.from), 'utf8'));
    if (a.product) inv.product = a.product;
  } else {
    inv = loadInventoryForProduct(a.product);
    if (!inv) {
      console.error('Inventário de UI não encontrado para "' + a.product + '".');
      console.error('Esperado um destes em specs/products/' + a.product + '/: ui-inventory.json | architecture.json | screens.json');
      console.error('(com brand/entities/screens — o shape do arquiteto-ux). Ou passe --from <json>.');
      process.exit(1);
    }
  }
  if (!Array.isArray(inv.screens) || !inv.screens.length) {
    console.error('Inventário sem telas (screens[]). Nada a gerar.');
    process.exit(1);
  }
  const outDir = a.out ? path.resolve(a.out) : undefined;
  const r = generatePreview(inv, { product: a.product, outDir, base: a.base, clean: !a.noClean });
  console.log('[preview-ui] gerado: ' + r.dir);
  console.log('[preview-ui] produto: ' + r.product + ' — ' + r.screens.length + ' tela(s), ' + r.entities.length + ' entidade(s).');
  console.log('[preview-ui] base: ' + r.base);
  console.log('[preview-ui] próximo: cd "' + r.dir + '" && npm ci && npm run build  ->  dist/ estático.');
}

// só roda o CLI quando executado diretamente (não em import).
const isMain = (() => {
  try { return path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url); } catch { return false; }
})();
if (isMain) main();
