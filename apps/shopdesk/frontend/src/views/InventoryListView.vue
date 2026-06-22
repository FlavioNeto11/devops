<template>
  <UiPageLayout
    eyebrow="Operação"
    title="Estoque"
    subtitle="Acompanhe quantidades, identifique itens em baixa e dispare reposição."
    width="wide"
    :error="pageError"
    @retry="load"
  >
    <!-- ações de cabeçalho: exportar CSV, ver reposições, nova reposição e repor baixos -->
    <template #actions>
      <ExportCsvButton
        variant="ghost"
        :disabled="!r.items.value.length || r.loading.value"
        @export="exportCsv"
      />
      <UiButton variant="ghost" to="/reorders">Reposições</UiButton>
      <UiButton variant="subtle" to="/reorders/new">
        <template #icon-left><span class="iv-plus" aria-hidden="true">＋</span></template>
        Nova reposição
      </UiButton>
      <UiButton
        variant="primary"
        :loading="bulkBusy"
        :disabled="!reorderableCount || !reordersReady"
        @click="reorderAllLow"
      >
        <template #icon-left><span class="iv-cart" aria-hidden="true">⟳</span></template>
        Repor {{ reorderableCount ? '(' + reorderableCount + ')' : 'baixos' }}
      </UiButton>
    </template>

    <!-- KPIs derivados -->
    <template #banner>
      <div class="iv-kpis">
        <UiMetricCard
          label="Itens em estoque"
          :value="format.formatNumber(kpis.total)"
          tone="primary"
          hint="total filtrado"
        />
        <UiMetricCard
          label="Em dia"
          :value="format.formatNumber(kpis.ok)"
          tone="success"
          hint="acima do ponto · nesta página"
        />
        <UiMetricCard
          label="Estoque baixo"
          :value="format.formatNumber(kpis.low)"
          tone="warning"
          hint="no ou abaixo do ponto · nesta página"
          clickable
          @click="setStatus('baixo')"
        />
        <UiMetricCard
          label="Esgotados"
          :value="format.formatNumber(kpis.out)"
          tone="error"
          hint="sem unidades · nesta página"
          clickable
          @click="setStatus('esgotado')"
        />
      </div>
    </template>

    <!-- busca + chips de status (FilterChips) -->
    <template #filters>
      <div class="iv-toolbar">
        <form class="iv-search" role="search" @submit.prevent="applySearch">
          <span class="iv-search-icon" aria-hidden="true">⌕</span>
          <input
            id="iv-search-input"
            v-model="searchInput"
            class="iv-search-input"
            type="search"
            placeholder="Buscar por SKU, produto ou local…"
            aria-label="Buscar itens por SKU, produto ou local"
            @input="onSearchInput"
          />
          <button
            v-if="searchInput"
            class="iv-search-clear"
            type="button"
            aria-label="Limpar busca"
            @click="clearSearch"
          >✕</button>
        </form>

        <div class="iv-chip-group" role="group" aria-label="Filtrar por situação do estoque">
          <span class="iv-chip-legend">Situação</span>
          <button
            v-for="opt in statusOptions"
            :key="opt.value"
            class="iv-chip"
            type="button"
            :data-active="filters.status === opt.value ? 'true' : null"
            :data-tone="opt.tone"
            :aria-pressed="filters.status === opt.value"
            @click="setStatus(opt.value)"
          >
            <span class="iv-chip-dot" aria-hidden="true" />
            {{ opt.label }}
            <span v-if="opt.count != null" class="iv-chip-count">{{ opt.count }}</span>
          </button>
        </div>
      </div>

      <div v-if="activeFilterCount > 0" class="iv-active-filters">
        <span class="ui-muted">{{ activeFilterCount }} filtro(s) ativo(s)</span>
        <UiButton variant="subtle" size="sm" @click="resetAllFilters">Limpar tudo</UiButton>
      </div>
    </template>

    <!-- resumo de resultados acima da tabela -->
    <div v-if="!pageError" class="iv-resultline" aria-live="polite">
      <span class="iv-resultcount">
        <template v-if="r.loading.value">Carregando estoque…</template>
        <template v-else-if="r.total.value">
          {{ format.formatNumber(r.total.value) }} item(ns) no total · página
          {{ r.page.value }} de {{ totalPages }}
        </template>
        <template v-else>Sem itens para os filtros atuais.</template>
      </span>
      <span v-if="reorderableCount && !r.loading.value" class="iv-resultflag">
        {{ format.formatNumber(reorderableCount) }} pedindo reposição nesta página
      </span>
    </div>

    <!-- tabela: loading / empty / error / normal cobertos -->
    <UiDataTable
      :columns="columns"
      :rows="r.items.value"
      row-key="id"
      :loading="r.loading.value"
      :error="null"
      density="comfortable"
      clickable-rows
      server-mode
      :sort="r.sort.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      paginated
      :empty="emptyState"
      @update:sort="r.setSort"
      @update:page="r.setPage"
      @update:page-size="onPageSize"
      @row-click="openItem"
    >
      <template #cell-sku="{ value }">
        <span class="ui-mono iv-sku">{{ value || '—' }}</span>
      </template>

      <template #cell-productName="{ row }">
        <div class="iv-name-cell">
          <span class="iv-name">{{ row.productName || 'Sem nome' }}</span>
          <span v-if="row.location" class="iv-name-loc">{{ row.location }}</span>
        </div>
      </template>

      <template #cell-quantity="{ row }">
        <div class="iv-qty" :data-level="levelOf(row)">
          <span class="iv-qty-num">{{ format.formatNumber(row.quantity ?? 0) }}</span>
          <span class="iv-qty-bar" aria-hidden="true">
            <span class="iv-qty-fill" :data-level="levelOf(row)" :data-width="barBucket(row)" />
          </span>
        </div>
      </template>

      <template #cell-reorderPoint="{ value }">
        <span class="iv-reorder">{{ value == null || value === '' ? '—' : format.formatNumber(value) }}</span>
      </template>

      <template #cell-status="{ row }">
        <StockBadge :level="levelOf(row)" />
      </template>

      <template #cell-updatedAt="{ value }">
        <span class="iv-updated">{{ format.formatDateTime(value) }}</span>
      </template>

      <template #cell-actions="{ row }">
        <div class="iv-actions" @click.stop>
          <UiButton variant="ghost" size="sm" @click="openItem(row)">Detalhes</UiButton>
          <ReorderButton
            :level="levelOf(row)"
            :loading="busyId === row.id"
            :disabled="!reordersReady"
            @reorder="reorderItem(row)"
          />
        </div>
      </template>

      <template #empty-action>
        <UiButton v-if="activeFilterCount > 0" variant="ghost" @click="resetAllFilters">Limpar filtros</UiButton>
        <UiButton v-else variant="ghost" :loading="r.loading.value" @click="load">Atualizar</UiButton>
      </template>
    </UiDataTable>

    <template #footer>
      <span>Ancorado ao requisito REQ-SHOPDESK-0005 · {{ format.formatNumber(r.total.value) }} item(ns) no total.</span>
    </template>
  </UiPageLayout>

  <!-- modal de confirmação de reposição em lote -->
  <UiModal v-model:open="bulkModal.open" title="Repor itens em baixa" width="md">
    <p class="iv-modal-lead">
      {{ format.formatNumber(reorderableCount) }} item(ns) nesta página estão no ou abaixo do ponto de
      reposição. Confirme a quantidade sugerida para criar a ordem de reposição (/v1/reorders) de cada um.
    </p>
    <div class="iv-modal-list" role="list">
      <div v-for="it in lowItems" :key="it.id" class="iv-modal-row" role="listitem">
        <div class="iv-modal-info">
          <span class="iv-modal-name">{{ it.productName || it.sku }}</span>
          <span class="ui-mono iv-modal-sku">{{ it.sku }}</span>
        </div>
        <StockBadge :level="levelOf(it)" size="sm" />
        <span class="iv-modal-suggest">+{{ format.formatNumber(suggestQty(it)) }} un.</span>
      </div>
    </div>
    <template #footer>
      <UiButton variant="ghost" @click="bulkModal.open = false">Cancelar</UiButton>
      <UiButton variant="primary" :loading="bulkBusy" @click="confirmBulkReorder">
        Criar ordens de reposição
      </UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { ref, reactive, computed, onMounted, defineComponent, h } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiButton,
  UiMetricCard,
  UiStatusBadge,
  UiModal,
  useResource,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

