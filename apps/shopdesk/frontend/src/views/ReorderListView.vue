<template>
  <UiPageLayout
    eyebrow="Abastecimento"
    title="Ordens de reposição"
    subtitle="Acompanhe pedidos de reposição por fornecedor, confirme o recebimento e cancele o que não for mais necessário."
    width="wide"
    :error="r.error.value"
    @retry="r.load"
  >
    <!-- Ações de cabeçalho -->
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="r.refresh">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton
        variant="subtle"
        :disabled="!r.items.value.length || r.loading.value"
        @click="exportCsv"
      >
        <template #icon-left><span aria-hidden="true">⬇</span></template>
        Exportar CSV
      </UiButton>
    </template>

    <!-- KPIs: 1 total real do servidor + 3 derivados da página (rotulados como tal) -->
    <template #banner>
      <div class="rl-kpis" role="group" aria-label="Indicadores de reposição">
        <UiMetricCard
          label="Total de ordens"
          :value="kpis.total"
          tone="primary"
          :hint="totalHint"
          :loading="r.loading.value"
        />
        <UiMetricCard
          label="Solicitadas (nesta página)"
          :value="kpis.requested"
          tone="warning"
          hint="Aguardando recebimento"
          :loading="r.loading.value"
        />
        <UiMetricCard
          label="Recebidas (nesta página)"
          :value="kpis.received"
          tone="success"
          hint="Concluídas nesta página"
          :loading="r.loading.value"
        />
        <UiMetricCard
          label="Unidades em aberto (nesta página)"
          :value="format.formatNumber(kpis.openUnits)"
          tone="running"
          hint="Soma de rascunhos + solicitadas"
          :loading="r.loading.value"
        />
      </div>
    </template>

    <!-- Busca + chips de situação + filtros avançados -->
    <template #filters>
      <div class="rl-toolbar">
        <form class="rl-search" role="search" @submit.prevent="applySearch">
          <span class="rl-search-icon" aria-hidden="true">⌕</span>
          <input
            id="rl-search-input"
            v-model="searchInput"
            class="rl-search-input"
            type="search"
            placeholder="Buscar por SKU, produto ou fornecedor…"
            aria-label="Buscar ordens por SKU, produto ou fornecedor"
            @input="onSearchInput"
          />
          <button
            v-if="searchInput"
            class="rl-search-clear"
            type="button"
            aria-label="Limpar busca"
            @click="clearSearch"
          >✕</button>
        </form>

        <div class="rl-chip-group" role="group" aria-label="Filtrar por situação">
          <span class="rl-chip-legend">Situação</span>
          <button
            v-for="opt in statusOptions"
            :key="opt.value"
            class="rl-chip"
            type="button"
            :data-active="r.filters.status === opt.value ? 'true' : null"
            :data-tone="opt.tone"
            :aria-pressed="r.filters.status === opt.value"
            @click="setStatus(opt.value)"
          >
            <span class="rl-chip-dot" aria-hidden="true" />
            {{ opt.label }}
          </button>
        </div>
      </div>

      <UiFiltersPanel
        v-model="supplierFilter"
        :fields="filterFields"
        @apply="applySupplier"
        @clear="clearSupplier"
      />

      <div v-if="activeFilterCount > 0" class="rl-active-filters">
        <span class="ui-muted">{{ activeFilterCount }} filtro(s) ativo(s)</span>
        <UiButton variant="subtle" size="sm" @click="resetAllFilters">Limpar tudo</UiButton>
      </div>
    </template>

    <!-- Tabela de ordens: loading / empty / error / normal cobertos -->
    <UiCard title="Lista de ordens" :subtitle="resultSummary">
      <UiDataTable
        :columns="columns"
        :rows="r.items.value"
        row-key="id"
        density="comfortable"
        clickable-rows
        server-mode
        :loading="r.loading.value"
        :sort="r.sort.value"
        :page="r.page.value"
        :page-size="r.pageSize.value"
        :total="r.total.value"
        paginated
        :empty="emptyState"
        @row-click="openDetail"
        @update:sort="r.setSort"
        @update:page="r.setPage"
        @update:page-size="onPageSize"
      >
        <!-- SKU + produto -->
        <template #cell-sku="{ row }">
          <div class="rl-sku-cell">
            <span class="rl-sku">{{ row.sku || '—' }}</span>
            <span class="rl-product">{{ row.productName || 'Produto não informado' }}</span>
          </div>
        </template>

        <!-- Quantidade solicitada -->
        <template #cell-quantity="{ value }">
          <span class="rl-qty">{{ value != null ? format.formatNumber(value) : '—' }}</span>
        </template>

        <!-- Fornecedor -->
        <template #cell-supplier="{ value }">
          <span v-if="value">{{ value }}</span>
          <span v-else class="ui-muted">Sem fornecedor</span>
        </template>

        <!-- Situação -->
        <template #cell-status="{ value }">
          <UiStatusBadge :status="value" :label="labelFor(value)" />
        </template>

        <!-- Criada em -->
        <template #cell-createdAt="{ value }">
          {{ format.formatDateTime(value) }}
        </template>

        <!-- Ações por linha -->
        <template #cell-actions="{ row }">
          <div class="rl-actions" @click.stop>
            <UiButton variant="ghost" size="sm" @click="openDetail(row)">Ver</UiButton>
            <UiButton
              variant="primary"
              size="sm"
              :disabled="!canReceive(row)"
              :loading="busyId === row.id && busyAction === 'receive'"
              @click="markReceived(row)"
            >
              Marcar recebida
            </UiButton>
            <UiButton
              variant="danger"
              size="sm"
              :disabled="!canCancel(row)"
              :loading="busyId === row.id && busyAction === 'cancel'"
              @click="cancelOrder(row)"
            >
              Cancelar
            </UiButton>
          </div>
        </template>

        <!-- Estado vazio contextual -->
        <template #empty-action>
          <UiButton v-if="activeFilterCount > 0" variant="ghost" @click="resetAllFilters">Limpar filtros</UiButton>
          <UiButton v-else variant="ghost" @click="r.load">Recarregar</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <template #footer>
      <span>Anexado ao requisito REQ-SHOPDESK-0005.</span>
    </template>

  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiFiltersPanel,
  UiStatusBadge,
  UiButton,
  useResource,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// ---------------------------------------------------------------------------
