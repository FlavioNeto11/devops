<template>
  <UiPageLayout
    eyebrow="RAG"
    title="Base de conhecimento"
    subtitle="Fontes indexadas que alimentam as citações do assistente. Reindexe para reprocessar uma fonte ou remova fontes obsoletas."
    width="wide"
    :error="r.error.value"
    @retry="r.load"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="reload">Atualizar</UiButton>
      <UiButton to="/knowledge-sources/new">Adicionar fonte</UiButton>
    </template>

    <!-- Resumo: visão geral REAL do índice (agregados de toda a coleção, não da página). -->
    <section class="ks-metrics" aria-label="Resumo da base de conhecimento">
      <UiMetricCard
        label="Fontes indexadas"
        :value="metricsLoading ? null : format.formatNumber(totalSources)"
        :loading="metricsLoading"
        tone="primary"
        hint="Documentos na base"
      />
      <UiMetricCard
        label="Trechos indexados"
        :value="metricsLoading ? null : format.formatNumber(totalChunks)"
        :loading="metricsLoading"
        tone="neutral"
        hint="Soma dos trechos de todas as fontes"
      />
      <UiMetricCard
        label="Modelos de embedding"
        :value="metricsLoading ? null : format.formatNumber(distinctModels)"
        :loading="metricsLoading"
        tone="neutral"
        :hint="modelsHint"
      />
      <UiMetricCard
        label="Fontes vazias"
        :value="metricsLoading ? null : format.formatNumber(emptyCount)"
        :loading="metricsLoading"
        :tone="emptyCount > 0 ? 'warning' : 'success'"
        hint="Sem trechos indexados"
      />
    </section>

    <!-- Busca server-side por título ou ID (varre TODA a coleção, não só a página). -->
    <UiFiltersPanel
      v-model="filters"
      :fields="filterFields"
      @apply="applyFilters"
      @clear="clearFilters"
    />

    <!-- Tabela de fontes -->
    <UiDataTable
      :columns="columns"
      :rows="r.items.value"
      :loading="r.loading.value"
      row-key="source_id"
      :sort="r.sort.value"
      server-mode
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      paginated
      :empty="emptyState"
      @update:sort="r.setSort"
      @update:page="r.setPage"
      @update:page-size="onPageSize"
    >
      <!-- Título da fonte + id técnico -->
      <template #cell-title="{ row }">
        <RouterLink :to="'/knowledge-sources/' + row.source_id" class="ks-title-link">
          <div class="ks-title">
            <span class="ks-title-main">{{ row.title || 'Sem título' }}</span>
            <span class="ks-title-id">{{ row.source_id }}</span>
          </div>
        </RouterLink>
      </template>

      <!-- Trechos indexados (numérico, alinhado) -->
      <template #cell-chunk_count="{ value }">
        <span class="ks-chunks">{{ format.formatNumber(value || 0) }}</span>
      </template>

      <!-- Modelo de embedding -->
      <template #cell-embedding_model="{ value }">
        <span v-if="value" class="ks-model">{{ value }}</span>
        <span v-else class="ks-muted">não definido</span>
      </template>

      <!-- Estado derivado do nº de trechos -->
      <template #cell-state="{ row }">
        <UiStatusBadge :status="stateOf(row)" :label="stateLabel(row)" />
      </template>

      <!-- Indexado em -->
      <template #cell-ingested_at="{ value }">
        {{ format.formatDateTime(value) }}
      </template>

      <!-- Ações por linha -->
      <template #cell-actions="{ row }">
        <div class="ks-actions" @click.stop>
          <UiButton
            variant="subtle"
            size="sm"
            :loading="busyId === row.source_id"
            @click="reindex(row)"
          >Reindexar</UiButton>
          <UiButton
            variant="danger"
            size="sm"
            :loading="busyId === row.source_id"
            @click="remove(row)"
          >Remover</UiButton>
        </div>
      </template>

      <template #empty-action>
        <UiButton variant="ghost" @click="reload">Recarregar</UiButton>
      </template>
    </UiDataTable>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiMetricCard,
  UiStatusBadge,
  UiFiltersPanel,
  UiButton,
  useResource,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import { knowledgeSources } from '../api.js';

// Recurso REST real: /v1/knowledge-sources (rowKey = source_id) + métodos dedicados
// reindex(id) e stats() (ver api.js).
const toast = useToast();
const confirmAsk = useConfirm();
const r = useResource(knowledgeSources, { pageSize: 25, sort: { key: 'ingested_at', dir: 'desc' } });

const busyId = ref('');

// Busca SERVER-SIDE por título ou ID: o backend aplica WHERE title ILIKE / source_id ILIKE
// sobre toda a coleção (não só a página). O termo vai via filters do useResource → query param `q`.
const filters = ref({ q: '' });
const filterFields = [
  { key: 'q', label: 'Buscar por título ou ID', type: 'text', placeholder: 'ex.: manual, política… (busca na base inteira)' },
];
function applyFilters() { r.setFilters({ q: (filters.value.q || '').trim() }); }
function clearFilters() { filters.value = { q: '' }; r.setFilters({ q: '' }); }