/* -----------------------------------------------------------------------------
 * Recursos REAIS injetados pelo integrador (resourceFactory → /v1/<name>):
 *   api.inventory (/v1/inventory)  — leitura/listagem do estoque
 *   api.reorders  (/v1/reorders)   — ordens de reposição (modelo canônico do app)
 * Esses recursos podem NÃO existir no cliente (como nas telas-irmãs
 * InventoryDetailView/InventoryAdjustView/ProductDetailView). Por isso usamos
 * namespace import + guarda: nunca quebramos no onMounted nem inventamos rota.
 * --------------------------------------------------------------------------- */
const inventoryReady = computed(
  () => !!(api.inventory && typeof api.inventory.list === 'function'),
);
const reordersReady = computed(
  () => !!(api.reorders && typeof api.reorders.create === 'function'),
);
// recurso seguro para o useResource: se ausente, list() devolve vazio em vez de
// lançar TypeError; a tela exibe o estado de erro (pageError) acima da tabela.
const inventoryResource = {
  list: (params) =>
    api.inventory && typeof api.inventory.list === 'function'
      ? api.inventory.list(params)
      : Promise.resolve({ data: [], total: 0 }),
};

/* -----------------------------------------------------------------------------
 * Componentes locais montados SOBRE o kit (sem CSS framework, só tokens --ui-*).
 * StockBadge      -> UiStatusBadge com tom semântico do nível de estoque.
 * ReorderButton   -> UiButton com cópia/variante por nível.
 * ExportCsvButton -> UiButton que emite "export".
 * --------------------------------------------------------------------------- */
