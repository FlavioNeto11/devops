<template>
  <UiPageLayout
    eyebrow="Catálogo"
    title="Produtos"
    subtitle="Busque, filtre e gerencie todo o catálogo da loja em um só lugar."
    width="wide"
    :error="r.error.value"
    @retry="r.load"
  >
    <!-- ações de cabeçalho: atualizar, exportar e o CTA em destaque -->
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="r.refresh">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton
        variant="subtle"
        :disabled="!rows.length || r.loading.value"
        @click="exportCsv"
      >
        <template #icon-left><span aria-hidden="true">⬇</span></template>
        Exportar CSV
      </UiButton>
      <UiButton variant="primary" to="/products/new">
        <template #icon-left><span class="pl-plus" aria-hidden="true">+</span></template>
        Novo produto
      </UiButton>
    </template>

    <!-- KPIs derivados da página corrente -->
    <template #banner>
      <div class="pl-kpis" role="group" aria-label="Indicadores do catálogo">
        <UiMetricCard
          label="Produtos no catálogo"
          :value="kpis.total"
          tone="primary"
          hint="total filtrado"
          :loading="r.loading.value"
        />
        <UiMetricCard
          label="Publicados"
          :value="kpis.published"
          tone="success"
          hint="visíveis na loja"
          :loading="r.loading.value"
        />
        <UiMetricCard
          label="Estoque baixo"
          :value="kpis.lowStock"
          tone="warning"
          :hint="'≤ ' + LOW_STOCK_THRESHOLD + ' un. nesta página'"
          :loading="r.loading.value"
        />
        <UiMetricCard
          label="Sem estoque"
          :value="kpis.outOfStock"
          tone="error"
          hint="esgotados nesta página"
          :loading="r.loading.value"
        />
      </div>
    </template>

    <!-- Busca (SearchBar) + chips (FilterChips) + filtros avançados (FiltersPanel) -->
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

      <div v-if="activeFilterCount > 0" class="pl-active-filters" role="status">
        <span class="ui-muted">{{ activeFilterCount }} filtro(s) ativo(s) — {{ resultSummary }}</span>
        <UiButton variant="subtle" size="sm" @click="resetAllFilters">Limpar tudo</UiButton>
      </div>
    </template>

    <!-- barra de ações em massa (aparece com seleção) -->
    <div v-if="selected.length" class="pl-bulkbar" role="region" aria-label="Ações em massa">
      <span class="pl-bulkbar-count">{{ selected.length }} selecionado(s)</span>
      <div class="pl-bulkbar-actions">
        <UiButton
          variant="primary"
          size="sm"
          :loading="bulkBusy"
          :disabled="!selectedHasInactive"
          @click="bulkSet(true)"
        >Ativar</UiButton>
        <UiButton
          variant="danger"
          size="sm"
          :loading="bulkBusy"
          :disabled="!selectedHasActive"
          @click="bulkSet(false)"
        >Arquivar</UiButton>
        <UiButton variant="ghost" size="sm" @click="clearSelection">Limpar seleção</UiButton>
      </div>
    </div>

    <!-- Tabela de dados: loading / empty / error / normal todos cobertos -->
    <UiDataTable
      :columns="columns"
      :rows="rows"
      row-key="id"
      :loading="r.loading.value"
      :error="null"
      :density="density"
      selectable
      :selected="selected"
      clickable-rows
      server-mode
      :sort="r.sort.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      paginated
      :empty="emptyState"
      @update:selected="onSelected"
      @update:sort="r.setSort"
      @update:page="r.setPage"
      @update:page-size="onPageSize"
      @row-click="quickView"
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
          :label="statusLabel(effectiveStatus(row))"
        />
      </template>

      <template #cell-active="{ row }">
        <UiStatusBadge
          :status="row.active ? 'ativo' : 'inativo'"
          :label="row.active ? 'Ativo' : 'Inativo'"
          size="sm"
        />
      </template>

      <template #cell-actions="{ row }">
        <div class="pl-actions" @click.stop>
          <UiButton variant="ghost" size="sm" @click="quickView(row)">Ver</UiButton>
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
      <div class="pl-foot">
        <span>{{ resultSummary }}</span>
        <button
          class="pl-density"
          type="button"
          :aria-pressed="density === 'compact'"
          @click="toggleDensity"
        >
          <span aria-hidden="true">⊟</span>
          {{ density === 'compact' ? 'Densidade confortável' : 'Densidade compacta' }}
        </button>
      </div>
    </template>

    <!-- Visão rápida do produto (modal) -->
    <UiModal v-model:open="quickOpen" :title="quickTitle" width="md">
      <UiLoadingState v-if="quickLoading" variant="spinner" />
      <UiErrorState
        v-else-if="quickError"
        :message="quickError"
        @retry="reloadQuick"
      />
      <dl v-else-if="quickItem" class="pl-detail">
        <div class="pl-detail-row">
          <dt>SKU</dt>
          <dd class="ui-mono">{{ quickItem.sku || '—' }}</dd>
        </div>
        <div class="pl-detail-row">
          <dt>Nome</dt>
          <dd>{{ quickItem.name || '—' }}</dd>
        </div>
        <div class="pl-detail-row">
          <dt>Categoria</dt>
          <dd>{{ quickItem.category || '—' }}</dd>
        </div>
        <div v-if="quickItem.description" class="pl-detail-row">
          <dt>Descrição</dt>
          <dd>{{ quickItem.description }}</dd>
        </div>
        <div class="pl-detail-row">
          <dt>Preço</dt>
          <dd class="pl-price">{{ format.formatCurrency(quickItem.price) }}</dd>
        </div>
        <div class="pl-detail-row">
          <dt>Custo</dt>
          <dd>{{ quickItem.cost != null && quickItem.cost !== '' ? format.formatCurrency(quickItem.cost) : '—' }}</dd>
        </div>
        <div class="pl-detail-row">
          <dt>Margem</dt>
          <dd>{{ marginText(quickItem) }}</dd>
        </div>
        <div class="pl-detail-row">
          <dt>Estoque</dt>
          <dd>
            <span class="pl-stock" :data-level="stockLevel(quickStock)">
              {{ format.formatNumber(quickStock) }}
              <span v-if="stockLevel(quickStock) === 'out'" class="pl-stock-tag">esgotado</span>
              <span v-else-if="stockLevel(quickStock) === 'low'" class="pl-stock-tag">baixo</span>
            </span>
          </dd>
        </div>
        <div class="pl-detail-row">
          <dt>Situação</dt>
          <dd>
            <UiStatusBadge
              :status="effectiveStatus(quickItem)"
              :tone="statusTone(effectiveStatus(quickItem))"
              :label="statusLabel(effectiveStatus(quickItem))"
            />
          </dd>
        </div>
        <div class="pl-detail-row">
          <dt>Disponibilidade</dt>
          <dd>
            <UiStatusBadge
              :status="quickItem.active ? 'ativo' : 'inativo'"
              :label="quickItem.active ? 'Ativo' : 'Inativo'"
              size="sm"
            />
          </dd>
        </div>
        <div class="pl-detail-row">
          <dt>Criado em</dt>
          <dd>{{ format.formatDateTime(quickCreatedAt) }}</dd>
        </div>
      </dl>
      <template #footer>
        <UiButton
          v-if="quickItem && quickItem.active"
          variant="danger"
          :loading="busyId === quickItem.id"
          @click="archiveProduct(quickItem)"
        >Arquivar</UiButton>
        <UiButton
          v-else-if="quickItem"
          variant="primary"
          :loading="busyId === quickItem.id"
          @click="activateProduct(quickItem)"
        >Ativar</UiButton>
        <UiButton v-if="quickItem" variant="subtle" :to="'/products/' + quickItem.id + '/edit'">Editar</UiButton>
        <UiButton variant="ghost" @click="quickOpen = false">Fechar</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiDataTable,
  UiButton,
  UiMetricCard,
  UiStatusBadge,
  UiFiltersPanel,
  UiModal,
  UiLoadingState,
  UiErrorState,
  useResource,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import { products } from '../api.js';

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
function normalize(row) {
  return {
    ...row,
    stockQty: row.stockQty ?? row.stock_qty,
    createdAt: row.createdAt ?? row.created_at,
  };
}
const rows = computed(() => (r.items.value || []).map(normalize));

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
  clearSelection();
  r.setFilters({ q: searchInput.value.trim() });
}
function clearSearch() {
  searchInput.value = '';
  clearSelection();
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
  clearSelection();
  r.setFilters({ status: value });
}
function setActive(value) {
  filters.active = value;
  clearSelection();
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
  clearSelection();
  r.setFilters(next);
}
function clearAdvanced() {
  advancedFilters.value = { category: '', q: '' };
  searchInput.value = '';
  clearSelection();
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
  clearSelection();
  r.setFilters({ q: '', status: '', active: '', category: '' });
}

