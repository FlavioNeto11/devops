<template>
  <UiPageLayout
    eyebrow="RAG · Base de conhecimento"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="wide"
    :loading="loading"
    :error="errorDisplay"
    @retry="load"
  >
    <!-- AÇÕES DO CABEÇALHO -->
    <template #actions>
      <UiButton variant="ghost" to="/knowledge-sources">Voltar</UiButton>
      <UiButton
        v-if="!is404"
        variant="subtle"
        :to="`/knowledge-sources/${props.id}/edit`"
        :disabled="loading"
      >Editar</UiButton>
      <UiButton
        v-if="!is404"
        variant="subtle"
        :loading="reindexing"
        :aria-busy="reindexing"
        :disabled="loading"
        @click="triggerReindex"
      >Reindexar</UiButton>
    </template>

    <!-- BANNER: fonte sem documentos indexados -->
    <template #banner>
      <div
        v-if="isLoaded && documentCount === 0"
        class="ksd-banner ksd-banner-warn"
        role="status"
      >
        <span class="ksd-banner-dot" aria-hidden="true" />
        <span>
          Esta fonte ainda não tem <strong>documentos indexados</strong>. Use o botão
          <strong>Reindexar</strong> para processar o conteúdo e torná-lo disponível para o assistente.
        </span>
      </div>
    </template>

    <!-- ESTADO 404: fonte não encontrada -->
    <div v-if="!loading && is404" class="ksd-not-found">
      <UiEmptyState
        title="Fonte não encontrada"
        description="Esta fonte de conhecimento não existe ou foi removida da base de conhecimento."
        icon="database"
      >
        <template #action>
          <UiButton variant="primary" to="/knowledge-sources">Voltar à lista</UiButton>
        </template>
      </UiEmptyState>
    </div>

    <!-- CONTEÚDO NORMAL -->
    <template v-else-if="isLoaded">

      <!-- MÉTRICAS DE DESTAQUE -->
      <section class="ksd-metrics" aria-label="Resumo da fonte">
        <UiMetricCard
          label="Documentos indexados"
          :value="format.formatNumber(documentCount)"
          :tone="documentCount > 0 ? 'success' : 'warning'"
          hint="Número de documentos indexados nesta fonte"
        />
        <UiMetricCard
          label="Tipo"
          :value="source.source_type || '—'"
          tone="neutral"
          hint="Tipo de fonte de conhecimento"
        />
        <UiMetricCard
          label="Status"
          :value="source.active ? 'Ativa' : 'Inativa'"
          :tone="source.active ? 'success' : 'neutral'"
          hint="Indica se esta fonte está ativa no sistema"
        />
        <UiMetricCard
          label="Indexado em"
          :value="formatIndexedAt(source.indexed_at)"
          tone="neutral"
          hint="Última vez que a fonte foi processada"
        />
      </section>

      <!-- LAYOUT DE DOIS PAINÉIS -->
      <div class="ksd-grid">

        <!-- PAINEL ESQUERDO: identificação da fonte -->
        <div class="ksd-main">
          <UiCard
            title="Identificação da fonte"
            subtitle="Metadados e configuração da fonte de conhecimento."
          >
            <template #actions>
              <UiStatusBadge
                :status="source.active ? 'active' : 'inactive'"
                :tone="source.active ? 'success' : 'neutral'"
                :label="source.active ? 'Ativa' : 'Inativa'"
                with-dot
              />
            </template>

            <dl class="ksd-kv ksd-kv-2">
              <div>
                <dt>Nome</dt>
                <dd class="ksd-name-val">{{ display(source.name) }}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>
                  <span v-if="source.source_type" class="ksd-type-pill">{{ source.source_type }}</span>
                  <span v-else class="ksd-muted">não definido</span>
                </dd>
              </div>
              <div class="ksd-kv-full">
                <dt>Descrição</dt>
                <dd>{{ display(source.description) }}</dd>
              </div>
              <div class="ksd-kv-full">
                <dt>URL</dt>
                <dd>
                  <a
                    v-if="source.url"
                    :href="source.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="ksd-url-link"
                  >{{ source.url }}</a>
                  <span v-else class="ksd-muted">não informada</span>
                </dd>
              </div>
              <div>
                <dt>Documentos indexados</dt>
                <dd class="ksd-count-val">
                  {{ format.formatNumber(documentCount) }}
                  <span class="ksd-count-hint">documentos</span>
                </dd>
              </div>
              <div>
                <dt>Indexado em</dt>
                <dd>{{ formatIndexedAt(source.indexed_at) }}</dd>
              </div>
            </dl>
          </UiCard>
        </div>

        <!-- PAINEL DIREITO: ação de reindexação -->
        <aside class="ksd-side">
          <UiCard title="Reindexação" subtitle="Reprocessa os documentos desta fonte.">
            <div class="ksd-reindex-body">
              <p class="ksd-reindex-desc">
                Aciona o reprocessamento desta fonte e atualiza os documentos disponíveis
                para o assistente via RAG.
              </p>

              <div class="ksd-reindex-status" aria-live="polite">
                <div class="ksd-reindex-row">
                  <span class="ksd-reindex-label">Última indexação</span>
                  <span class="ksd-reindex-val">{{ formatIndexedAt(source.indexed_at) }}</span>
                </div>
                <div class="ksd-reindex-row">
                  <span class="ksd-reindex-label">Documentos</span>
                  <span class="ksd-reindex-val ksd-count-num">
                    {{ format.formatNumber(documentCount) }}
                  </span>
                </div>
                <div class="ksd-reindex-row">
                  <span class="ksd-reindex-label">Status</span>
                  <UiStatusBadge
                    :status="source.active ? 'active' : 'inactive'"
                    :tone="source.active ? 'success' : 'neutral'"
                    :label="source.active ? 'Ativa' : 'Inativa'"
                    with-dot
                  />
                </div>
              </div>
            </div>

            <template #footer>
              <UiButton
                variant="primary"
                :loading="reindexing"
                :aria-busy="reindexing"
                :disabled="loading"
                block
                @click="triggerReindex"
              >
                Reindexar
              </UiButton>
            </template>
          </UiCard>
        </aside>
      </div>
    </template>

    <template #footer>
      <span>Fonte de conhecimento — {{ display(source.name || String(props.id)) }}</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiEmptyState,
  UiButton,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import { knowledgeSources } from '../api.js';