const columns = [
  { key: 'title', label: 'Fonte', sortable: true },
  { key: 'chunk_count', label: 'Trechos', sortable: true, align: 'right' },
  { key: 'embedding_model', label: 'Modelo de embedding' },
  { key: 'state', label: 'Estado' },
  { key: 'ingested_at', label: 'Indexado em', sortable: true },
  { key: 'actions', label: 'Ações', align: 'right' },
];

const emptyState = {
  title: 'Nenhuma fonte indexada',
  description: 'A base de conhecimento ainda não tem fontes (ou nenhuma corresponde à busca). Conforme documentos forem indexados, eles aparecem aqui e passam a alimentar as citações do assistente.',
  icon: 'database',
};

// ── Métricas de cabeçalho: agregados REAIS de toda a coleção (endpoint /stats),
// não derivados da página atual de 25 — evita inconsistência com a paginação.
const stats = ref(null);
const statsLoading = ref(false);
const statsError = ref(false);

async function loadStats() {
  statsLoading.value = true;
  statsError.value = false;
  try {
    stats.value = await knowledgeSources.stats();
  } catch {
    // Fail-soft: sem stats, as métricas caem para o total real da lista (sem inventar números por-página).
    stats.value = null;
    statsError.value = true;
  } finally {
    statsLoading.value = false;
  }
}

const metricsLoading = computed(() => statsLoading.value || (r.loading.value && !stats.value));
// Total de fontes: stats real; fallback para r.total (já é o total real da coleção, não da página).
const totalSources = computed(() => (stats.value ? stats.value.total_sources : r.total.value));
const totalChunks = computed(() => (stats.value ? stats.value.total_chunks : 0));
const distinctModels = computed(() => (stats.value ? stats.value.distinct_models : 0));
const emptyCount = computed(() => (stats.value ? stats.value.empty_sources : 0));
const modelsHint = computed(() => {
  const models = (stats.value && stats.value.models) || [];
  if (statsError.value) return 'Resumo indisponível';
  return models.length ? models.slice(0, 3).join(', ') : 'Nenhum definido';
});

// Estado semântico de uma fonte a partir do nº de trechos.
function stateOf(row) {
  return Number(row.chunk_count) > 0 ? 'active' : 'pending';
}
function stateLabel(row) {
  return Number(row.chunk_count) > 0 ? 'Indexada' : 'Vazia';
}

const onPageSize = (size) => { r.pageSize.value = size; r.setPage(1); };

// Recarrega lista + métricas juntas (a reindexação/remoção muda ambos).
async function reload() {
  await Promise.all([r.load(), loadStats()]);
}

// Reindexar: POST /v1/knowledge-sources/:id/reindex — reprocessa a fonte AGORA
// (o backend avança ingested_at=now(); o timestamp "Indexado em" muda de verdade).
async function reindex(row) {
  if (busyId.value) return;
  busyId.value = row.source_id;
  try {
    await knowledgeSources.reindex(row.source_id);
    toast.success('Fonte "' + (row.title || row.source_id) + '" reindexada.');
    await reload();
  } catch (e) {
    toast.error('Falha ao reindexar: ' + (e && e.message ? e.message : 'erro desconhecido'));
  } finally {
    busyId.value = '';
  }
}

// Remover: ação destrutiva (CASCADE apaga os trechos) — sempre confirmada.
async function remove(row) {
  if (busyId.value) return;
  const ok = await confirmAsk({
    title: 'Remover fonte da base?',
    message: 'A fonte "' + (row.title || row.source_id) + '" e seus ' + format.formatNumber(row.chunk_count || 0) + ' trecho(s) indexado(s) serão apagados. O assistente deixará de citá-la. Esta ação não pode ser desfeita.',
    danger: true,
  });
  if (!ok) return;
  busyId.value = row.source_id;
  try {
    await r.remove(row.source_id);
    toast.success('Fonte removida da base de conhecimento.');
    await reload();
  } catch (e) {
    toast.error('Falha ao remover: ' + (e && e.message ? e.message : 'erro desconhecido'));
  } finally {
    busyId.value = '';
  }
}

onMounted(reload);
</script>

<style scoped>
.ks-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

.ks-title-link {
  text-decoration: none;
  color: inherit;
}
.ks-title-link:hover .ks-title-main {
  color: rgb(var(--ui-primary));
  text-decoration: underline;
}

.ks-title {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  min-width: 0;
}
.ks-title-main {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
}
.ks-title-id {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

.ks-chunks {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.ks-model {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border));
}

.ks-muted {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  font-style: italic;
}

.ks-actions {
  display: inline-flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
}

@media (max-width: 860px) {
  .ks-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
  .ks-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