const LEVEL_LABEL = { ok: 'Em dia', baixo: 'Baixo', esgotado: 'Esgotado' };
const LEVEL_TONE = { ok: 'success', baixo: 'warning', esgotado: 'error' };

const StockBadge = defineComponent({
  name: 'StockBadge',
  props: { level: { type: String, default: 'ok' }, size: { type: String, default: 'md' } },
  setup(props) {
    return () =>
      h(UiStatusBadge, {
        tone: LEVEL_TONE[props.level] || 'neutral',
        label: LEVEL_LABEL[props.level] || 'Em dia',
        status: props.level,
        size: props.size,
        withDot: true,
      });
  },
});

const ReorderButton = defineComponent({
  name: 'ReorderButton',
  props: { level: { type: String, default: 'ok' }, loading: Boolean, disabled: Boolean },
  emits: ['reorder'],
  setup(props, { emit }) {
    return () =>
      h(
        UiButton,
        {
          variant: props.level === 'ok' ? 'subtle' : 'primary',
          size: 'sm',
          loading: props.loading,
          disabled: props.disabled,
          onClick: () => emit('reorder'),
        },
        { default: () => 'Repor' },
      );
  },
});

const ExportCsvButton = defineComponent({
  name: 'ExportCsvButton',
  props: { variant: { type: String, default: 'ghost' }, disabled: Boolean },
  emits: ['export'],
  setup(props, { emit }) {
    return () =>
      h(
        UiButton,
        { variant: props.variant, disabled: props.disabled, onClick: () => emit('export') },
        {
          'icon-left': () => h('span', { 'aria-hidden': 'true', class: 'iv-dl' }, '↓'),
          default: () => 'Exportar CSV',
        },
      );
  },
});

/* ----------------------------- recurso de dados ----------------------------- */
const r = useResource(inventoryResource, {
  pageSize: 25,
  sort: { key: 'quantity', dir: 'asc' },
  filters: { q: '', status: '' },
});

/* --------------------- erro de recurso indisponível (claro) ----------------- */
// Mensagem alinhada à InventoryDetailView para consistência entre as telas.
const RESOURCE_UNAVAILABLE_MSG =
  'Recurso de estoque indisponível. O endpoint /v1/inventory não está exposto no cliente.';
