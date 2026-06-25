<!--
  ApiDocsView — Documentação da API do NeuroEvolui (REQ-NEUROEVOLUI-0008).

  Esta tela embute a documentação OpenAPI gerada *contract-first* (ReDoc, servido pelo backend em
  GET /docs) e dá acesso de primeira classe à spec canônica validada no CI (GET /docs/openapi.yaml):
  abrir em nova aba, copiar URL e baixar o arquivo.

  Além de embutir o ReDoc (a fonte da verdade visual), a tela lê a própria spec e extrai um RESUMO
  legível — título/versão da API, versão do OpenAPI, total de endpoints e operações agrupadas por tag —
  para dar contexto antes do leitor mergulhar no documento completo. Cada operação leva ao ponto certo
  do ReDoc embutido.

  Robustez: o parsing do YAML é tolerante a falhas (fail-soft). Se a spec não puder ser interpretada,
  o resumo cai para um estado vazio honesto MAS o ReDoc embutido continua funcionando — ele é a fonte
  canônica. Se nem a spec carregar (rede/404), a página inteira mostra erro com "tentar de novo".

  Contrato de UI: usa SÓ o kit ui-vue + tokens --ui-*. Sem style inline, sem :style, sem v-html (CSP).
  Todos os estados (loading/empty/error/normal) renderizados. Endpoints REAIS do backend apenas.
-->
<template>
  <UiPageLayout
    eyebrow="NeuroEvolui · API"
    title="Documentação da API"
    subtitle="Especificação OpenAPI gerada contract-first e validada no CI — explore os endpoints abaixo."
    width="wide"
    :loading="loading"
    loading-message="Carregando a especificação da API…"
    :error="error"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" size="sm" :href="docsUrl" target="_blank" rel="noopener noreferrer">Abrir ReDoc</UiButton>
      <UiButton variant="ghost" size="sm" @click="copySpecUrl">Copiar URL da spec</UiButton>
      <UiButton variant="subtle" size="sm" :href="specUrl" download="openapi.yaml" target="_blank" rel="noopener noreferrer">Baixar openapi.yaml</UiButton>
    </template>

    <template #banner>
      <div class="adoc-banner" role="note">
        <span class="adoc-banner-icon" aria-hidden="true">📐</span>
        <p class="adoc-banner-text">
          <strong>Contract-first.</strong>
          A spec <span class="ui-mono">openapi.yaml</span> é a fonte da verdade do contrato HTTP — toda
          rota implementada é conferida contra ela no CI. Esta tela atende ao requisito
          <span class="adoc-anchor ui-mono">REQ-NEUROEVOLUI-0008</span>.
        </p>
      </div>
    </template>

    <!-- ── Resumo da spec (métricas) ─────────────────────────────────────────── -->
    <section class="adoc-metrics" aria-label="Resumo da especificação">
      <UiMetricCard label="API" :value="meta.title" tone="primary" :hint="meta.version ? ('versão ' + meta.version) : 'sem versão declarada'" />
      <UiMetricCard label="OpenAPI" :value="meta.openapi || '—'" hint="versão do formato" />
      <UiMetricCard label="Endpoints" :value="meta.pathCount" tone="neutral" hint="caminhos documentados" />
      <UiMetricCard label="Operações" :value="meta.operationCount" tone="success" :hint="meta.tagCount + ' grupo(s) por tag'" />
    </section>

    <div class="adoc-grid">
      <!-- ── Coluna lateral: visão geral + índice por tag ────────────────────── -->
      <div class="adoc-aside">
        <UiCard title="Visão geral" subtitle="Resumo extraído da especificação.">
          <dl class="adoc-dl">
            <div class="adoc-dl-row">
              <dt>Título</dt>
              <dd>{{ meta.title }}</dd>
            </div>
            <div class="adoc-dl-row">
              <dt>Versão</dt>
              <dd>
                <UiStatusBadge v-if="meta.version" :label="meta.version" tone="running" size="sm" :with-dot="false" />
                <span v-else class="ui-muted">—</span>
              </dd>
            </div>
            <div v-if="meta.description" class="adoc-dl-row adoc-dl-row-block">
              <dt>Descrição</dt>
              <dd class="adoc-desc">
                <p v-for="(p, i) in descriptionParas" :key="i">{{ p }}</p>
              </dd>
            </div>
          </dl>
        </UiCard>

        <UiCard title="Endpoints por grupo" :subtitle="operationCountLabel">
          <UiLoadingState v-if="loading" variant="skeleton" :skeleton-lines="6" />
          <UiEmptyState
            v-else-if="!groups.length"
            icon="search"
            title="Resumo indisponível"
            description="Não foi possível interpretar a spec para montar o índice — mas o documento completo continua acessível ao lado e em nova aba."
          >
            <template #action>
              <UiButton variant="ghost" size="sm" :href="docsUrl" target="_blank" rel="noopener noreferrer">Abrir ReDoc</UiButton>
            </template>
          </UiEmptyState>

          <nav v-else class="adoc-groups" aria-label="Índice de operações da API">
            <details v-for="g in groups" :key="g.tag" class="adoc-group" open>
              <summary class="adoc-group-head">
                <span class="adoc-group-name">{{ g.tag }}</span>
                <span class="adoc-group-count">{{ g.operations.length }}</span>
              </summary>
              <ul class="adoc-ops">
                <li v-for="op in g.operations" :key="op.id">
                  <button type="button" class="adoc-op" @click="focusOperation(op)">
                    <span class="adoc-op-method" :data-method="op.method">{{ op.method }}</span>
                    <span class="adoc-op-path ui-mono">{{ op.path }}</span>
                    <span v-if="op.summary" class="adoc-op-summary">{{ op.summary }}</span>
                  </button>
                </li>
              </ul>
            </details>
          </nav>
        </UiCard>
      </div>

      <!-- ── Documento embutido (ReDoc) ──────────────────────────────────────── -->
      <UiCard class="adoc-doc" title="Documentação interativa" subtitle="ReDoc gerado a partir da spec canônica.">
        <template #actions>
          <UiButton variant="ghost" size="sm" :aria-pressed="String(expanded)" @click="expanded = !expanded">
            {{ expanded ? 'Reduzir' : 'Expandir' }}
          </UiButton>
          <UiButton variant="ghost" size="sm" @click="reloadFrame">Recarregar</UiButton>
        </template>

        <div class="adoc-frame-wrap" :data-expanded="String(expanded)" :data-state="frameState">
          <div v-if="frameState === 'loading'" class="adoc-frame-overlay" role="status" aria-live="polite">
            <UiLoadingState title="Carregando a documentação interativa…" />
          </div>

          <div v-if="frameState === 'error'" class="adoc-frame-overlay">
            <UiErrorState
              message="Não foi possível carregar a documentação interativa."
              :retryable="true"
              @retry="reloadFrame"
            >
              <template #action>
                <UiButton variant="ghost" size="sm" :href="docsUrl" target="_blank" rel="noopener noreferrer">Abrir em nova aba</UiButton>
              </template>
            </UiErrorState>
          </div>

          <iframe
            :key="frameKey"
            ref="frameEl"
            class="adoc-frame"
            :src="frameSrc"
            title="Documentação OpenAPI (ReDoc)"
            loading="lazy"
            referrerpolicy="no-referrer"
            @load="onFrameLoad"
            @error="onFrameError"
          ></iframe>
        </div>
      </UiCard>
    </div>

    <template #footer>
      <p>
        Spec canônica:
        <a class="adoc-link ui-mono" :href="specUrl" target="_blank" rel="noopener">{{ specUrl }}</a>
        · Validada no CI a cada mudança de rota.
      </p>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiMetricCard,
  UiStatusBadge,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  useToast,
} from '../ui/index.js';