// ── Props ────────────────────────────────────────────────────────────────────
const props = defineProps({ id: { type: [String, Number], required: true } });

// ── Composables ──────────────────────────────────────────────────────────────
const toast = useToast();
const confirmAsk = useConfirm();

// ── Estado principal ─────────────────────────────────────────────────────────
const loading = ref(true);
const error = ref(null);
const source = ref({});
const reindexing = ref(false);

// ── Derivados ─────────────────────────────────────────────────────────────────
const documentCount = computed(() => Number(source.value.document_count) || 0);
const isLoaded = computed(() => !loading.value && !error.value && Object.keys(source.value).length > 0);
const is404 = computed(() => error.value?.status === 404);

// Cabeçalho da página
const pageTitle = computed(() => {
  if (loading.value) return 'Carregando fonte…';
  if (is404.value) return 'Fonte não encontrada';
  return source.value.name || 'Fonte #' + String(props.id);
});
const pageSubtitle = computed(() => {
  if (loading.value) return 'Detalhe da fonte de conhecimento.';
  if (is404.value) return 'A fonte solicitada não foi encontrada.';
  if (!isLoaded.value) return 'Detalhe da fonte de conhecimento.';
  const parts = [];
  if (source.value.source_type) parts.push(source.value.source_type);
  if (source.value.active !== undefined) parts.push(source.value.active ? 'Ativa' : 'Inativa');
  if (documentCount.value > 0) parts.push(format.formatNumber(documentCount.value) + ' documentos');
  return parts.length ? parts.join(' · ') : 'Detalhe da fonte de conhecimento.';
});

// Erros genéricos para UiPageLayout (404 é tratado inline com UiEmptyState)
const errorDisplay = computed(() => {
  if (!error.value || is404.value) return null;
  return error.value.message || 'Não foi possível carregar a fonte.';
});

// ── Utilitários ───────────────────────────────────────────────────────────────
const display = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

function formatIndexedAt(val) {
  if (!val) return '—';
  return format.formatDateTime(val);
}

// ── Carregamento ──────────────────────────────────────────────────────────────
// GET /v1/knowledge-sources/:id com fallback para lista quando o backend não honra /:id.
function unwrap(res) {
  if (!res || typeof res !== 'object') return null;
  if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) return res.data;
  return res;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    let found = null;
    // 1) GET /v1/knowledge-sources/:id — caminho direto
    try {
      const direct = unwrap(await knowledgeSources.get(props.id));
      if (direct && direct.name !== undefined) found = direct;
    } catch {
      found = null;
    }
    // 2) Fallback: lista paginada + busca pelo id
    if (!found) {
      const res = await knowledgeSources.list({ pageSize: 200 });
      const rows = Array.isArray(res) ? res : res && Array.isArray(res.data) ? res.data : [];
      found = rows.find((s) => String(s.id) === String(props.id)) || null;
    }
    if (!found) {
      const e = new Error('Fonte #' + props.id + ' não encontrada na base de conhecimento.');
      e.status = 404;
      throw e;
    }
    source.value = found;
  } catch (e) {
    error.value = e;
    source.value = {};
  } finally {
    loading.value = false;
  }
}