// Combinamos o erro de rede do useResource com a indisponibilidade do recurso:
// se o cliente não expõe api.inventory.list, mostramos a mensagem clara (sem retry quebrado).
const pageError = computed(() => {
  if (!inventoryReady.value) return RESOURCE_UNAVAILABLE_MSG;
  return r.error.value;
});

/* --------------------------------- colunas ---------------------------------- */
const columns = [
  { key: 'sku', label: 'SKU', sortable: true },
  { key: 'productName', label: 'Produto', sortable: true },
  { key: 'quantity', label: 'Quantidade', align: 'right', sortable: true },
  { key: 'reorderPoint', label: 'Ponto de reposição', align: 'right', sortable: true },
  { key: 'status', label: 'Situação' },
  { key: 'updatedAt', label: 'Atualizado em', sortable: true },
  { key: 'actions', label: 'Ações', align: 'right' },
];

/* ----------------------- nível de estoque (derivado) ------------------------ */
// Preferimos o status persistido; senão derivamos de quantity x reorderPoint.
function levelOf(row) {
  const s = String(row && row.status ? row.status : '').toLowerCase().trim();
  if (s === 'ok' || s === 'baixo' || s === 'esgotado') return s;
  const qty = Number(row && row.quantity != null ? row.quantity : 0);
  if (qty <= 0) return 'esgotado';
  const rp = row && row.reorderPoint != null && row.reorderPoint !== '' ? Number(row.reorderPoint) : null;
  if (rp != null && qty <= rp) return 'baixo';
  return 'ok';
}
// quantidade sugerida para repor: levar ao dobro do ponto, mínimo de 1.
function suggestQty(row) {
  const qty = Number(row.quantity ?? 0);
  const rp = row.reorderPoint != null && row.reorderPoint !== '' ? Number(row.reorderPoint) : 0;
  const target = rp > 0 ? rp * 2 : Math.max(qty, 1) + 1;
  return Math.max(1, target - qty);
}
// largura da barra (bucket discreto p/ CSS via data-width, sem :style).
function barBucket(row) {
  const qty = Number(row.quantity ?? 0);
  const rp = row.reorderPoint != null && row.reorderPoint !== '' ? Number(row.reorderPoint) : 0;
  if (qty <= 0) return '0';
  if (rp <= 0) return '100';
  const pct = Math.round(Math.min(1, qty / (rp * 2)) * 100);
  return String(Math.max(10, Math.round(pct / 25) * 25)); // 10|25|50|75|100
}

/* --------------------------------- busca ------------------------------------ */
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

/* ----------------------------- chips de status ------------------------------ */
// Os chips disparam um filtro SERVER-SIDE (r.setFilters({ status })). Só anexamos
// uma contagem ao chip "Todas" (= total real do backend). As contagens por status
// (ok/baixo/esgotado) só cobririam a página corrente — exibi-las ao lado do filtro
// passaria a falsa ideia de "quantos no total", então as omitimos (count: null).
const filters = reactive({ status: '' });
const statusOptions = computed(() => [
  { value: '', label: 'Todas', tone: 'neutral', count: kpis.value.total },
  { value: 'ok', label: 'Em dia', tone: 'success', count: null },
  { value: 'baixo', label: 'Baixo', tone: 'warning', count: null },
  { value: 'esgotado', label: 'Esgotado', tone: 'error', count: null },
]);
function setStatus(value) {
  filters.status = value;
  r.setFilters({ status: value });
}

const activeFilterCount = computed(() => ['q', 'status'].filter((k) => r.filters[k]).length);
function resetAllFilters() {
  searchInput.value = '';
  filters.status = '';
  r.setFilters({ q: '', status: '' });
}

/* -------------------------------- paginação --------------------------------- */
const totalPages = computed(() =>
  Math.max(1, Math.ceil((r.total.value || 0) / (r.pageSize.value || 1))),
);
function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}