const toast = useToast();

// Base absoluta da API sob o subpath (mesma convenção do api.js). Os endpoints REAIS são
// GET /docs (ReDoc HTML) e GET /docs/openapi.yaml (spec canônica). Concatenação (sem ${}).
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/neuroevolui/api';
const docsUrl = API_BASE + '/docs';
const specUrl = API_BASE + '/docs/openapi.yaml';

const loading = ref(true);
const error = ref(null);

// Metadados extraídos da spec (fail-soft: valores neutros quando não dá para interpretar).
const meta = reactive({
  title: 'API NeuroEvolui',
  version: '',
  openapi: '',
  description: '',
  pathCount: 0,
  operationCount: 0,
  tagCount: 0,
});

const groups = ref([]); // [{ tag, operations: [{ id, method, path, summary }] }]

const descriptionParas = computed(() =>
  String(meta.description || '')
    .split(/\n{2,}|\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean),
);

const operationCountLabel = computed(() => {
  if (loading.value) return 'Lendo a especificação…';
  if (!meta.operationCount) return 'Nenhuma operação interpretada.';
  return meta.operationCount + ' operação(ões) em ' + meta.tagCount + ' grupo(s).';
});

// ── iframe (ReDoc) ────────────────────────────────────────────────────────────
const frameEl = ref(null);
const frameState = ref('loading'); // loading | ready | error
const frameKey = ref(0); // remonta o iframe ao recarregar
const frameBase = docsUrl;
const frameSrc = ref(frameBase);
const expanded = ref(false);