// Recurso REAL: GET/PUT /v1/reorders (resourceFactory("reorders") em api.js).
// useResource trata { data, total, page, pageSize } e os estados de lista.
// Fail-closed: se o fio do cliente não existir (api.reorders ausente), a tela
// degrada com aviso de "recurso indisponível" em vez de quebrar no mount —
// mesmo padrão das views irmãs (ReorderDetail/Create, InventoryDetail).
// ---------------------------------------------------------------------------
const reorders = api.reorders || null;
const resourceReady = computed(
  () => !!reorders && typeof reorders.list === 'function',
);
const r = useResource(reorders || { list: async () => ({ data: [], total: 0 }) }, {
  pageSize: 25,
  sort: { key: 'createdAt', dir: 'desc' },
  filters: { q: '', status: '', supplier: '' },
});
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// ---------------------------------------------------------------------------
// FONTE ÚNICA dos status do domínio (value + label legível + tom do kit).
// enum: rascunho | solicitada | recebida | cancelada.
// Tudo que precisa de rótulo/tom/opção deriva daqui — sem triplicação.
// ---------------------------------------------------------------------------
const STATUSES = [
  { value: 'rascunho', label: 'Rascunho', tone: 'neutral' },
  { value: 'solicitada', label: 'Solicitada', tone: 'warning' },
  { value: 'recebida', label: 'Recebida', tone: 'success' },
  { value: 'cancelada', label: 'Cancelada', tone: 'error' },
];
const STATUS_LABELS = Object.fromEntries(STATUSES.map((s) => [s.value, s.label]));
const labelFor = (v) => STATUS_LABELS[v] || format.humanize(v);

// ---------------------------------------------------------------------------
// Colunas da tabela.
// ---------------------------------------------------------------------------
const columns = [
  { key: 'sku', label: 'SKU / Produto', sortable: true },
  { key: 'quantity', label: 'Qtd. solicitada', align: 'right', sortable: true },
  { key: 'supplier', label: 'Fornecedor', sortable: true },
  { key: 'status', label: 'Situação', sortable: true },
  { key: 'createdAt', label: 'Criada em', sortable: true },
  { key: 'actions', label: 'Ações', align: 'right' },
];

// ---------------------------------------------------------------------------
// Controles de filtro — UMA fonte de verdade por campo, sem duplicação:
//   • q       -> busca de texto (debounce) no cabeçalho
//   • status  -> chips de situação no cabeçalho
//   • supplier-> UiFiltersPanel (campo EXCLUSIVO, não repetido em lugar nenhum)
// Não há mais dois controles para os mesmos campos, então não há como divergir.
// ---------------------------------------------------------------------------
const searchInput = ref('');
let searchTimer = null;
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(applySearch, 350);
}
function applySearch() {
  if (searchTimer) clearTimeout(searchTimer);
  r.setFilters({ q: searchInput.value.trim() });
}
function clearSearch() {
  searchInput.value = '';
  r.setFilters({ q: '' });
}

// Chips de situação -> filtro `status` do servidor. "Todas" = sem filtro.
const statusOptions = [{ value: '', label: 'Todas', tone: 'neutral' }, ...STATUSES];
function setStatus(value) {
  r.setFilters({ status: value });
}

