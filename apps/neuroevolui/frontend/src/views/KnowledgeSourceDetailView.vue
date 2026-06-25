<template>
  <UiPageLayout
    eyebrow="RAG · Base de conhecimento"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="wide"
    :loading="loading"
    :error="pageError"
    @retry="load"
  >
    <!-- AÇÕES DO CABEÇALHO -->
    <template #actions>
      <UiButton variant="ghost" to="/knowledge-sources">Voltar</UiButton>
      <UiButton
        variant="subtle"
        :loading="reindexing"
        :aria-busy="reindexing"
        :disabled="loading || !!pageError"
        @click="triggerReindex"
      >Reindexar agora</UiButton>
    </template>

    <!-- BANNER: fonte vazia (sem trechos indexados) -->
    <template #banner>
      <div
        v-if="!loading && !pageError && isIndexed && chunkCount === 0"
        class="ksd-banner ksd-banner-warn"
        role="status"
      >
        <span class="ksd-banner-dot" aria-hidden="true" />
        <span>Esta fonte ainda não tem <strong>trechos indexados</strong>. Use o botão
          <strong>Reindexar agora</strong> para processar o conteúdo.</span>
      </div>
    </template>

    <!-- MÉTRICAS DE DESTAQUE -->
    <section class="ksd-metrics" aria-label="Resumo da fonte">
      <UiMetricCard
        label="Trechos indexados"
        :value="loading ? null : format.formatNumber(chunkCount)"
        :loading="loading"
        :tone="chunkTone"
        hint="Número de fragmentos vetorizados desta fonte"
      />
      <UiMetricCard
        label="Modelo de embedding"
        :value="loading ? null : (source.embedding_model || '—')"
        :loading="loading"
        tone="neutral"
        hint="Modelo usado na vetorização dos trechos"
      />
      <UiMetricCard
        label="Indexado em"
        :value="loading ? null : format.formatDateTime(source.ingested_at)"
        :loading="loading"
        tone="neutral"
        hint="Última vez que a fonte foi processada"
      />
      <UiMetricCard
        label="Estado"
        :value="loading ? null : indexStateLabel"
        :loading="loading"
        :tone="indexStateTone"
        hint="Situação do índice vetorial desta fonte"
      />
    </section>

    <!-- LAYOUT DE DOIS PAINÉIS -->
    <div class="ksd-grid">

      <!-- PAINEL ESQUERDO: cabeçalho da fonte + conteúdo indexado -->
      <div class="ksd-main">

        <!-- SourceHeader: identificação e metadados principais -->
        <UiCard
          title="Identificação da fonte"
          subtitle="Título, ID de origem e situação do índice."
        >
          <template #actions>
            <UiStatusBadge
              :status="indexStatus"
              :tone="indexStateTone"
              :label="indexStateLabel"
              with-dot
            />
          </template>

          <dl class="ksd-kv ksd-kv-2">
            <div>
              <dt>Título</dt>
              <dd class="ksd-title-val">{{ display(source.title) }}</dd>
            </div>
            <div>
              <dt>ID de origem</dt>
              <dd class="ksd-mono">{{ display(source.source_id) }}</dd>
            </div>
            <div>
              <dt>Modelo de embedding</dt>
              <dd>
                <span v-if="source.embedding_model" class="ksd-model-pill">{{ source.embedding_model }}</span>
                <span v-else class="ksd-muted">não definido</span>
              </dd>
            </div>
            <div>
              <dt>Trechos</dt>
              <dd class="ksd-chunks-val">
                {{ loading ? '…' : format.formatNumber(chunkCount) }}
                <span class="ksd-chunks-hint">fragmentos vetorizados</span>
              </dd>
            </div>
            <div>
              <dt>Hash do conteúdo</dt>
              <dd class="ksd-mono ksd-hash">{{ display(source.content_hash) }}</dd>
            </div>
            <div>
              <dt>Indexado em</dt>
              <dd>{{ format.formatDateTime(source.ingested_at) }}</dd>
            </div>
            <div>
              <dt>Criado em</dt>
              <dd>{{ format.formatDateTime(source.created_at) }}</dd>
            </div>
          </dl>
        </UiCard>

        <!-- ContentPreview: texto indexado -->
        <UiCard
          title="Conteúdo indexado"
          subtitle="Texto bruto desta fonte que alimenta o assistente nas citações."
        >
          <template #actions>
            <span class="ksd-content-len" aria-label="Tamanho do conteúdo">
              {{ contentSizeLabel }}
            </span>
          </template>

          <!-- Sem conteúdo -->
          <div v-if="!loading && !source.content" class="ksd-preview-empty">
            <UiEmptyState
              title="Conteúdo não disponível"
              description="O texto desta fonte não foi retornado pela API. Reindexe a fonte para forçar o reprocessamento."
              icon="database"
            >
              <template #action>
                <UiButton variant="subtle" :loading="reindexing" :aria-busy="reindexing" @click="triggerReindex">
                  Reindexar agora
                </UiButton>
              </template>
            </UiEmptyState>
          </div>

          <!-- Preview do conteúdo -->
          <div v-else class="ksd-content-wrap">
            <div class="ksd-content-preview" aria-label="Prévia do conteúdo indexado">
              <pre class="ksd-content-text">{{ contentPreview }}</pre>
            </div>
            <div v-if="isTruncated" class="ksd-content-truncated" role="note">
              <span class="ksd-muted">
                Exibindo os primeiros {{ MAX_PREVIEW_CHARS.toLocaleString('pt-BR') }} caracteres
                de {{ format.formatNumber(source.content.length) }} no total.
              </span>
            </div>
          </div>
        </UiCard>

      </div>

      <!-- PAINEL DIREITO: MetadataPanel + ReindexButton -->
      <aside class="ksd-side">

        <!-- ReindexButton: ação de reindexação + estado atual -->
        <UiCard title="Reindexação" subtitle="Reprocessa o conteúdo desta fonte agora.">
          <div class="ksd-reindex-body">
            <p class="ksd-reindex-desc">
              O motor de RAG rechunka e re-embedda o conteúdo completo. O campo
              <strong>Indexado em</strong> e o <strong>hash</strong> são atualizados
              com os valores reais gerados pelo servidor.
            </p>

            <div class="ksd-reindex-status" aria-live="polite">
              <div class="ksd-reindex-row">
                <span class="ksd-reindex-label">Última indexação</span>
                <span class="ksd-reindex-val">{{ format.formatDateTime(source.ingested_at) }}</span>
              </div>
              <div class="ksd-reindex-row">
                <span class="ksd-reindex-label">Trechos atuais</span>
                <span class="ksd-reindex-val ksd-chunks-num">
                  {{ loading ? '…' : format.formatNumber(chunkCount) }}
                </span>
              </div>
              <div class="ksd-reindex-row">
                <span class="ksd-reindex-label">Estado</span>
                <UiStatusBadge
                  :status="indexStatus"
                  :tone="indexStateTone"
                  :label="indexStateLabel"
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
              :disabled="loading || !!pageError"
              block
              @click="triggerReindex"
            >
              Reindexar agora
            </UiButton>
          </template>
        </UiCard>

        <!-- Hash do conteúdo: único campo exclusivo da sidebar (não repetido no painel esquerdo com destaque) -->
        <UiCard title="Hash do conteúdo" subtitle="Identificador único do conteúdo indexado.">
          <div class="ksd-hash-panel">
            <code class="ksd-mono ksd-hash ksd-hash-block" aria-label="Hash do conteúdo">{{ display(source.content_hash) }}</code>
            <UiButton
              v-if="source.content_hash"
              variant="ghost"
              size="sm"
              :disabled="loading"
              @click="copyHash"
            >{{ hashCopied ? 'Copiado!' : 'Copiar hash' }}</UiButton>
          </div>
        </UiCard>

      </aside>
    </div>

    <template #footer>
      <span>Fonte de conhecimento — ID: {{ display(source.source_id || id) }}</span>
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
const hashCopied = ref(false);