/* ----------------------- KPIs --------------------------------------------------
 * `total` é o total REAL do backend (r.total, server-mode). As contagens por
 * situação (ok/low/out) só podem ser derivadas das linhas carregadas, ou seja,
 * da PÁGINA CORRENTE — os cards/labels deixam isso explícito ("nesta página")
 * para não enganar o operador (ex.: "Esgotados: 2" = 2 nesta página, não no total).
 * Um agregado real por status exigiria um endpoint de resumo no backend.
 * --------------------------------------------------------------------------- */
const kpis = computed(() => {
  const rows = r.items.value || [];
  const out = rows.filter((x) => levelOf(x) === 'esgotado').length;
  const low = rows.filter((x) => levelOf(x) === 'baixo').length;
  const ok = rows.filter((x) => levelOf(x) === 'ok').length;
  return { total: r.total.value || rows.length, ok, low, out };
});

const lowItems = computed(() => (r.items.value || []).filter((x) => levelOf(x) !== 'ok'));
const reorderableCount = computed(() => lowItems.value.length);

/* --------------------------- estado vazio contextual ------------------------ */
const emptyState = computed(() =>
  activeFilterCount.value > 0
    ? {
        title: 'Nenhum item encontrado',
        description: 'Nenhum item de estoque corresponde aos filtros atuais. Ajuste a busca ou limpe os filtros.',
        icon: '🔍',
      }
    : {
        title: 'Estoque vazio',
        description: 'Ainda não há itens de estoque cadastrados. Eles aparecem aqui assim que entram no sistema.',
        icon: '📦',
      },
);

/* -------------------------------- navegação --------------------------------- */
// Sempre rotas de DOMÍNIO do inventário/reposição.
function openItem(row) {
  router.push('/inventory/' + row.id);
}

/* --------------------------- ação: repor 1 item ----------------------------- */
// O modelo canônico de reposição é o recurso `reorders` (POST /v1/reorders) — o
// mesmo que InventoryDetailView/ReorderCreateView usam. Gravar flags no item de
// estoque (PUT /v1/inventory) NÃO cria a ordem, então criamos a ordem de verdade.
const REORDER_UNAVAILABLE_MSG = 'O endpoint /v1/reorders não está exposto no cliente.';

// Monta o payload da ordem de reposição a partir de uma linha do estoque.
function reorderPayload(row) {
  return {
    sku: row.sku,
    productName: row.productName,
    quantity: suggestQty(row),
    status: 'solicitada',
  };
}

const busyId = ref(null);
async function reorderItem(row) {
  if (!reordersReady.value) {
    toast.error('Recurso de reposições indisponível.', { detail: REORDER_UNAVAILABLE_MSG });
    return;
  }
  const qty = suggestQty(row);
  const ok = await confirm({
    title: 'Criar ordem de reposição',
    message:
      'Criar ordem de reposição de "' +
      (row.productName || row.sku || 'item') +
      '"? Sugestão: +' +
      format.formatNumber(qty) +
      ' un. (atual: ' +
      format.formatNumber(row.quantity ?? 0) +
      ').',
    confirmLabel: 'Criar reposição',
    cancelLabel: 'Cancelar',
  });
  if (!ok) return;
  busyId.value = row.id;
  try {
    await api.reorders.create(reorderPayload(row));
    toast.success('Ordem de reposição criada para ' + (row.productName || row.sku) + '.', {
      actionLabel: 'Ver reposições',
      onAction: () => router.push('/reorders'),
    });
    await r.load();
  } catch (e) {
    toast.error('Não foi possível criar a ordem de reposição.', { detail: e && e.message });
  } finally {
    busyId.value = null;
  }
}