// FiltersPanel restrito ao fornecedor (campo exclusivo). O v-model carrega só
// `supplier`; q/status são governados pela busca + chips acima.
const supplierFilter = ref({ supplier: '' });
const filterFields = [
  { key: 'supplier', label: 'Fornecedor', type: 'text', placeholder: 'ex.: Atacado Sul' },
];
function applySupplier(model) {
  r.setFilters({ supplier: (model.supplier || '').trim() });
}
function clearSupplier() {
  supplierFilter.value = { supplier: '' };
  r.setFilters({ supplier: '' });
}

const activeFilterCount = computed(() =>
  ['q', 'status', 'supplier'].filter((k) => r.filters[k]).length,
);
function resetAllFilters() {
  searchInput.value = '';
  supplierFilter.value = { supplier: '' };
  r.setFilters({ q: '', status: '', supplier: '' });
}

// ---------------------------------------------------------------------------
// Paginação.
// ---------------------------------------------------------------------------
function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}

// ---------------------------------------------------------------------------
// KPIs. `total` é o agregado REAL do servidor (r.total, escopo da consulta
// inteira); os demais são derivados das linhas da página atual e estão
// rotulados como "(nesta página)" no banner para não enganar o usuário.
// ---------------------------------------------------------------------------
const kpis = computed(() => {
  const rows = r.items.value || [];
  return {
    total: r.total.value || rows.length,
    requested: rows.filter((o) => o.status === 'solicitada').length,
    received: rows.filter((o) => o.status === 'recebida').length,
    openUnits: rows
      .filter((o) => o.status === 'rascunho' || o.status === 'solicitada')
      .reduce((s, o) => s + (Number(o.quantity) || 0), 0),
  };
});
const totalHint = computed(() => (r.total.value ? r.total.value + ' no total' : 'Sem ordens'));
const resultSummary = computed(() => {
  if (r.loading.value) return 'Carregando…';
  if (!r.total.value) return 'Nenhuma ordem cadastrada';
  return r.items.value.length + ' nesta página · ' + r.total.value + ' no total';
});
const emptyState = computed(() =>
  activeFilterCount.value > 0
    ? { title: 'Nenhuma ordem no filtro', description: 'Nenhuma ordem corresponde aos filtros atuais. Ajuste a busca ou limpe os filtros.', icon: '🔍' }
    : { title: 'Nenhuma ordem de reposição', description: 'As ordens de reposição aparecerão aqui assim que forem criadas.', icon: '📦' },
);

// ---------------------------------------------------------------------------
// Regras de ação por linha.
//   - Marcar recebida: só rascunho/solicitada.
//   - Cancelar (destrutiva): tudo que não esteja recebida/cancelada.
// ---------------------------------------------------------------------------
const RECEIVABLE = new Set(['rascunho', 'solicitada']);
const CANCELABLE = new Set(['rascunho', 'solicitada']);
const canMutate = computed(() => !!reorders && typeof reorders.update === 'function');
const canReceive = (row) => !!row && RECEIVABLE.has(row.status) && canMutate.value;
const canCancel = (row) => !!row && CANCELABLE.has(row.status) && canMutate.value;

const orderName = (row) =>
  (row.sku ? row.sku + ' — ' : '') + (row.productName || ('ordem ' + (row.id ?? '')));

// ---------------------------------------------------------------------------
// Navega para o detalhe da ordem (/reorders/:id) — interação principal da tela.
// ---------------------------------------------------------------------------
function openDetail(row) {
  router.push({ name: 'reorder', params: { id: row.id } });
}

// ---------------------------------------------------------------------------
// Mutações. busyId + busyAction controlam o spinner do botão correto.
// ---------------------------------------------------------------------------
const busyId = ref(null);
const busyAction = ref('');

async function markReceived(row) {
  if (!canReceive(row)) return;
  busyId.value = row.id;
  busyAction.value = 'receive';
  try {
    await reorders.update(row.id, { status: 'recebida' });
    toast.success('Ordem ' + orderName(row) + ' marcada como recebida.');
    await r.refresh();
  } catch (e) {
    toast.error('Não foi possível marcar como recebida.', {
      detail: e && e.message,
      code: e && e.status ? 'HTTP ' + e.status : '',
    });
  } finally {
    busyId.value = null;
    busyAction.value = '';
  }
}