// ---- paginação + densidade ----
function onPageSize(size) {
  r.pageSize.value = size;
  clearSelection();
  r.setPage(1);
}
const density = ref('comfortable');
function toggleDensity() {
  density.value = density.value === 'compact' ? 'comfortable' : 'compact';
}

// ---- resumo de resultados ----
const resultSummary = computed(() => {
  if (r.loading.value) return 'Carregando…';
  if (!r.total.value) return 'Nenhum produto';
  const shown = rows.value.length;
  return shown + ' nesta página · ' + r.total.value + ' no total';
});

// ---- KPIs (derivados da página carregada) ----
const kpis = computed(() => {
  const list = rows.value;
  return {
    total: r.total.value || list.length,
    published: list.filter((x) => effectiveStatus(x) === 'publicado').length,
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
// tom + rótulo explícitos do badge: 'rascunho' não tem keyword no status-map (cairia em neutral),
// então alinhamos ao mesmo tom usado nos chips (publicado=success, rascunho=warning, arquivado=error).
const STATUS_TONE = { rascunho: 'warning', publicado: 'success', arquivado: 'error' };
const STATUS_LABEL = { rascunho: 'Rascunho', publicado: 'Publicado', arquivado: 'Arquivado' };
function statusTone(status) {
  return STATUS_TONE[status] || null; // null => deixa o UiStatusBadge resolver pelo status-map
}
function statusLabel(status) {
  return STATUS_LABEL[status] || format.humanize(status);
}

// margem (preço − custo) — só quando há custo informado.
function marginText(p) {
  const price = Number(p.price);
  const cost = p.cost == null || p.cost === '' ? null : Number(p.cost);
  if (!isFinite(price) || cost == null || !isFinite(cost)) return '—';
  const abs = price - cost;
  const pct = price > 0 ? Math.round((abs / price) * 100) : 0;
  return format.formatCurrency(abs) + ' (' + pct + '%)';
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

// ---- seleção em massa ----
const selected = ref([]);
function onSelected(next) {
  selected.value = next;
}
function clearSelection() {
  selected.value = [];
}
const selectedHasActive = computed(() => selected.value.some((p) => p.active));
const selectedHasInactive = computed(() => selected.value.some((p) => !p.active));
const bulkBusy = ref(false);

async function bulkSet(activate) {
  const targets = selected.value.filter((p) => (activate ? !p.active : p.active));
  if (!targets.length) return;
  const verb = activate ? 'ativar' : 'arquivar';
  const ok = await confirm({
    title: (activate ? 'Ativar' : 'Arquivar') + ' ' + targets.length + ' produto(s)',
    message:
      (activate
        ? 'Ativar e publicar ' + targets.length + ' produto(s)? Eles voltarão a ser exibidos na loja.'
        : 'Arquivar ' + targets.length + ' produto(s)? Eles deixarão de ser exibidos na loja, mas o histórico é preservado.'),
    confirmLabel: activate ? 'Ativar' : 'Arquivar',
    cancelLabel: 'Cancelar',
    danger: !activate,
  });
  if (!ok) return;
  bulkBusy.value = true;
  const payload = activate ? { active: true, status: 'publicado' } : { active: false, status: 'arquivado' };
  let done = 0;
  const failed = [];
  for (const p of targets) {
    try {
      await products.update(p.id, payload);
      done += 1;
    } catch {
      failed.push(p.sku || p.name || p.id);
    }
  }
  bulkBusy.value = false;
  clearSelection();
  if (done) toast.success(done + ' produto(s) ' + (activate ? 'ativado(s).' : 'arquivado(s).'));
  if (failed.length) {
    toast.error('Falha em ' + failed.length + ' produto(s).', { detail: failed.join(', ') });
  }
  await r.load();
}

// ---- visão rápida (modal: GET /v1/products/:id) ----
const quickOpen = ref(false);
const quickItem = ref(null);
const quickLoading = ref(false);
const quickError = ref('');
let lastQuickId = null;
const quickTitle = computed(() =>
  quickItem.value ? quickItem.value.name || ('Produto ' + (quickItem.value.sku || quickItem.value.id)) : 'Produto'
);
const quickStock = computed(() =>
  quickItem.value ? Number(quickItem.value.stockQty ?? quickItem.value.stock_qty ?? 0) : 0
);
const quickCreatedAt = computed(() =>
  quickItem.value ? quickItem.value.createdAt ?? quickItem.value.created_at : null
);

async function quickView(row) {
  quickOpen.value = true;
  lastQuickId = row.id;
  quickItem.value = normalize(row); // mostra o que já temos, então refina com o get
  quickError.value = '';
  quickLoading.value = true;
  try {
    quickItem.value = normalize(await products.get(row.id));
  } catch (e) {
    quickError.value = (e && e.message) || 'Não foi possível carregar o produto.';
  } finally {
    quickLoading.value = false;
  }
}
function reloadQuick() {
  if (lastQuickId != null) quickView({ id: lastQuickId });
}

// ---- ações por linha (ativar / arquivar) ----
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
    if (quickItem.value && quickItem.value.id === row.id) {
      quickItem.value = { ...quickItem.value, active: false, status: 'arquivado' };
    }
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
    if (quickItem.value && quickItem.value.id === row.id) {
      quickItem.value = { ...quickItem.value, active: true, status: 'publicado' };
    }
    await r.load();
  } catch (e) {
    toast.error('Não foi possível ativar o produto.', { detail: e && e.message });
  } finally {
    busyId.value = null;
  }
}

// ---- exportar CSV (cliente, sobre as linhas carregadas; CSP-safe via Blob) ----
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCsv() {
  const list = rows.value;
  if (!list.length) {
    toast.warning('Nada para exportar.');
    return;
  }
  const head = ['SKU', 'Nome', 'Categoria', 'Preço', 'Custo', 'Estoque', 'Situação', 'Ativo', 'Criado em'];
  const lines = [head.join(';')];
  for (const p of list) {
    lines.push(
      [
        csvCell(p.sku),
        csvCell(p.name),
        csvCell(p.category),
        csvCell(p.price),
        csvCell(p.cost),
        csvCell(p.stockQty),
        csvCell(statusLabel(effectiveStatus(p))),
        csvCell(p.active ? 'Sim' : 'Não'),
        csvCell(p.createdAt),
      ].join(';'),
    );
  }
  try {
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'produtos-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado (' + list.length + ' produtos).');
  } catch (e) {
    toast.error('Falha ao exportar CSV.', { detail: e && e.message });
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
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
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
  flex-wrap: wrap;
}

/* barra de ações em massa */
.pl-bulkbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-accent) / 0.10);
  border: 1px solid rgb(var(--ui-accent) / 0.45);
  border-radius: var(--ui-radius-lg);
}
.pl-bulkbar-count {
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-sm);
}
.pl-bulkbar-actions {
  display: inline-flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
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

/* rodapé: resumo + alternador de densidade */
.pl-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.pl-density {
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
}
.pl-density:hover { border-color: rgb(var(--ui-accent)); color: rgb(var(--ui-fg)); }
.pl-density[aria-pressed="true"] {
  background: rgb(var(--ui-accent) / 0.12);
  border-color: rgb(var(--ui-accent));
  color: rgb(var(--ui-accent-strong));
}

/* detalhe da visão rápida */
.pl-detail {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
}
.pl-detail-row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: var(--ui-space-3);
  align-items: center;
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.pl-detail-row:last-child { border-bottom: none; }
.pl-detail dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.pl-detail dd { margin: 0; }

@media (max-width: 860px) {
  .pl-toolbar { flex-direction: column; align-items: stretch; }
  .pl-chip-groups { gap: var(--ui-space-3); }
  .pl-actions { justify-content: flex-start; }
  .pl-detail-row { grid-template-columns: 1fr; gap: 2px; }
}
</style>