/* ------------------------- ação: repor todos em baixa ----------------------- */
const bulkModal = reactive({ open: false });
const bulkBusy = ref(false);
function reorderAllLow() {
  if (!reordersReady.value) {
    toast.error('Recurso de reposições indisponível.', { detail: REORDER_UNAVAILABLE_MSG });
    return;
  }
  if (!reorderableCount.value) {
    toast.info('Nenhum item em baixa nesta página.');
    return;
  }
  bulkModal.open = true;
}
async function confirmBulkReorder() {
  if (!reordersReady.value) {
    toast.error('Recurso de reposições indisponível.', { detail: REORDER_UNAVAILABLE_MSG });
    bulkModal.open = false;
    return;
  }
  const targets = lowItems.value.slice();
  if (!targets.length) {
    bulkModal.open = false;
    return;
  }
  bulkBusy.value = true;
  let okCount = 0;
  let failCount = 0;
  for (const it of targets) {
    try {
      await api.reorders.create(reorderPayload(it));
      okCount += 1;
    } catch {
      failCount += 1;
    }
  }
  bulkBusy.value = false;
  bulkModal.open = false;
  if (okCount) {
    toast.success(format.formatNumber(okCount) + ' ordem(ns) de reposição criada(s).', {
      actionLabel: 'Ver reposições',
      onAction: () => router.push('/reorders'),
    });
  }
  if (failCount) toast.error(format.formatNumber(failCount) + ' item(ns) falharam ao criar a reposição.');
  await r.load();
}

/* ------------------------------- exportar CSV ------------------------------- */
function csvCell(value) {
  const s = value == null ? '' : String(value);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCsv() {
  const rows = r.items.value || [];
  if (!rows.length) {
    toast.warning('Nada para exportar nesta página.');
    return;
  }
  const head = ['SKU', 'Produto', 'Quantidade', 'Ponto de reposição', 'Local', 'Situação', 'Atualizado em'];
  const lines = [head.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.sku,
        row.productName,
        row.quantity ?? '',
        row.reorderPoint ?? '',
        row.location ?? '',
        LEVEL_LABEL[levelOf(row)] || '',
        row.updatedAt ? format.formatDateTime(row.updatedAt) : '',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = 'estoque-' + stamp + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success(format.formatNumber(rows.length) + ' linha(s) exportada(s).');
}

/* --------------------------- carregamento (guardado) ------------------------ */
// Se o recurso não está exposto, não tentamos a chamada: o pageError já exibe a
// mensagem clara e o botão "retry" do layout reusa este mesmo guard (idempotente).
function load() {
  if (!inventoryReady.value) return;
  return r.load();
}

onMounted(load);
</script>

<style scoped>
/* ícones inline (texto, não SVG) */
.iv-cart { font-size: 1.05em; line-height: 1; font-weight: 700; }
.iv-plus { font-size: 1.05em; line-height: 1; font-weight: 700; }
.iv-dl { font-weight: 700; }

/* KPIs */
.iv-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-3);
}