// ── Reindexação ───────────────────────────────────────────────────────────────
// POST /v1/knowledge-sources/:id/reindex — reprocessa documentos e atualiza indexed_at.
async function triggerReindex() {
  if (reindexing.value || loading.value) return;
  const ok = await confirmAsk({
    title: 'Reindexar esta fonte?',
    message:
      'O conteúdo de "' +
      (source.value.name || display(props.id)) +
      '" será reprocessado agora. Os documentos indexados serão atualizados.',
    confirmLabel: 'Reindexar',
    danger: false,
  });
  if (!ok) return;
  reindexing.value = true;
  try {
    await knowledgeSources.reindex(props.id);
    toast.success('Fonte "' + (source.value.name || display(props.id)) + '" reindexada com sucesso.');
    await load();
  } catch (e) {
    toast.error('Falha ao reindexar: ' + (e && e.message ? e.message : 'erro desconhecido'));
  } finally {
    reindexing.value = false;
  }
}

// ── Ciclo de vida ─────────────────────────────────────────────────────────────
watch(() => props.id, () => load());
onMounted(load);
</script>

<style scoped>
/* ── Métricas de destaque ─────────────────────────────────────────────────── */
.ksd-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* ── Layout principal: conteúdo + sidebar ─────────────────────────────────── */
.ksd-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--ui-space-4);
  align-items: start;
}

.ksd-main {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}

.ksd-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}

/* ── Estado 404 ───────────────────────────────────────────────────────────── */
.ksd-not-found {
  display: flex;
  justify-content: center;
  padding: var(--ui-space-10) var(--ui-space-4);
}

/* ── Bloco dl/dt/dd (campos de detalhe) ───────────────────────────────────── */
.ksd-kv {
  display: grid;
  gap: var(--ui-space-4);
  margin: 0;
}

.ksd-kv-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.ksd-kv-1 {
  grid-template-columns: minmax(0, 1fr);
}

/* Campos que ocupam a largura total no grid de 2 colunas */
.ksd-kv-2 .ksd-kv-full {
  grid-column: 1 / -1;
}

.ksd-kv > div {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  min-width: 0;
}

.ksd-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}

.ksd-kv dd {
  margin: 0;
  font-size: var(--ui-text-md);
  word-break: break-word;
  color: rgb(var(--ui-fg));
}

/* ── Tipografia específica ────────────────────────────────────────────────── */
.ksd-name-val {
  font-weight: 600;
  font-size: var(--ui-text-lg);
}

.ksd-muted {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  font-style: italic;
}

.ksd-type-pill {
  display: inline-flex;
  align-items: center;
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  color: rgb(var(--ui-fg));
}

.ksd-url-link {
  color: rgb(var(--ui-accent));
  text-decoration: underline;
  word-break: break-all;
  font-size: var(--ui-text-sm);
}

.ksd-url-link:hover {
  opacity: 0.8;
}

.ksd-count-val {
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-2);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: var(--ui-text-md);
}

.ksd-count-num {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.ksd-count-hint {
  font-size: var(--ui-text-xs);
  font-weight: 400;
  color: rgb(var(--ui-muted));
}

/* ── Banner de aviso ──────────────────────────────────────────────────────── */
.ksd-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border));
}

.ksd-banner-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: rgb(var(--ui-muted));
}

.ksd-banner-warn {
  border-color: rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.08);
}

.ksd-banner-warn .ksd-banner-dot {
  background: rgb(var(--ui-warn));
}

/* ── Painel de reindexação ───────────────────────────────────────────────── */
.ksd-reindex-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.ksd-reindex-desc {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  line-height: 1.5;
}

.ksd-reindex-status {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}

.ksd-reindex-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  min-width: 0;
}

.ksd-reindex-label {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
  color: rgb(var(--ui-muted));
  flex-shrink: 0;
}

.ksd-reindex-val {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  text-align: right;
  word-break: break-word;
  min-width: 0;
}

/* ── Responsivo ──────────────────────────────────────────────────────────── */
@media (max-width: 1100px) {
  .ksd-grid {
    grid-template-columns: minmax(0, 1fr) 280px;
  }
}

@media (max-width: 860px) {
  .ksd-metrics {
    grid-template-columns: repeat(2, 1fr);
  }

  .ksd-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .ksd-side {
    order: 1;
  }

  .ksd-kv-2 {
    grid-template-columns: minmax(0, 1fr);
  }

  .ksd-kv-2 .ksd-kv-full {
    grid-column: 1;
  }
}

@media (max-width: 480px) {
  .ksd-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
