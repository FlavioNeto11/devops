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

  // --- VENDOR: mock-data -> src/mock-data.js (injeta REF_KINDS + ENTITY_COUNTS derivados do inventário) ---
  add('src/mock-data.js', readMockData(inv));

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
    case 'list': return listView(screen, entity, inv);
    case 'create': return formView(screen, entity, 'create', inv);
    case 'edit': return formView(screen, entity, 'edit', inv);
    case 'detail': return detailView(screen, entity, inv);
    case 'calendar': return calendarView(screen, entity, inv);
    case 'booking': return bookingView(screen, entity, inv);
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
function listView(screen, entity, inv) {
  const cols = tableColumns(entity);
  const detailRoute = guessDetailRoute(inv, entity);
  const createRoute = guessCreateRoute(inv, entity);
  const entLabel = entity ? entity.label : screen.title;
  const fieldsForMock = (entity && entity.fields) || cols.map((c) => ({ name: c.key, type: 'text' }));
  return [
    '<template>',
    '  <UiPageLayout ' + attr('title', screen.title) + ' ' + attr('subtitle', screen.purpose || ('Lista de ' + entLabel.toLowerCase() + '.')) + ' eyebrow="Preview" :loading="state===' + "'loading'" + '" :error="state===' + "'error'" + ' ? errorMsg : null" @retry="reload" width="wide">',
    createRoute ? '    <template #actions><UiButton @click="goCreate">Novo ' + escapeHtml(singular(entLabel)) + '</UiButton></template>' : '',
    '    <template #filters>',
    '      <UiFiltersPanel v-model="filters" :fields="filterFields" @apply="reload" @clear="reload" />',
    '    </template>',
    '    <UiDataTable :columns="columns" :rows="rows" :loading="state===' + "'loading'" + '" row-key="id"',
    '      clickable-rows @row-click="' + (detailRoute ? 'goDetail' : 'noop') + '"',
    '      :empty="' + emptyObjExpr('Nenhum ' + singular(entLabel).toLowerCase() + ' ainda', 'Quando houver dados, eles aparecem aqui.') + '">',
    createRoute ? '      <template #empty-action><UiButton @click="goCreate">Cadastrar ' + escapeHtml(singular(entLabel)) + '</UiButton></template>' : '',
    '    </UiDataTable>',
    '  </UiPageLayout>',
    '</template>',
    '<script setup>',
    "import { ref, computed, onMounted } from 'vue';",
    "import { useRouter } from 'vue-router';",
    "import { UiPageLayout, UiDataTable, UiButton, UiFiltersPanel } from '../ui/index.js';",
    "import { mockRows } from '../mock-data.js';",
    'const router = useRouter();',
    'const columns = ' + j(cols) + ';',
    'const fieldDefs = ' + j(fieldsForMock.map((f) => ({ name: f.name, type: f.type, enumValues: f.enumValues }))) + ';',
    "const filterFields = [{ key: 'q', label: 'Buscar', type: 'text' }" + filterEnumFields(entity) + '];',
    "const filters = ref({ q: '' });",
    "const state = ref('normal'); // preview: dados de exemplo já populados (sem loading fake — nunca eterno)",
    "const errorMsg = ref('Não foi possível carregar (preview).');",
    'const allRows = mockRows(fieldDefs, ' + (entity ? entityCountOf(entity) : 14) + ');',
    'const rows = computed(() => (state.value === ' + "'empty'" + ' ? [] : allRows));',
    'function reload() { state.value = ' + "'normal'" + '; }',
    // navegação DENTRO do preview (rotas que o router.js já gera) — .catch p/ não estourar promise rejeitada
    createRoute ? 'function goCreate() { router.push({ name: ' + sq(createRoute) + " }).catch(() => {}); }" : '',
    detailRoute ? 'function goDetail(row) { router.push({ name: ' + sq(detailRoute) + ', params: { id: encodeURIComponent(String((row && row.id) != null ? row.id : ' + "'1'" + ')) } }).catch(() => {}); }' : '',
    'function noop() { /* sem tela alvo no inventário: mantém o realce de clicável, mas não navega */ }',
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
function formView(screen, entity, mode, inv) {
  const listRoute = guessListRoute(inv, entity);
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
    '          <UiButton variant="ghost" type="button" @click="cancel">Cancelar</UiButton>',
    '          <UiButton type="submit" :loading="saving">' + (mode === 'edit' ? 'Salvar alterações' : 'Criar') + '</UiButton>',
    '        </div>',
    '      </form>',
    '    </UiCard>',
    '  </UiPageLayout>',
    '</template>',
    '<script setup>',
    "import { ref } from 'vue';",
    "import { useRouter } from 'vue-router';",
    "import { UiPageLayout, UiCard, UiFormSection, UiFormField, UiButton, useToast } from '../ui/index.js';",
    "import { mockValue } from '../mock-data.js';",
    'const router = useRouter();',
    'const toast = useToast();',
    'const fieldDefs = ' + j(fields.map((f) => ({ name: f.name, type: f.type, enumValues: f.enumValues }))) + ';',
    'function blankForm() { const o = {}; for (const f of fieldDefs) o[f.name] = f.type === ' + "'boolean'" + ' ? false : ' + "''" + '; return o; }',
    'function seedFromMock() { const o = {}; for (const f of fieldDefs) o[f.name] = mockValue(f); return o; }',
    'const formv = ref(' + seedExpr + ');',
    'const saving = ref(false);',
    'function submit() { saving.value = true; setTimeout(() => { saving.value = false; toast.success(' + "'Pré-visualização: nada foi salvo (sem backend).'" + '); }, 350); }',
    // Cancelar: volta p/ a lista da entidade (se existir no inventário) ou p/ a tela anterior.
    'function cancel() { ' + (listRoute ? 'router.push({ name: ' + sq(listRoute) + " }).catch(() => {});" : 'router.back();') + ' }',
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
function detailView(screen, entity, inv) {
  const editRoute = guessEditRoute(inv, entity);
  const fields = ((entity && entity.fields) || []).slice(0, 12);
  const entLabel = entity ? entity.label : screen.title;
  return [
    '<template>',
    '  <UiPageLayout ' + attr('title', screen.title) + ' ' + attr('subtitle', screen.purpose || ('Detalhe de ' + singular(entLabel).toLowerCase() + '.')) + ' eyebrow="Preview" :loading="state===' + "'loading'" + '" width="default">',
    editRoute ? '    <template #actions><UiButton variant="ghost" @click="goEdit">Editar</UiButton></template>' : '',
    '    <UiCard ' + attr('title', singular(entLabel)) + '>',
    fields.length ? '      <dl class="pv-dl">' : '      <p class="pv-note">Sem campos definidos.</p>',
    fields.length ? fields.map((f) => detailRow(f)).join('\n') : '',
    fields.length ? '      </dl>' : '',
    '    </UiCard>',
    '  </UiPageLayout>',
    '</template>',
    '<script setup>',
    "import { ref, onMounted } from 'vue';",
    editRoute ? "import { useRouter, useRoute } from 'vue-router';" : '',
    "import { UiPageLayout, UiCard, UiButton, UiStatusBadge, format } from '../ui/index.js';",
    "import { mockValue } from '../mock-data.js';",
    editRoute ? 'const router = useRouter(); const route = useRoute();' : '',
    'const fieldDefs = ' + j(fields.map((f) => ({ name: f.name, type: f.type, label: f.label || humanizeLabel(f.name), enumValues: f.enumValues }))) + ';',
    "const state = ref('normal');",
    'const record = ref((function () { const o = {}; for (const f of fieldDefs) o[f.name] = mockValue(f); return o; })());',
    'function load() { state.value = ' + "'normal'" + '; }',
    'function fmt(f) { const v = record.value[f.name]; return format.formatValue(v, ' + "f.type === 'currency' ? 'currency' : f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime' : f.type === 'number' ? 'number' : f.type === 'boolean' ? 'boolean' : undefined" + '); }',
    'function isStatus(f) { return f.type === ' + "'status'" + ' || f.type === ' + "'enum'" + '; }',
    // Editar: mantém o mesmo :id da rota de detalhe (fallback '1') ao ir p/ a tela de edição.
    editRoute ? 'function goEdit() { router.push({ name: ' + sq(editRoute) + ", params: { id: route.params.id || '1' } }).catch(() => {}); }" : '',
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
    "import { mockRows, mockCount } from '../mock-data.js';",
    "const state = ref('normal');",
    'const metricDefs = ' + j(metrics) + ';',
    // números plausíveis (dezenas/poucas centenas) já no setup — sem loading fake nem valores "milhares"
    "const metrics = ref(metricDefs.map((m) => ({ ...m, value: mockCount(m.key), hint: 'total' })));",
    cols.length ? 'const columns = ' + j(cols) + ';' : '',
    cols.length ? 'const fieldDefs = ' + j(fieldsForMock) + ';' : '',
    cols.length ? 'const rows = ref(mockRows(fieldDefs, 8));' : '',
    'function load() { state.value = ' + "'normal'" + '; }',
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
    "const state = ref('normal');",
    cols.length ? 'const columns = ' + j(cols) + ';' : '',
    cols.length ? 'const fieldDefs = ' + j(fieldsForMock) + ';' : '',
    cols.length ? 'const rows = ref(mockRows(fieldDefs, ' + (entity ? entityCountOf(entity) : 10) + '));' : '',
    'function load() { state.value = ' + "'normal'" + '; }',
    'onMounted(load);',
    '</script>', '',
  ].filter(Boolean).join('\n');
}

// ---- CALENDAR (agenda recurso × horário) -----------------------------------
// Domínios de agendamento (recurso × tempo) ganham uma grade semanal: colunas = profissionais/recursos,
// linhas = horários; blocos mockados (serviço + cliente) posicionados deterministicamente por semana.
// Reusa mockValue (nomes/serviços do MESMO pool do preview). Ilustrativo — nada é salvo.
function calendarView(screen, entity, inv) {
  const entLabel = entity ? entity.label : screen.title;
  const bookingRoute = entity ? routeNameFor(inv, entity.name, 'booking') : null;
  return [
    '<template>',
    '  <UiPageLayout ' + attr('title', screen.title) + ' ' + attr('subtitle', screen.purpose || ('Agenda de ' + entLabel.toLowerCase() + ' — recurso × horário.')) + ' eyebrow="Preview" width="wide">',
    bookingRoute ? '    <template #actions><UiButton @click="goBook">Nova marcação</UiButton></template>' : '',
    '    <UiCard>',
    '      <div class="cal-head">',
    '        <button class="cal-nav" type="button" @click="week--" aria-label="Semana anterior">‹</button>',
    '        <strong>{{ weekLabel }}</strong>',
    '        <button class="cal-nav" type="button" @click="week++" aria-label="Próxima semana">›</button>',
    '      </div>',
    '      <div class="cal-scroll">',
    '        <div class="cal-grid">',
    '          <div class="cal-cell cal-corner"></div>',
    '          <div v-for="r in resources" :key="r" class="cal-cell cal-res">{{ r }}</div>',
    '          <template v-for="slot in slots" :key="slot">',
    '            <div class="cal-cell cal-time">{{ slot }}</div>',
    '            <div v-for="r in resources" :key="r + slot" class="cal-cell cal-slot">',
    "              <button v-if=\"appt(r, slot)\" type=\"button\" class=\"cal-appt\" :class=\"'tone-' + appt(r, slot).tone\" @click=\"pick()\">",
    '                <span class="cal-appt-svc">{{ appt(r, slot).service }}</span>',
    '                <span class="cal-appt-cli">{{ appt(r, slot).client }}</span>',
    '              </button>',
    '            </div>',
    '          </template>',
    '        </div>',
    '      </div>',
    '      <p class="cal-note">Agenda de exemplo — clique num horário marcado (nada é salvo).</p>',
    '    </UiCard>',
    '  </UiPageLayout>',
    '</template>',
    '<script setup>',
    "import { ref, computed } from 'vue';",
    bookingRoute ? "import { useRouter } from 'vue-router';" : '',
    "import { UiPageLayout, UiCard, UiButton, useToast } from '../ui/index.js';",
    "import { mockValue } from '../mock-data.js';",
    bookingRoute ? 'const router = useRouter();' : '',
    'const toast = useToast();',
    'const week = ref(0);',
    "const slots = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];",
    "const resources = [0, 1, 2, 3].map((i) => mockValue({ name: 'profissional#' + i, type: 'text' }));",
    "const TONES = ['ok', 'info', 'warn'];",
    'function h32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }',
    'function appt(r, slot) {',
    "  const seed = h32(r + '|' + slot + '|' + week.value);",
    '  if (seed % 5 < 2) return null;',
    "  return { service: mockValue({ name: 'servico#' + (seed % 6), type: 'text' }), client: mockValue({ name: 'cliente#' + (seed % 9), type: 'text' }), tone: TONES[seed % TONES.length] };",
    '}',
    "const weekLabel = computed(() => week.value === 0 ? 'Esta semana' : (week.value > 0 ? 'Em ' + week.value + ' semana(s)' : 'Há ' + (-week.value) + ' semana(s)'));",
    "function pick() { toast.success('Pré-visualização: agenda de exemplo (nada é salvo).'); }",
    bookingRoute ? 'function goBook() { router.push({ name: ' + sq(bookingRoute) + " }).catch(() => {}); }" : '',
    '</script>',
    '<style scoped>',
    '.cal-head { display: flex; align-items: center; justify-content: center; gap: var(--ui-space-4); margin-bottom: var(--ui-space-3); }',
    '.cal-nav { border: 1px solid rgb(var(--ui-border)); background: rgb(var(--ui-surface)); color: rgb(var(--ui-fg)); border-radius: var(--ui-radius-md); width: 30px; height: 30px; cursor: pointer; font-size: 16px; line-height: 1; }',
    '.cal-scroll { overflow-x: auto; }',
    // colunas FIXAS (1 de horário + 4 de profissionais — resources tem sempre 4): grade no CSS, sem :style
    // (inline style é proibido pela CSP estrita do preview; ver o teste CSP do gerador).
    '.cal-grid { display: grid; grid-template-columns: 64px repeat(4, minmax(116px, 1fr)); gap: 1px; background: rgb(var(--ui-border)); border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-md); overflow: hidden; min-width: 560px; }',
    '.cal-cell { background: rgb(var(--ui-surface)); padding: 6px 8px; min-height: 42px; }',
    '.cal-corner, .cal-res { background: rgb(var(--ui-surface-2)); }',
    '.cal-res { font-weight: 600; font-size: var(--ui-text-sm); text-align: center; }',
    '.cal-time { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); display: flex; align-items: center; }',
    '.cal-slot { padding: 4px; }',
    '.cal-appt { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; border: 0; border-radius: var(--ui-radius-sm); padding: 4px 6px; cursor: pointer; font: inherit; color: rgb(var(--ui-fg)); }',
    '.cal-appt-svc { font-size: var(--ui-text-xs); font-weight: 700; }',
    '.cal-appt-cli { font-size: var(--ui-text-xs); opacity: 0.75; }',
    '.tone-ok { background: rgb(var(--ui-ok) / 0.16); }',
    '.tone-info { background: rgb(var(--ui-accent) / 0.16); }',
    '.tone-warn { background: rgb(var(--ui-warn) / 0.18); }',
    '.cal-note { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); margin: var(--ui-space-3) 0 0; }',
    '</style>', '',
  ].filter(Boolean).join('\n');
}

// ---- BOOKING (fluxo guiado de marcação: serviço → horário → confirmar) ------
function bookingView(screen, entity, inv) {
  const entLabel = entity ? entity.label : screen.title;
  const listRoute = entity ? routeNameFor(inv, entity.name, 'list') : null;
  return [
    '<template>',
    '  <UiPageLayout ' + attr('title', screen.title) + ' ' + attr('subtitle', screen.purpose || ('Marcar ' + singular(entLabel).toLowerCase() + ' em 3 passos.')) + ' eyebrow="Preview" width="narrow">',
    '    <UiCard>',
    '      <ol class="bk-steps">',
    "        <li :class=\"{ on: step >= 1, done: step > 1 }\">1 · Serviço</li>",
    "        <li :class=\"{ on: step >= 2, done: step > 2 }\">2 · Horário</li>",
    "        <li :class=\"{ on: step >= 3 }\">3 · Confirmar</li>",
    '      </ol>',
    '      <div v-if="step === 1" class="bk-body">',
    '        <p class="bk-q">Escolha o serviço</p>',
    "        <button v-for=\"s in services\" :key=\"s.name\" type=\"button\" class=\"bk-opt\" :class=\"{ sel: form.service === s.name }\" @click=\"form.service = s.name\">",
    '          <span class="bk-opt-n">{{ s.name }}</span><span class="bk-opt-m">{{ s.dur }} min · {{ s.price }}</span>',
    '        </button>',
    '      </div>',
    '      <div v-else-if="step === 2" class="bk-body">',
    '        <p class="bk-q">Escolha o horário — {{ form.pro }}</p>',
    '        <div class="bk-slots">',
    "          <button v-for=\"t in slots\" :key=\"t\" type=\"button\" class=\"bk-slot\" :class=\"{ sel: form.time === t }\" @click=\"form.time = t\">{{ t }}</button>",
    '        </div>',
    '      </div>',
    '      <div v-else class="bk-body">',
    '        <p class="bk-q">Confirme a marcação</p>',
    '        <dl class="bk-sum">',
    '          <dt>Serviço</dt><dd>{{ form.service }}</dd>',
    '          <dt>Horário</dt><dd>{{ form.time }}</dd>',
    '          <dt>Profissional</dt><dd>{{ form.pro }}</dd>',
    '        </dl>',
    '      </div>',
    '      <div class="bk-actions">',
    "        <UiButton v-if=\"step > 1\" variant=\"ghost\" type=\"button\" @click=\"step--\">Voltar</UiButton>",
    "        <UiButton v-if=\"step < 3\" type=\"button\" :disabled=\"!canNext ? 'disabled' : null\" @click=\"next\">Continuar</UiButton>",
    '        <UiButton v-else type="button" @click="confirm">Confirmar marcação</UiButton>',
    '      </div>',
    '    </UiCard>',
    '  </UiPageLayout>',
    '</template>',
    '<script setup>',
    "import { ref, computed } from 'vue';",
    listRoute ? "import { useRouter } from 'vue-router';" : '',
    "import { UiPageLayout, UiCard, UiButton, useToast } from '../ui/index.js';",
    "import { mockValue } from '../mock-data.js';",
    listRoute ? 'const router = useRouter();' : '',
    'const toast = useToast();',
    'const step = ref(1);',
    "const slots = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];",
    "const PRICES = ['R$ 40', 'R$ 60', 'R$ 90', 'R$ 120'];",
    // tiers DISTINTOS (evita nomes de serviço repetidos numa lista de 4 — pareceria bug)
    "const TIERS = ['Básico', 'Padrão', 'Premium', 'Completo'];",
    "const services = TIERS.map((t, i) => ({ name: 'Serviço ' + t, dur: 20 + i * 15, price: PRICES[i % PRICES.length] }));",
    "const form = ref({ service: '', time: '', pro: mockValue({ name: 'profissional#0', type: 'text' }) });",
    "const canNext = computed(() => step.value === 1 ? !!form.value.service : step.value === 2 ? !!form.value.time : true);",
    'function next() { if (canNext.value && step.value < 3) step.value++; }',
    "function confirm() { toast.success('Pré-visualização: marcação de exemplo (nada é salvo).'); step.value = 1; form.value = { service: '', time: '', pro: form.value.pro }; " + (listRoute ? "router.push({ name: " + sq(listRoute) + " }).catch(() => {});" : '') + ' }',
    '</script>',
    '<style scoped>',
    '.bk-steps { display: flex; gap: var(--ui-space-2); list-style: none; margin: 0 0 var(--ui-space-4); padding: 0; }',
    '.bk-steps li { flex: 1; text-align: center; font-size: var(--ui-text-xs); font-weight: 600; color: rgb(var(--ui-muted)); border-bottom: 2px solid rgb(var(--ui-border)); padding-bottom: 6px; }',
    '.bk-steps li.on { color: rgb(var(--ui-fg)); border-bottom-color: rgb(var(--ui-accent)); }',
    '.bk-steps li.done { color: rgb(var(--ui-accent-strong, var(--ui-accent))); }',
    '.bk-q { font-weight: 600; margin: 0 0 var(--ui-space-3); }',
    '.bk-opt { display: flex; justify-content: space-between; align-items: center; width: 100%; text-align: left; border: 1px solid rgb(var(--ui-border)); background: rgb(var(--ui-surface)); border-radius: var(--ui-radius-md); padding: 10px 12px; margin-bottom: 8px; cursor: pointer; font: inherit; color: rgb(var(--ui-fg)); }',
    '.bk-opt.sel { border-color: rgb(var(--ui-accent)); background: rgb(var(--ui-accent) / 0.1); }',
    '.bk-opt-n { font-weight: 600; }',
    '.bk-opt-m { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }',
    '.bk-slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 8px; }',
    '.bk-slot { border: 1px solid rgb(var(--ui-border)); background: rgb(var(--ui-surface)); border-radius: var(--ui-radius-md); padding: 10px; cursor: pointer; font: inherit; color: rgb(var(--ui-fg)); }',
    '.bk-slot.sel { border-color: rgb(var(--ui-accent)); background: rgb(var(--ui-accent) / 0.1); font-weight: 700; }',
    '.bk-sum { display: grid; grid-template-columns: 120px 1fr; gap: var(--ui-space-2) var(--ui-space-4); margin: 0; }',
    '.bk-sum dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }',
    '.bk-sum dd { margin: 0; font-weight: 600; }',
    '.bk-actions { display: flex; justify-content: flex-end; gap: var(--ui-space-2); margin-top: var(--ui-space-5); }',
    '</style>', '',
  ].filter(Boolean).join('\n');
}

// ===========================================================================
// helpers de roteamento/rótulo
// ===========================================================================
function glyphFor(s) {
  const map = { dashboard: '◧', list: '▤', create: '＋', edit: '✎', detail: '▣', custom: '✦', calendar: '▦', booking: '⧉' };
  return map[s.kind] || '•';
}
// routeNameFor — resolve o NOME de rota (Vue Router) da tela da MESMA entidade com o `kind` pedido,
// espelhando a nomeação do routerJs: a home (dashboard OU 1ª tela) e qualquer tela com route '/'
// chamam-se 'home'; as demais usam o próprio slug. Retorna null se não existir tela alvo. Isso liga
// as ações do preview (Novo/linha/Editar/Cancelar) às rotas que o router.js JÁ gera — sem inventar destino.
function routeNameFor(inv, entityName, kind) {
  const screens = (inv && inv.screens) || [];
  if (!entityName || !screens.length) return null;
  const home = screens.find((s) => s.kind === 'dashboard') || screens[0];
  const match = screens.find((s) => s.entity === entityName && s.kind === kind);
  if (!match) return null;
  if ((home && match.slug === home.slug) || match.route === '/') return 'home';
  return match.slug;
}
function guessDetailRoute(inv, entity) { return entity ? routeNameFor(inv, entity.name, 'detail') : null; }
function guessCreateRoute(inv, entity) { return entity ? routeNameFor(inv, entity.name, 'create') : null; }
function guessEditRoute(inv, entity) { return entity ? routeNameFor(inv, entity.name, 'edit') : null; }
function guessListRoute(inv, entity) { return entity ? routeNameFor(inv, entity.name, 'list') : null; }
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
// --- classificação de entidade p/ mock COERENTE (A2/A4) — infere pelo nome/label, SEM receber o brief ---
const PERSON_RE = /(client|customer|cliente|barber|barbeiro|user|usuario|professional|profissional|staff|employ|funcionario|patient|paciente|doctor|medico|dentist|dentista|tutor|aluno|student|member|membro|atendente|attendant|seller|vendedor|manager|gerente|driver|motorista|prestador|responsavel|contato|contact|guest|host|pessoa|person|people|terapeuta|nutricionista)/;
const SERVICE_RE = /(servic|service|plano|plan|produto|product|pacote|package|assinatura|subscription|procedimento|tratamento|treatment|aula|class|curso|course)/;
const TXN_RE = /(agendamento|appointment|pedido|order|venda|sale|transac|pagamento|payment|fatura|invoice|reserva|booking|atendimento|consulta|sessao|session|movimenta|lancamento|ticket|chamado)/;
function fnv(s) { let h = 0x811c9dc5; const t = String(s || ''); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function refKeyJs(s) { return String(s || '').split('#')[0].toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/_?id$/, '').replace(/[^a-z0-9]/g, '').replace(/s$/, ''); }
function entityKindOf(e) {
  const hay = (String(e && e.name || '') + ' ' + String(e && e.label || '')).toLowerCase();
  if (PERSON_RE.test(hay)) return 'person';
  if (SERVICE_RE.test(hay)) return 'service';
  return 'thing';
}
// contagem PLAUSÍVEL por entidade (transacional = dezenas; pessoa/recurso e serviço = poucas).
function entityCountOf(e) {
  const hay = (String(e && e.name || '') + ' ' + String(e && e.label || '')).toLowerCase();
  const seed = fnv(refKeyJs(e && e.name));
  if (TXN_RE.test(hay)) return 12 + (seed % 9);          // 12..20
  const kind = entityKindOf(e);
  if (kind === 'person') return 3 + (seed % 7);          // 3..9
  if (kind === 'service') return 4 + (seed % 7);         // 4..10
  return 6 + (seed % 9);                                  // 6..14
}
// mapas injetados no mock-data.js: REF_KINDS (resolução de referências) + ENTITY_COUNTS (escala coerente).
function buildEntityMeta(entities) {
  const refKinds = {}; const counts = {};
  for (const e of (Array.isArray(entities) ? entities : [])) {
    if (!e || !e.name) continue;
    const meta = { kind: entityKindOf(e), label: singular(e.label || e.name) };
    refKinds[refKeyJs(e.name)] = meta;
    if (e.label) refKinds[refKeyJs(e.label)] = meta;
    counts[e.name] = entityCountOf(e);
  }
  return { refKinds, counts };
}

function readMockData(inv) {
  const { refKinds, counts } = buildEntityMeta(inv && inv.entities);
  return '// VENDORADO p/ o preview — não editar. Contrato próprio do preview (raw values + id por linha).\n'
    + 'const REF_KINDS = ' + JSON.stringify(refKinds) + ';\n'
    + 'const ENTITY_COUNTS = ' + JSON.stringify(counts) + ';\n'
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

// Referência a outra entidade: normaliza o nome do campo (tira #i do mockRows, _id, plural) e resolve pelo
// REF_KINDS injetado (pessoa -> nome de pessoa; serviço/coisa -> rótulo legível). Corrige colunas de FK
// que caíam no fallback genérico ("cliente = Pedido Delta").
function refKey(s) { return String(s || '').split('#')[0].toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/_?id$/, '').replace(/[^a-z0-9]/g, '').replace(/s$/, ''); }
function refValue(name, seed) {
  const r = (typeof REF_KINDS !== 'undefined') ? REF_KINDS[refKey(name)] : null;
  if (!r) return null;
  if (r.kind === 'person') return pick(FIRST, seed) + ' ' + pick(LAST, seed >>> 4);
  if (r.kind === 'service') return (r.label || 'Serviço') + ' ' + pick(['Premium', 'Básico', 'Completo', 'Padrão', 'Avulso', 'Mensal'], seed >>> 3);
  return (r.label || 'Item') + ' ' + pad(1 + (seed % 99), 2);
}

function fieldNameHints(name) {
  const n = String(name || '').toLowerCase();
  return {
    isEmail: /e?-?mail/.test(n),
    isName: /(name|nome|cliente|client|customer|barbeiro|barber|profissional|professional|atendente|attendant|responsavel|respons|titular|contato|contact|funcionario|employ|staff|vendedor|seller|paciente|patient|medico|doctor|tutor|aluno|student|membro|member|usuario|user)/.test(n) && !/(file|arquivo|user_?name|username)/.test(n),
    isCompany: /(company|empresa|razao|fantasia|fornecedor)/.test(n),
    isCity: /(city|cidade|municipio)/.test(n),
    isPhone: /(phone|tel|celular|fone|whats)/.test(n),
    isCpf: /(cpf)/.test(n),
    isCnpj: /(cnpj)/.test(n),
    isDoc: /(documento|doc|registro)/.test(n),
    isMoney: /(price|preco|valor|total|amount|salario|custo|receita|despesa)/.test(n),
    isTitle: /(title|titulo|assunto|descricao_curta)/.test(n),
    // PK/código: SÓ chaves "cruas" (id, code, sku…). *_id de referência é resolvido antes (refValue/isName).
    isId: /^(id|uuid|guid|codigo|code|sku|matricula|protocolo|numero|num)$|_id$/.test(n),
  };
}

export function mockValue(field) {
  const f = field && typeof field === 'object' ? field : { name: String(field || 'campo'), type: 'text' };
  const name = f.name || 'campo';
  const seed = hash(name + ':' + (f.type || 'text'));
  const type = f.type || 'text';
  const hints = fieldNameHints(String(name).split('#')[0]); // tira o sufixo "#i" de variação de linha antes de casar pistas

  switch (type) {
    case 'number': {
      // determinístico, faixa plausível para uma célula de tabela (não milhares)
      return 1 + (seed % 999);
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
      // referência a outra entidade -> valor coerente com o tipo dela (pessoa/serviço/coisa)
      const ref = refValue(name, seed);
      if (ref != null) return ref;
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
      if (hints.isId) return '#' + pad(1 + (seed % 9999), 4); // PK/código cru (checado por último)
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

// Contagem PLAUSÍVEL para cards de métrica (dezenas a poucas centenas — nunca "milhares" num preview
// de produto pequeno). Determinístico por chave. Substitui o antigo mockValue({type:'number'}) que ia até 9999.
export function mockCount(key) {
  if (typeof ENTITY_COUNTS !== 'undefined' && ENTITY_COUNTS[key] != null) return ENTITY_COUNTS[key]; // contagem COERENTE (= nº de linhas)
  const seed = hash(String(key || 'count') + ':count');
  return 6 + (seed % 174); // 6..179 (fallback)
}

export default { mockValue, mockRows, mockCount };
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