// Limite de preview do conteúdo: exibe os primeiros N chars para não travar a tela.
const MAX_PREVIEW_CHARS = 4000;

// ── Derivados ─────────────────────────────────────────────────────────────────
const chunkCount = computed(() => Number(source.value.chunk_count) || 0);
const isIndexed = computed(() => !loading.value && !error.value && !!source.value.source_id);

// Tones e labels do estado de indexação (semânticos, não apenas por cor)
const indexStatus = computed(() => (chunkCount.value > 0 ? 'active' : 'pending'));
const indexStateLabel = computed(() => (chunkCount.value > 0 ? 'Indexada' : 'Vazia'));
const indexStateTone = computed(() => (chunkCount.value > 0 ? 'success' : 'warning'));
const chunkTone = computed(() => (chunkCount.value > 0 ? 'success' : 'warning'));

// Cabeçalho da página
const pageTitle = computed(() => {
  if (loading.value) return 'Carregando fonte…';
  return source.value.title || 'Fonte #' + String(props.id);
});
const pageSubtitle = computed(() => {
  if (loading.value || !source.value.source_id) return 'Detalhe da fonte de conhecimento.';
  const parts = [];
  if (source.value.source_id) parts.push('ID: ' + source.value.source_id);
  if (source.value.embedding_model) parts.push(source.value.embedding_model);
  if (chunkCount.value > 0) parts.push(format.formatNumber(chunkCount.value) + ' trechos');
  return parts.length ? parts.join(' · ') : 'Detalhe da fonte de conhecimento.';
});

// Erro convertido para string para o UiPageLayout
const pageError = computed(() => (error.value ? (error.value.message || 'Não foi possível carregar a fonte.') : null));

