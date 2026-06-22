<template>
  <UiPageLayout
    eyebrow="Catálogo"
    title="Produtos"
    subtitle="Busque, filtre e gerencie o catálogo da loja."
    width="wide"
    :error="r.error.value"
    @retry="r.load"
  >
    <template #actions>
      <UiButton variant="primary" to="/products/new">
        <template #icon-left><span class="pl-plus" aria-hidden="true">+</span></template>
        Novo produto
      </UiButton>
    </template>

    <!-- KPIs derivados da página corrente -->
    <template #banner>
      <div class="pl-kpis">
        <UiMetricCard label="Produtos na lista" :value="kpis.total" tone="primary" hint="total filtrado" />
        <UiMetricCard label="Publicados" :value="kpis.published" tone="success" hint="visíveis na loja" />
        <UiMetricCard label="Sem estoque" :value="kpis.outOfStock" tone="error" hint="esgotados" />
        <UiMetricCard label="Estoque baixo" :value="kpis.lowStock" tone="warning" :hint="'≤ ' + LOW_STOCK_THRESHOLD + ' un.'" />
      </div>
    </template>

    <!-- Busca + filtros (SearchBar + FilterChips + FiltersPanel) -->
    <template #filters>
      <div class="pl-toolbar">
        <form class="pl-search" role="search" @submit.prevent="applySearch">
          <span class="pl-search-icon" aria-hidden="true">⌕</span>
          <input
            id="pl-search-input"
            v-model="searchInput"
            class="pl-search-input"
            type="search"
            placeholder="Buscar por nome ou SKU…"
            aria-label="Buscar produtos por nome ou SKU"
            @input="onSearchInput"
          />
          <button
            v-if="searchInput"
            class="pl-search-clear"
            type="button"
            aria-label="Limpar busca"
            @click="clearSearch"
          >✕</button>
        </form>

        <div class="pl-chip-groups">
          <div class="pl-chip-group" role="group" aria-label="Filtrar por situação">
            <span class="pl-chip-legend">Situação</span>
            <button
              v-for="opt in statusOptions"
              :key="opt.value"
              class="pl-chip"
              type="button"
              :data-active="filters.status === opt.value ? 'true' : null"
              :data-tone="opt.tone"
              :aria-pressed="filters.status === opt.value"
              @click="setStatus(opt.value)"
            >
              <span class="pl-chip-dot" aria-hidden="true" />
              {{ opt.label }}
            </button>
          </div>

          <div class="pl-chip-group" role="group" aria-label="Filtrar por disponibilidade">
            <span class="pl-chip-legend">Disponibilidade</span>
            <button
              v-for="opt in activeOptions"
              :key="opt.value"
              class="pl-chip"
              type="button"
              :data-active="filters.active === opt.value ? 'true' : null"
              :aria-pressed="filters.active === opt.value"
              @click="setActive(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </div>

      <UiFiltersPanel
        v-model="advancedFilters"
        :fields="filterFields"
        @apply="applyAdvanced"
        @clear="clearAdvanced"
      />

      <div v-if="activeFilterCount > 0" class="pl-active-filters">
        <span class="ui-muted">{{ activeFilterCount }} filtro(s) ativo(s)</span>
        <UiButton variant="subtle" size="sm" @click="resetAllFilters">Limpar tudo</UiButton>
      </div>
    </template>

    <!-- Tabela de dados: loading / empty / error / normal todos cobertos -->
    <UiDataTable
      :columns="columns"
      :rows="rows"
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
      @row-click="openProduct"
    >
      <template #cell-sku="{ value }">
        <span class="ui-mono pl-sku">{{ value || '—' }}</span>
      </template>

      <template #cell-name="{ row }">
        <div class="pl-name-cell">
          <span class="pl-name">{{ row.name || 'Sem nome' }}</span>
          <span v-if="row.category" class="pl-name-cat">{{ row.category }}</span>
        </div>
      </template>

      <template #cell-price="{ value }">
        <span class="pl-price">{{ format.formatCurrency(value) }}</span>
      </template>

      <template #cell-stockQty="{ row }">
        <span class="pl-stock" :data-level="stockLevel(row.stockQty)">
          {{ format.formatNumber(row.stockQty ?? 0) }}
          <span v-if="stockLevel(row.stockQty) === 'out'" class="pl-stock-tag">esgotado</span>
          <span v-else-if="stockLevel(row.stockQty) === 'low'" class="pl-stock-tag">baixo</span>
        </span>
      </template>

      <template #cell-status="{ row }">
        <UiStatusBadge
          :status="effectiveStatus(row)"
          :tone="statusTone(effectiveStatus(row))"
        />
      </template>

      <template #cell-active="{ row }">
        <UiStatusBadge
          :status="row.active ? 'ativo' : 'inativo'"
          :label="row.active ? 'Ativo' : 'Inativo'"
        />
      </template>

      <template #cell-actions="{ row }">
        <div class="pl-actions" @click.stop>
          <UiButton variant="ghost" size="sm" :to="'/products/' + row.id">Ver</UiButton>
          <UiButton variant="subtle" size="sm" :to="'/products/' + row.id + '/edit'">Editar</UiButton>
          <UiButton
            v-if="row.active"
            variant="danger"
            size="sm"
            :loading="busyId === row.id"
            @click="archiveProduct(row)"
          >Arquivar</UiButton>
          <UiButton
            v-else
            variant="primary"
            size="sm"
            :loading="busyId === row.id"
            @click="activateProduct(row)"
          >Ativar</UiButton>
        </div>
      </template>

      <template #empty-action>
        <UiButton
          v-if="activeFilterCount > 0"
          variant="ghost"
          @click="resetAllFilters"
        >Limpar filtros</UiButton>
        <UiButton v-else variant="primary" to="/products/new">Cadastrar primeiro produto</UiButton>
      </template>
    </UiDataTable>

    <template #footer>
      <span>Anexado aos requisitos REQ-SHOPDESK-0005 · REQ-SHOPDESK-0003.</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiButton,
  UiMetricCard,
  UiStatusBadge,
  UiFiltersPanel,
  useResource,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import { products } from '../api.js';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const LOW_STOCK_THRESHOLD = 5;