/* toolbar: busca + chips */
.iv-toolbar {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.iv-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 300px;
  min-width: 240px;
}
.iv-search-icon {
  position: absolute;
  left: var(--ui-space-3);
  color: rgb(var(--ui-muted));
  font-size: 1.05rem;
  pointer-events: none;
}
.iv-search-input {
  width: 100%;
  font: inherit;
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  /* vertical = token; horizontal reserva espaço p/ ícone (esq) e botão limpar (dir). */
  padding: var(--ui-space-2) calc(var(--ui-space-5) + var(--ui-space-2)) var(--ui-space-2)
    calc(var(--ui-space-5) + var(--ui-space-2));
}
.iv-search-input::placeholder { color: rgb(var(--ui-faint)); }
.iv-search-input:focus { border-color: rgb(var(--ui-accent)); }
.iv-search-clear {
  position: absolute;
  right: var(--ui-space-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* alvo de clique compacto: 1.5× o passo base (4px) → 24px. */
  width: calc(var(--ui-space-1) * 5);
  height: calc(var(--ui-space-1) * 5);
  border: none;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  cursor: pointer;
  font-size: var(--ui-text-xs);
}
.iv-search-clear:hover { background: rgb(var(--ui-border)); color: rgb(var(--ui-fg)); }

/* chips de status (FilterChips) */
.iv-chip-group {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.iv-chip-legend {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: .04em;
}
.iv-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-pill);
  padding: var(--ui-space-1) var(--ui-space-3);
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
.iv-chip:hover { border-color: rgb(var(--ui-accent)); color: rgb(var(--ui-fg)); }
.iv-chip[data-active="true"] {
  background: rgb(var(--ui-accent) / 0.12);
  border-color: rgb(var(--ui-accent));
  color: rgb(var(--ui-accent-strong));
}
.iv-chip-dot {
  width: var(--ui-space-2);
  height: var(--ui-space-2);
  border-radius: 50%;
  background: rgb(var(--ui-faint));
}
.iv-chip[data-tone="success"] .iv-chip-dot { background: rgb(var(--ui-ok)); }
.iv-chip[data-tone="warning"] .iv-chip-dot { background: rgb(var(--ui-warn)); }
.iv-chip[data-tone="error"] .iv-chip-dot { background: rgb(var(--ui-danger)); }
.iv-chip[data-tone="neutral"] .iv-chip-dot { background: rgb(var(--ui-faint)); }
.iv-chip-count {
  font-variant-numeric: tabular-nums;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  padding: 0 var(--ui-space-1);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
}
.iv-chip[data-active="true"] .iv-chip-count {
  background: rgb(var(--ui-accent) / 0.18);
  color: rgb(var(--ui-accent-strong));
}

.iv-active-filters {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  font-size: var(--ui-text-sm);
}

/* linha de resumo de resultados */
.iv-resultline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.iv-resultcount { font-variant-numeric: tabular-nums; }
.iv-resultflag {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-weight: 600;
  color: rgb(var(--ui-warn));
  background: rgb(var(--ui-warn) / 0.14);
  padding: var(--ui-space-1) var(--ui-space-3);
  border-radius: var(--ui-radius-pill);
}

/* células */
.iv-sku { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }
.iv-name-cell { display: flex; flex-direction: column; gap: 2px; }
.iv-name { font-weight: 600; color: rgb(var(--ui-fg)); }
.iv-name-loc { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.iv-reorder { font-variant-numeric: tabular-nums; color: rgb(var(--ui-muted)); }
.iv-updated { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); white-space: nowrap; }

/* quantidade + mini-barra (largura por bucket via data-width, sem :style) */
.iv-qty {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  justify-content: flex-end;
}
.iv-qty-num {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  min-width: 3ch;
  text-align: right;
}
.iv-qty[data-level="ok"] .iv-qty-num { color: rgb(var(--ui-fg)); }
.iv-qty[data-level="baixo"] .iv-qty-num { color: rgb(var(--ui-warn)); }
.iv-qty[data-level="esgotado"] .iv-qty-num { color: rgb(var(--ui-danger)); }
.iv-qty-bar {
  display: inline-block;
  /* trilho da mini-barra: 14× o passo base (4px) = 56px. */
  width: calc(var(--ui-space-1) * 14);
  height: var(--ui-space-1);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  overflow: hidden;
}
.iv-qty-fill {
  display: block;
  height: 100%;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-ok));
}
.iv-qty-fill[data-level="baixo"] { background: rgb(var(--ui-warn)); }
.iv-qty-fill[data-level="esgotado"] { background: rgb(var(--ui-danger)); }
.iv-qty-fill[data-width="0"] { width: 0; }
.iv-qty-fill[data-width="10"] { width: 10%; }
.iv-qty-fill[data-width="25"] { width: 25%; }
.iv-qty-fill[data-width="50"] { width: 50%; }
.iv-qty-fill[data-width="75"] { width: 75%; }
.iv-qty-fill[data-width="100"] { width: 100%; }

.iv-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* modal de reposição em lote */
.iv-modal-lead { margin: 0 0 var(--ui-space-4); color: rgb(var(--ui-muted)); }
.iv-modal-list { display: flex; flex-direction: column; gap: var(--ui-space-2); max-height: 320px; overflow-y: auto; }
.iv-modal-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
}
.iv-modal-info { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.iv-modal-name { font-weight: 600; color: rgb(var(--ui-fg)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iv-modal-sku { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.iv-modal-suggest {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
  white-space: nowrap;
}

@media (max-width: 860px) {
  .iv-toolbar { flex-direction: column; align-items: stretch; }
  .iv-actions { justify-content: flex-start; }
  .iv-qty { justify-content: flex-start; }
  .iv-resultline { flex-direction: column; align-items: flex-start; }
}
</style>