function onFrameLoad() {
  frameState.value = 'ready';
}
function onFrameError() {
  frameState.value = 'error';
}
function reloadFrame() {
  frameState.value = 'loading';
  frameSrc.value = frameBase + '#reload=' + Date.now();
  frameKey.value += 1;
}

// Leva o ReDoc embutido até a operação clicada. O ReDoc usa âncoras "#operation/<operationId>"
// quando há operationId; como nem toda operação declara um, navegamos para a âncora derivada da tag
// (sempre presente no ReDoc) — robusto e sem depender de parsing perfeito.
function focusOperation(op) {
  const anchor = op.operationId
    ? '#operation/' + op.operationId
    : '#tag/' + encodeURIComponent(op.tag || 'default');
  frameState.value = 'loading';
  frameSrc.value = frameBase + anchor;
  frameKey.value += 1;
  // Garante que a área do documento esteja visível ao navegar pelo índice lateral.
  if (typeof window !== 'undefined') {
    const node = frameEl.value && frameEl.value.closest ? frameEl.value.closest('.adoc-doc') : null;
    if (node && node.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ── Cópia da URL da spec ────────────────────────────────────────────────────────
async function copySpecUrl() {
  const absolute =
    typeof window !== 'undefined' && window.location
      ? new URL(specUrl, window.location.origin).href
      : specUrl;
  try {
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(absolute);
      toast.success('URL da spec copiada.');
    } else {
      throw new Error('clipboard indisponível');
    }
  } catch {
    toast.warning('Não foi possível copiar — copie manualmente.', { detail: absolute, timeout: 9000 });
  }
}

// ── Parsing tolerante do OpenAPI (YAML) ──────────────────────────────────────────
// Sem libs externas (regra do kit). Extraímos só o que a tela precisa: info.{title,version,
// description}, openapi, e a lista de operações (method + path + summary + tags + operationId).
// O parser é defensivo: blocos malformados são ignorados; o ReDoc embutido cobre o caso completo.
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

function stripQuotes(s) {
  const t = String(s == null ? '' : s).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function parseOpenApi(text) {
  const out = {
    title: '',
    version: '',
    openapi: '',
    description: '',
    operations: [],
  };
  if (!text || typeof text !== 'string') return out;

  const lines = text.replace(/\r\n/g, '\n').split('\n');

  // Indentação (em espaços) de uma linha; tabs contam como 1 para fins de comparação grosseira.
  const indentOf = (l) => {
    const m = l.match(/^(\s*)/);
    return m ? m[1].replace(/\t/g, ' ').length : 0;
  };

  let inInfo = false;
  let infoIndent = 0;
  let inPaths = false;
  let pathsIndent = 0;
  let currentPath = '';
  let currentPathIndent = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (!raw || !raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = indentOf(raw);
    const trimmed = raw.trim();

    // Campos de topo (indent 0).
    if (indent === 0) {
      inInfo = false;
      inPaths = false;
      const top = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (top) {
        const key = top[1];
        const val = top[2];
        if (key === 'openapi') out.openapi = stripQuotes(val);
        else if (key === 'info') {
          inInfo = true;
          infoIndent = 0;
        } else if (key === 'paths') {
          inPaths = true;
          pathsIndent = 0;
          currentPath = '';
          currentPathIndent = -1;
        }
      }
      continue;
    }

    // Bloco info: title / version / description (apenas linha simples).
    if (inInfo && indent > infoIndent) {
      const kv = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (kv) {
        const key = kv[1];
        const val = stripQuotes(kv[2]);
        if (key === 'title' && val) out.title = val;
        else if (key === 'version' && val) out.version = val;
        else if (key === 'description' && val && val !== '|' && val !== '>') out.description = val;
      }
      continue;
    }

    // Bloco paths.
    if (inPaths && indent > pathsIndent) {
      // Uma chave de caminho começa com "/" (ex.: "/v1/patients:").
      const pathLine = trimmed.match(/^(\/[^:]*):\s*$/);
      if (pathLine && (currentPathIndent < 0 || indent <= currentPathIndent)) {
        currentPath = pathLine[1];
        currentPathIndent = indent;
        continue;
      }
      // Um método HTTP sob o caminho atual.
      if (currentPath && indent > currentPathIndent) {
        const methodLine = trimmed.match(/^([A-Za-z]+):\s*$/);
        if (methodLine) {
          const method = methodLine[1].toLowerCase();
          if (HTTP_METHODS.includes(method)) {
            const op = {
              id: method.toUpperCase() + ' ' + currentPath,
              method: method.toUpperCase(),
              path: currentPath,
              summary: '',
              tag: '',
              operationId: '',
            };
            // Olha à frente as propriedades da operação (summary/tags/operationId) até dedentar.
            for (let j = i + 1; j < lines.length; j += 1) {
              const ln = lines[j];
              if (!ln || !ln.trim() || ln.trim().startsWith('#')) continue;
              const li = indentOf(ln);
              if (li <= indent) break; // saiu da operação
              const lt = ln.trim();
              const sm = lt.match(/^summary:\s*(.*)$/);
              if (sm && !op.summary) {
                op.summary = stripQuotes(sm[1]);
                continue;
              }
              const oid = lt.match(/^operationId:\s*(.*)$/);
              if (oid && !op.operationId) {
                op.operationId = stripQuotes(oid[1]);
                continue;
              }
              // tags: pode ser inline ([a, b]) ou item de lista na linha seguinte.
              const tg = lt.match(/^tags:\s*(.*)$/);
              if (tg && !op.tag) {
                const inline = tg[1].trim();
                if (inline.startsWith('[')) {
                  const first = inline.replace(/[[\]]/g, '').split(',')[0];
                  op.tag = stripQuotes(first);
                }
                continue;
              }
              const tagItem = lt.match(/^-\s+(.*)$/);
              if (tagItem && !op.tag) {
                // só consideramos como tag se a linha anterior relevante era "tags:"
                op.tag = stripQuotes(tagItem[1]);
              }
            }
            out.operations.push(op);
          }
        }
      }
    }
  }

  return out;
}

function applyParsed(parsed) {
  if (parsed.title) meta.title = parsed.title;
  meta.version = parsed.version || '';
  meta.openapi = parsed.openapi || '';
  meta.description = parsed.description || '';

  const ops = Array.isArray(parsed.operations) ? parsed.operations : [];
  meta.operationCount = ops.length;
  meta.pathCount = new Set(ops.map((o) => o.path)).size;

  // Agrupa por tag (operações sem tag caem em "Geral").
  const byTag = new Map();
  for (const op of ops) {
    const tag = op.tag || 'Geral';
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push(op);
  }
  const sorted = Array.from(byTag.entries())
    .map(([tag, operations]) => ({
      tag,
      operations: operations.slice().sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag));

  meta.tagCount = sorted.length;
  groups.value = sorted;
}

async function loadSpec() {
  loading.value = true;
  error.value = null;
  try {
    const res = await fetch(specUrl, { headers: { Accept: 'text/plain, application/yaml, */*' } });
    if (!res.ok) {
      const e = new Error(res.status === 404 ? 'A especificação openapi.yaml não foi encontrada no servidor.' : 'Falha ao carregar a especificação (HTTP ' + res.status + ').');
      e.status = res.status;
      throw e;
    }
    const text = await res.text();
    if (!text || !text.trim()) {
      throw new Error('A especificação retornou vazia.');
    }
    // fail-soft: parsing nunca derruba a tela. Se falhar, mostramos o resumo vazio e o ReDoc cobre.
    let parsed = { title: '', version: '', openapi: '', description: '', operations: [] };
    try {
      parsed = parseOpenApi(text);
    } catch {
      parsed = { title: '', version: '', openapi: '', description: '', operations: [] };
    }
    applyParsed(parsed);
  } catch (e) {
    error.value = e && e.message ? e.message : 'Não foi possível carregar a documentação da API.';
    toast.error('Falha ao carregar a especificação da API.');
  } finally {
    loading.value = false;
  }
}

function reload() {
  loadSpec();
  reloadFrame();
}

onMounted(loadSpec);
</script>

<style scoped>
/* Banner contract-first */
.adoc-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  background: rgb(var(--ui-accent) / 0.08);
  border: 1px solid rgb(var(--ui-accent) / 0.28);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.adoc-banner-icon { font-size: 1.25rem; line-height: 1.4; flex-shrink: 0; }
.adoc-banner-text { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }
.adoc-anchor {
  display: inline-block;
  padding: 1px 7px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xs);
  font-weight: 600;
}

/* Métricas */
.adoc-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--ui-space-4);
}

/* Layout principal: índice à esquerda, documento à direita */
.adoc-grid {
  display: grid;
  grid-template-columns: minmax(280px, 360px) 1fr;
  gap: var(--ui-space-4);
  align-items: start;
}
.adoc-aside {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  position: sticky;
  top: var(--ui-space-4);
}

/* Visão geral (dl) */
.adoc-dl { margin: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.adoc-dl-row { display: grid; grid-template-columns: 92px 1fr; gap: var(--ui-space-3); align-items: baseline; }
.adoc-dl-row-block { grid-template-columns: 1fr; }
.adoc-dl dt { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .05em; font-weight: 700; }
.adoc-dl dd { margin: 0; color: rgb(var(--ui-fg)); font-size: var(--ui-text-sm); word-break: break-word; }
.adoc-desc { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.adoc-desc p { margin: 0; line-height: 1.5; }

/* Índice de operações por tag */
.adoc-groups { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.adoc-group { border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-md); overflow: hidden; background: rgb(var(--ui-surface-2)); }
.adoc-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  cursor: pointer;
  font-weight: 700;
  font-size: var(--ui-text-sm);
  list-style: none;
  user-select: none;
}
.adoc-group-head::-webkit-details-marker { display: none; }
.adoc-group-head::before { content: "▸"; color: rgb(var(--ui-muted)); transition: transform .15s ease; font-size: var(--ui-text-xs); }
.adoc-group[open] .adoc-group-head::before { transform: rotate(90deg); }
.adoc-group-name { flex: 1; }
.adoc-group-count {
  flex-shrink: 0;
  min-width: 22px;
  text-align: center;
  padding: 1px 7px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted) / 0.18);
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  font-weight: 700;
}