// recurso de dados (server-mode: paginação/ordenação/filtro)
const r = useResource(products, {
  pageSize: 25,
  sort: { key: 'createdAt', dir: 'desc' },
  filters: { q: '', status: '', active: '', category: '' },
});

// O backend devolve linhas em snake_case (stock_qty, created_at). A tabela e os KPIs leem
// camelCase; normalizamos aqui (camada de apresentação) sem alterar o client genérico da API.
const rows = computed(() =>
  (r.items.value || []).map((row) => ({
    ...row,
    stockQty: row.stockQty ?? row.stock_qty,
    createdAt: row.createdAt ?? row.created_at,
  }))
);

// ---- colunas da tabela ----
const columns = [
  { key: 'sku', label: 'SKU', sortable: true },
  { key: 'name', label: 'Produto', sortable: true },
  { key: 'price', label: 'Preço', align: 'right', sortable: true },
  { key: 'stockQty', label: 'Estoque', align: 'right', sortable: true },
  { key: 'status', label: 'Situação' },
  { key: 'active', label: 'Ativo', align: 'center' },
  { key: 'createdAt', label: 'Criado em', sortable: true, format: 'date' },
  { key: 'actions', label: 'Ações', align: 'right' },
];

// ---- busca (SearchBar) com debounce ----
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

// ---- chips de filtro (FilterChips) ----
const filters = reactive({ status: '', active: '' });

const statusOptions = [
  { value: '', label: 'Todas', tone: 'neutral' },
  { value: 'rascunho', label: 'Rascunho', tone: 'warning' },
  { value: 'publicado', label: 'Publicado', tone: 'success' },
  { value: 'arquivado', label: 'Arquivado', tone: 'error' },
];
const activeOptions = [
  { value: '', label: 'Todos' },
  { value: 'true', label: 'Ativos' },
  { value: 'false', label: 'Inativos' },
];