async function cancelOrder(row) {
  if (!canCancel(row)) return;
  const ok = await confirm({
    title: 'Cancelar ordem de reposição',
    message:
      'Cancelar a ordem "' +
      orderName(row) +
      '"? Ela deixará de ser processada pelo fornecedor. O histórico é preservado.',
    confirmLabel: 'Cancelar ordem',
    cancelLabel: 'Manter ordem',
    danger: true,
  });
  if (!ok) return;
  busyId.value = row.id;
  busyAction.value = 'cancel';
  try {
    await reorders.update(row.id, { status: 'cancelada' });
    toast.success('Ordem ' + orderName(row) + ' cancelada.');
    await r.refresh();
  } catch (e) {
    toast.error('Não foi possível cancelar a ordem.', {
      detail: e && e.message,
      code: e && e.status ? 'HTTP ' + e.status : '',
    });
  } finally {
    busyId.value = null;
    busyAction.value = '';
  }
}

// ---------------------------------------------------------------------------
// Exportar CSV (cliente, sobre as linhas carregadas; CSP-safe via Blob).
// ---------------------------------------------------------------------------
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCsv() {
  const rows = r.items.value || [];
  if (!rows.length) {
    toast.warning('Nada para exportar.');
    return;
  }
  const head = ['SKU', 'Produto', 'Qtd. solicitada', 'Fornecedor', 'Situação', 'Criada em'];
  const lines = [head.join(';')];
  for (const o of rows) {
    lines.push(
      [
        csvCell(o.sku),
        csvCell(o.productName),
        csvCell(o.quantity),
        csvCell(o.supplier),
        csvCell(labelFor(o.status)),
        csvCell(o.createdAt),
      ].join(';'),
    );
  }
  try {
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ordens-reposicao-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado (' + rows.length + ' ordens).');
  } catch (e) {
    toast.error('Falha ao exportar CSV', { detail: e && e.message });
  }
}

onMounted(() => {
  if (!resourceReady.value) {
    // Fail-closed: sem o fio do cliente, não chamamos undefined.list().
    r.error.value = new Error(
      'Recurso de reposições indisponível. A API de ordens de reposição não está conectada ao cliente.',
    );
    return;
  }
  r.load();
});
</script>

<style scoped>
/* KPIs */
.rl-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* Barra de busca + chips */
.rl-toolbar {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.rl-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 280px;
  min-width: 240px;
}
.rl-search-icon {
  position: absolute;
  left: 12px;
  color: rgb(var(--ui-muted));
  font-size: 1.05rem;
  pointer-events: none;
}
.rl-search-input {
  width: 100%;
  font: inherit;
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  padding: 9px 34px;
}
.rl-search-input::placeholder { color: rgb(var(--ui-faint)); }
.rl-search-input:focus { border-color: rgb(var(--ui-accent)); }
.rl-search-clear {
  position: absolute;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  cursor: pointer;
  font-size: var(--ui-text-xs);
}
.rl-search-clear:hover { background: rgb(var(--ui-border)); color: rgb(var(--ui-fg)); }
.rl-search-clear:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

.rl-chip-group {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.rl-chip-legend {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: .04em;
}
.rl-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-pill);
  padding: 5px 12px;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
.rl-chip:hover { border-color: rgb(var(--ui-accent)); color: rgb(var(--ui-fg)); }
.rl-chip:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.rl-chip[data-active="true"] {
  background: rgb(var(--ui-accent) / 0.12);
  border-color: rgb(var(--ui-accent));
  color: rgb(var(--ui-accent-strong));
}
.rl-chip-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgb(var(--ui-faint));
}
.rl-chip[data-tone="success"] .rl-chip-dot { background: rgb(var(--ui-ok)); }
.rl-chip[data-tone="warning"] .rl-chip-dot { background: rgb(var(--ui-warn)); }
.rl-chip[data-tone="error"] .rl-chip-dot { background: rgb(var(--ui-danger)); }
.rl-chip[data-tone="neutral"] .rl-chip-dot { background: rgb(var(--ui-faint)); }

.rl-active-filters {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  font-size: var(--ui-text-sm);
}

/* Células da tabela */
.rl-sku-cell { display: flex; flex-direction: column; gap: 2px; }
.rl-sku {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
.rl-product { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.rl-qty { font-variant-numeric: tabular-nums; font-weight: 600; }

.rl-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* Detalhe (modal) */
.rl-detail { display: grid; gap: var(--ui-space-1); margin: 0; }
.rl-detail-row {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: var(--ui-space-3);
  align-items: center;
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.rl-detail-row:last-child { border-bottom: none; }
.rl-detail dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; }
.rl-detail dd { margin: 0; }
.rl-mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }

@media (max-width: 980px) {
  .rl-kpis { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 860px) {
  .rl-toolbar { flex-direction: column; align-items: stretch; }
  .rl-actions { justify-content: flex-start; }
}
@media (max-width: 560px) {
  .rl-kpis { grid-template-columns: 1fr; }
  .rl-detail-row { grid-template-columns: 1fr; gap: 2px; }
}
</style>