// Preview do conteúdo
const contentPreview = computed(() => {
  const c = source.value.content || '';
  return c.length > MAX_PREVIEW_CHARS ? c.slice(0, MAX_PREVIEW_CHARS) : c;
});
const isTruncated = computed(() => (source.value.content || '').length > MAX_PREVIEW_CHARS);

const contentSizeLabel = computed(() => {
  const n = (source.value.content || '').length;
  if (!n) return '';
  if (n < 1000) return n + ' chars';
  return (n / 1000).toFixed(1) + ' k chars';
});

// ── Utilitários ───────────────────────────────────────────────────────────────
const display = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

// ── Carregamento ──────────────────────────────────────────────────────────────
// GET /v1/knowledge-sources/:id — busca direta pelo id.
// Fallback para a lista caso o backend não honre a rota /:id (mesma estratégia do ConsultationDetailView).
function unwrap(res) {
  if (!res || typeof res !== 'object') return null;
  // { data: {...} } (objeto singular) → desembrulha
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
      if (direct && (direct.source_id !== undefined || direct.title !== undefined)) found = direct;
    } catch {
      found = null; // sem rota /:id → cai para a lista
    }
    // 2) Fallback: lista paginada + busca pelo id
    if (!found) {
      const res = await knowledgeSources.list({ pageSize: 200 });
      const rows = Array.isArray(res) ? res : res && Array.isArray(res.data) ? res.data : [];
      found =
        rows.find((s) => String(s.id) === String(props.id) || String(s.source_id) === String(props.id)) ||
        null;
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
// POST /v1/knowledge-sources/:id/reindex — ação destrutiva no sentido que reprocessa
// o conteúdo e sobrescreve chunk_count, ingested_at e content_hash no servidor.
// Pede confirmação antes de disparar (operação irreversível para o estado atual do índice).
async function triggerReindex() {
  if (reindexing.value || loading.value) return;

  const ok = await confirmAsk({
    title: 'Reindexar esta fonte?',
    message:
      'O conteúdo de "' +
      (source.value.title || display(props.id)) +
      '" será rechunkado e re-embeddado agora. O hash, o número de trechos e a data de indexação serão atualizados com os valores do novo processamento.',
    confirmLabel: 'Reindexar',
    danger: false,
  });
  if (!ok) return;

  reindexing.value = true;
  try {
    // Usa o source_id como chave primária para a API (o backend usa esse campo como PK no RAG)
    const key = source.value.source_id || props.id;
    await knowledgeSources.reindex(key);
    toast.success('Fonte "' + (source.value.title || display(key)) + '" reindexada com sucesso.');
    // Recarrega para refletir o novo ingested_at, chunk_count e content_hash
    await load();
  } catch (e) {
    toast.error('Falha ao reindexar: ' + (e && e.message ? e.message : 'erro desconhecido'));
  } finally {
    reindexing.value = false;
  }
}

// ── Copiar hash ───────────────────────────────────────────────────────────────
async function copyHash() {
  const h = source.value.content_hash;
  if (!h) return;
  try {
    await navigator.clipboard.writeText(h);
    hashCopied.value = true;
    setTimeout(() => { hashCopied.value = false; }, 2000);
  } catch {
    toast.error('Não foi possível copiar o hash.');
  }
}

// ── Ciclo de vida ─────────────────────────────────────────────────────────────
watch(
  () => props.id,
  () => load()
);
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
.ksd-title-val {
  font-weight: 600;
  font-size: var(--ui-text-lg);
}

.ksd-mono {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-sm);
}

.ksd-hash {
  word-break: break-all;
  font-size: var(--ui-text-xs);
  opacity: 0.75;
}

.ksd-model-pill {
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

.ksd-muted {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  font-style: italic;
}

.ksd-chunks-val {
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-2);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: var(--ui-text-md);
}

.ksd-chunks-num {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}

.ksd-chunks-hint {
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

/* ── Preview do conteúdo indexado ─────────────────────────────────────────── */
.ksd-content-len {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}

.ksd-preview-empty {
  display: flex;
  justify-content: center;
  padding: var(--ui-space-4) 0;
}

.ksd-content-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.ksd-content-preview {
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  overflow: auto;
  max-height: 420px;
}

.ksd-content-text {
  margin: 0;
  padding: var(--ui-space-4);
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  line-height: 1.6;
  color: rgb(var(--ui-fg));
  white-space: pre-wrap;
  word-break: break-word;
}

.ksd-content-truncated {
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  font-size: var(--ui-text-xs);
}

/* ── Painel de hash (sidebar) ────────────────────────────────────────────── */
.ksd-hash-panel {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.ksd-hash-block {
  display: block;
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  word-break: break-all;
  user-select: all;
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
    /* No mobile o sidebar vem abaixo do conteúdo principal */
    order: 1;
  }

  .ksd-kv-2 {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 480px) {
  .ksd-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