function setStatus(value) {
  filters.status = value;
  r.setFilters({ status: value });
}
function setActive(value) {
  filters.active = value;
  r.setFilters({ active: value });
}

// ---- filtros avançados (FiltersPanel) ----
const advancedFilters = ref({ category: '', q: '' });
const filterFields = [
  { key: 'q', label: 'Busca', type: 'text', placeholder: 'nome ou SKU' },
  { key: 'category', label: 'Categoria', type: 'text', placeholder: 'ex.: Acessórios' },
];
function applyAdvanced(model) {
  const next = { category: (model.category || '').trim(), q: (model.q || '').trim() };
  searchInput.value = next.q;
  r.setFilters(next);
}
function clearAdvanced() {
  advancedFilters.value = { category: '', q: '' };
  searchInput.value = '';
  r.setFilters({ category: '', q: '' });
}

const activeFilterCount = computed(() =>
  ['q', 'status', 'active', 'category'].filter((k) => r.filters[k]).length
);

function resetAllFilters() {
  searchInput.value = '';
  filters.status = '';
  filters.active = '';
  advancedFilters.value = { category: '', q: '' };
  r.setFilters({ q: '', status: '', active: '', category: '' });
}

// ---- paginação ----
function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}

// ---- KPIs (derivados da página carregada) ----
const kpis = computed(() => {
  const list = rows.value;
  return {
    total: r.total.value || list.length,
    published: list.filter((x) => (x.status || (x.active ? 'publicado' : '')) === 'publicado').length,
    outOfStock: list.filter((x) => Number(x.stockQty ?? 0) <= 0).length,
    lowStock: list.filter((x) => {
      const q = Number(x.stockQty ?? 0);
      return q > 0 && q <= LOW_STOCK_THRESHOLD;
    }).length,
  };
});

function stockLevel(qty) {
  const q = Number(qty ?? 0);
  if (q <= 0) return 'out';
  if (q <= LOW_STOCK_THRESHOLD) return 'low';
  return 'ok';
}

// situação efetiva do produto (deriva de status; cai para active quando ausente).
function effectiveStatus(row) {
  return row.status || (row.active ? 'publicado' : 'arquivado');
}
// tom explícito do badge: 'rascunho' não tem keyword no status-map (cairia em neutral),
// então alinhamos ao mesmo tom usado nos chips de filtro (publicado=success, rascunho=warning, arquivado=error).
const STATUS_TONE = { rascunho: 'warning', publicado: 'success', arquivado: 'error' };
function statusTone(status) {
  return STATUS_TONE[status] || null; // null => deixa o UiStatusBadge resolver pelo status-map
}

// ---- estado vazio contextual ----
const emptyState = computed(() =>
  activeFilterCount.value > 0
    ? {
        title: 'Nenhum produto encontrado',
        description: 'Nenhum produto corresponde aos filtros atuais. Ajuste a busca ou limpe os filtros.',
        icon: '🔍',
      }
    : {
        title: 'Nenhum produto cadastrado',
        description: 'Cadastre o primeiro produto para começar a montar seu catálogo.',
        icon: '📦',
      }
);

// ---- navegação ----
function openProduct(row) {
  router.push('/products/' + row.id);
}

// ---- ações (ativar / arquivar) ----
const busyId = ref(null);

async function archiveProduct(row) {
  const ok = await confirm({
    title: 'Arquivar produto',
    message:
      'Arquivar "' + (row.name || row.sku || 'produto') + '"? Ele deixará de ser exibido na loja, mas o histórico é preservado.',
    confirmLabel: 'Arquivar',
    cancelLabel: 'Manter ativo',
    danger: true,
  });
  if (!ok) return;
  busyId.value = row.id;
  try {
    await products.update(row.id, { active: false, status: 'arquivado' });
    toast.success('Produto arquivado.');
    await r.load();
  } catch (e) {
    toast.error('Não foi possível arquivar o produto.', { detail: e && e.message });
  } finally {
    busyId.value = null;
  }
}