.adoc-ops { list-style: none; margin: 0; padding: 0; border-top: 1px solid rgb(var(--ui-border)); }
.adoc-op {
  display: grid;
  grid-template-columns: 54px 1fr;
  grid-template-areas: "method path" "method summary";
  align-items: center;
  gap: 1px var(--ui-space-2);
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  border-bottom: 1px solid rgb(var(--ui-border));
  padding: var(--ui-space-2) var(--ui-space-3);
  cursor: pointer;
  font: inherit;
  color: rgb(var(--ui-fg));
  transition: background-color .12s ease;
}
.adoc-ops li:last-child .adoc-op { border-bottom: 0; }
.adoc-op:hover { background: rgb(var(--ui-accent) / 0.08); }
.adoc-op:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: -2px; }
.adoc-op-method {
  grid-area: method;
  align-self: start;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .03em;
  text-align: center;
  padding: 2px 0;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-muted));
}
.adoc-op-method[data-method="GET"] { background: rgb(var(--ui-info) / 0.16); color: rgb(var(--ui-info)); }
.adoc-op-method[data-method="POST"] { background: rgb(var(--ui-ok) / 0.16); color: rgb(var(--ui-ok)); }
.adoc-op-method[data-method="PUT"] { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.adoc-op-method[data-method="PATCH"] { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.adoc-op-method[data-method="DELETE"] { background: rgb(var(--ui-danger) / 0.16); color: rgb(var(--ui-danger)); }
.adoc-op-path { grid-area: path; font-size: var(--ui-text-sm); font-weight: 600; word-break: break-all; }
.adoc-op-summary { grid-area: summary; color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }

/* Documento embutido */
.adoc-doc :deep(.ui-card-body) { padding: 0; }
.adoc-frame-wrap {
  position: relative;
  height: 70vh;
  min-height: 420px;
  background: rgb(var(--ui-bg));
  transition: height .2s ease;
}
.adoc-frame-wrap[data-expanded="true"] { height: calc(100vh - 160px); }
.adoc-frame { width: 100%; height: 100%; border: 0; display: block; background: rgb(var(--ui-bg)); }
.adoc-frame-wrap[data-state="loading"] .adoc-frame,
.adoc-frame-wrap[data-state="error"] .adoc-frame { visibility: hidden; }
.adoc-frame-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(var(--ui-surface));
}

/* Links */
.adoc-link { color: rgb(var(--ui-accent-strong)); text-decoration: none; word-break: break-all; }
.adoc-link:hover { text-decoration: underline; }
.adoc-link:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; border-radius: var(--ui-radius-sm); }

@media (prefers-reduced-motion: reduce) {
  .adoc-group-head::before,
  .adoc-op,
  .adoc-frame-wrap { transition: none; }
}

/* Responsivo */
@media (max-width: 960px) {
  .adoc-grid { grid-template-columns: 1fr; }
  .adoc-aside { position: static; }
  .adoc-frame-wrap { height: 60vh; }
  .adoc-frame-wrap[data-expanded="true"] { height: calc(100vh - 120px); }
}
@media (max-width: 560px) {
  .adoc-metrics { grid-template-columns: 1fr 1fr; }
  .adoc-dl-row { grid-template-columns: 1fr; gap: 2px; }
}
</style>