async function activateProduct(row) {
  busyId.value = row.id;
  try {
    await products.update(row.id, { active: true, status: 'publicado' });
    toast.success('Produto ativado e publicado.');
    await r.load();
  } catch (e) {
    toast.error('Não foi possível ativar o produto.', { detail: e && e.message });
  } finally {
    busyId.value = null;
  }
}

onMounted(r.load);
</script>

<style scoped>
/* botão "novo produto" — ícone + */
.pl-plus { font-size: 1.05em; line-height: 1; font-weight: 700; }

/* KPIs */
.pl-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-3);
}

/* barra de busca + chips */
.pl-toolbar {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.pl-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 280px;
  min-width: 240px;
}
.pl-search-icon {
  position: absolute;
  left: var(--ui-space-3);
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-lg);
  pointer-events: none;
}
.pl-search-input {
  width: 100%;
  font: inherit;
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-2) var(--ui-space-6);
}
.pl-search-input::placeholder { color: rgb(var(--ui-faint)); }
.pl-search-input:focus { border-color: rgb(var(--ui-accent)); }
.pl-search-clear {
  position: absolute;
  right: var(--ui-space-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ui-space-5);
  height: var(--ui-space-5);
  border: none;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  cursor: pointer;
  font-size: var(--ui-text-xs);
}
.pl-search-clear:hover { background: rgb(var(--ui-border)); color: rgb(var(--ui-fg)); }

.pl-chip-groups {
  display: flex;
  align-items: center;
  gap: var(--ui-space-5);
  flex-wrap: wrap;
}
.pl-chip-group {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.pl-chip-legend {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: .04em;
}
.pl-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
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
.pl-chip:hover { border-color: rgb(var(--ui-accent)); color: rgb(var(--ui-fg)); }
.pl-chip[data-active="true"] {
  background: rgb(var(--ui-accent) / 0.12);
  border-color: rgb(var(--ui-accent));
  color: rgb(var(--ui-accent-strong));
}
.pl-chip-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgb(var(--ui-faint));
}
.pl-chip[data-tone="success"] .pl-chip-dot { background: rgb(var(--ui-ok)); }
.pl-chip[data-tone="warning"] .pl-chip-dot { background: rgb(var(--ui-warn)); }
.pl-chip[data-tone="error"] .pl-chip-dot { background: rgb(var(--ui-danger)); }
.pl-chip[data-tone="neutral"] .pl-chip-dot { background: rgb(var(--ui-faint)); }

.pl-active-filters {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  font-size: var(--ui-text-sm);
}

/* células da tabela */
.pl-sku { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }
.pl-name-cell { display: flex; flex-direction: column; gap: var(--ui-space-1); }
.pl-name { font-weight: 600; color: rgb(var(--ui-fg)); }
.pl-name-cat { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.pl-price { font-variant-numeric: tabular-nums; font-weight: 600; }

.pl-stock {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.pl-stock[data-level="ok"] { color: rgb(var(--ui-fg)); }
.pl-stock[data-level="low"] { color: rgb(var(--ui-warn)); }
.pl-stock[data-level="out"] { color: rgb(var(--ui-danger)); }
.pl-stock-tag {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .03em;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
}
.pl-stock[data-level="low"] .pl-stock-tag { background: rgb(var(--ui-warn) / 0.16); color: rgb(var(--ui-warn)); }
.pl-stock[data-level="out"] .pl-stock-tag { background: rgb(var(--ui-danger) / 0.16); color: rgb(var(--ui-danger)); }

.pl-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  flex-wrap: wrap;
}

@media (max-width: 860px) {
  .pl-toolbar { flex-direction: column; align-items: stretch; }
  .pl-chip-groups { gap: var(--ui-space-3); }
  .pl-actions { justify-content: flex-start; }
}
</style>
