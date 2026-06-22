<template>
  <UiPageLayout
    title="Produtos"
    eyebrow="StockPilot — Reposição de estoque"
    subtitle="Estoque atual e mínimo de cada produto, com semáforo de status, busca e reposição assíncrona."
    width="wide"
    :error="loadError"
    @retry="load"
  >
    <!-- ações de cabeçalho -->
    <template #actions>
      <UiButton variant="ghost" :loading="loading && hasLoadedOnce" @click="load">
        <template #icon-left><span class="pl-ic" aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton to="/products/new">
        <template #icon-left><span class="pl-ic" aria-hidden="true">＋</span></template>
        Novo produto
      </UiButton>
    </template>

    <!-- banner: alerta de ruptura (call-to-action quando há produtos zerados) -->
    <template v-if="!loading && kpis.rupture > 0" #banner>
      <div class="pl-banner" role="alert">
        <span class="pl-banner-ic" aria-hidden="true">⚠</span>
        <span class="pl-banner-text">
          <strong>{{ kpis.rupture }}</strong>
          {{ kpis.rupture === 1 ? 'produto está em ruptura' : 'produtos estão em ruptura' }}
          (estoque abaixo do mínimo, sem pedido aberto).
        </span>
        <button
          v-if="filters.status !== 'RUPTURA'"
          type="button"
          class="pl-banner-action"
          @click="setStatusFilter('RUPTURA')"
        >
          Ver só as rupturas →
        </button>
      </div>
    </template>

    <!-- KPIs derivados do estoque carregado (semáforo agregado) -->
    <section class="pl-kpis" aria-label="Resumo do estoque">
      <UiMetricCard
        label="Produtos"
        :value="loading ? null : fmtNum(kpis.total)"
        :loading="loading"
        tone="primary"
        hint="no tenant atual"
        clickable
        @click="setStatusFilter('')"
      />
      <UiMetricCard
        label="Em ruptura"
        :value="loading ? null : fmtNum(kpis.rupture)"
        :loading="loading"
        tone="error"
        hint="abaixo do mínimo, sem pedido"
        clickable
        @click="setStatusFilter('RUPTURA')"
      />
      <UiMetricCard
        label="Em alerta"
        :value="loading ? null : fmtNum(kpis.alert)"
        :loading="loading"
        tone="warning"
        hint="estoque baixo, repondo"
        clickable
        @click="setStatusFilter('ALERTA')"
      />
      <UiMetricCard
        label="Pedidos abertos"
        :value="loading ? null : fmtNum(kpis.openOrders)"
        :loading="loading"
        tone="running"
        hint="reposição em andamento"
        clickable
        @click="goToOrders"
      />
    </section>

    <!-- busca + filtro de status (SearchInput + StatusFilter) -->
    <section class="pl-toolbar" aria-label="Buscar e filtrar produtos">
      <div class="pl-search">
        <span class="pl-search-ic" aria-hidden="true">⌕</span>
        <input
          id="pl-search-input"
          ref="searchEl"
          v-model="search"
          type="search"
          class="pl-search-input"
          placeholder="Buscar por nome ou SKU…"
          aria-label="Buscar produtos por nome ou SKU"
          autocomplete="off"
          @input="onSearchInput"
          @keydown.escape="clearSearch"
        />
        <button
          v-if="search"
          type="button"
          class="pl-search-clear"
          aria-label="Limpar busca"
          @click="clearSearch"
        >
          ✕
        </button>
      </div>

      <div class="pl-statusfilter" role="group" aria-label="Filtrar por status">
        <button
          v-for="opt in statusOptions"
          :key="opt.value || 'all'"
          type="button"
          class="pl-chip"
          :data-tone="opt.tone"
          :data-active="filters.status === opt.value ? 'true' : 'false'"
          :aria-pressed="filters.status === opt.value ? 'true' : 'false'"
          @click="setStatusFilter(opt.value)"
        >
          <span v-if="opt.tone !== 'neutral'" class="pl-chip-dot" aria-hidden="true" />
          {{ opt.label }}
          <span class="pl-chip-count">{{ fmtNum(statusCounts[opt.value || 'all']) }}</span>
        </button>
      </div>
    </section>

    <!-- tabela de domínio -->
    <UiCard title="Catálogo de estoque" :subtitle="resultSummary">
      <template #actions>
        <span class="pl-legend" role="note" aria-label="Legenda do semáforo">
          <span class="pl-legend-item" data-tone="success"><span class="pl-dot" aria-hidden="true" />OK</span>
          <span class="pl-legend-item" data-tone="warning"><span class="pl-dot" aria-hidden="true" />Alerta</span>
          <span class="pl-legend-item" data-tone="error"><span class="pl-dot" aria-hidden="true" />Ruptura</span>
        </span>
      </template>

      <UiDataTable
        :columns="columns"
        :rows="pageRows"
        :loading="loading"
        row-key="id"
        clickable-rows
        :sort="sort"
        :page="page"
        :page-size="pageSize"
        :total="filteredRows.length"
        paginated
        :empty="emptyState"
        @update:sort="onSort"
        @update:page="(p) => (page = p)"
        @update:page-size="onPageSize"
        @row-click="openDetail"
      >
        <!-- Nome + SKU -->
        <template #cell-name="{ row }">
          <span class="pl-name">
            <span class="pl-name-main">{{ row.name }}</span>
            <span v-if="row.sku" class="pl-name-sku">{{ row.sku }}</span>
            <span v-else class="pl-name-nosku">sem SKU</span>
          </span>
        </template>

        <!-- Estoque atual / mínimo com barra de proporção -->
        <template #cell-stock="{ row }">
          <span class="pl-stock">
            <span class="pl-stock-fig">
              <strong class="pl-stock-cur" :data-tone="rowTone(row)">{{ fmtNum(row.current_stock) }}</strong>
              <span class="pl-stock-sep">/</span>
              <span class="pl-stock-min">{{ fmtNum(row.min_stock) }} mín.</span>
            </span>
            <span class="pl-bar" role="img" :aria-label="stockAria(row)">
              <span class="pl-bar-fill" :data-tone="rowTone(row)" :data-pct="stockBucket(row)" />
            </span>
          </span>
        </template>

        <!-- Status (semáforo) -->
        <template #cell-status="{ row }">
          <UiStatusBadge :status="row.status" :tone="statusTone(row.status)" :label="statusLabel(row.status)" />
        </template>

        <!-- Pedido aberto -->
        <template #cell-has_open_order="{ row }">
          <span class="pl-flag" :data-on="row.has_open_order ? 'true' : 'false'">
            {{ row.has_open_order ? 'Sim' : '—' }}
          </span>
        </template>

        <!-- Último pedido -->
        <template #cell-last_order_date="{ value }">
          <span :class="value ? '' : 'pl-faint'">{{ value ? fmtDateTime(value) : 'nunca' }}</span>
        </template>

        <!-- Ações por linha (RowActionMenu, CSP-safe) -->
        <template #cell-actions="{ row }">
          <div class="pl-rowactions" @click.stop>
            <UiButton
              variant="subtle"
              size="sm"
              :loading="busyId === row.id"
              :disabled="row.has_open_order || busyId === row.id"
              :title="row.has_open_order ? 'Já existe um pedido aberto para este produto' : 'Criar uma reposição'"
              @click="confirmReorder(row)"
            >
              Repor
            </UiButton>

            <div class="pl-menu" :data-open="openMenuId === row.id ? 'true' : 'false'">
              <button
                class="pl-menu-trigger"
                type="button"
                :aria-expanded="openMenuId === row.id ? 'true' : 'false'"
                aria-haspopup="menu"
                :aria-label="'Mais ações para ' + row.name"
                @click="toggleMenu(row.id)"
                @keydown.down.prevent="openMenu(row.id)"
                @keydown.up.prevent="openMenu(row.id, 'last')"
              >
                <span aria-hidden="true">⋯</span>
              </button>
              <div
                v-if="openMenuId === row.id"
                ref="menuListEl"
                class="pl-menu-list"
                role="menu"
                :aria-label="'Ações para ' + row.name"
                @keydown="onMenuKeydown"
              >
                <button class="pl-menu-item" role="menuitem" type="button" tabindex="-1" @click="suggestAi(row)">
                  <span class="pl-menu-ic" aria-hidden="true">✦</span> Sugerir quantidade (IA)
                </button>
                <button class="pl-menu-item" role="menuitem" type="button" tabindex="-1" @click="openManualOrder(row)">
                  <span class="pl-menu-ic" aria-hidden="true">＋</span> Criar pedido manual
                </button>
                <button class="pl-menu-item" role="menuitem" type="button" tabindex="-1" @click="openDetail(row)">
                  <span class="pl-menu-ic" aria-hidden="true">→</span> Ver detalhe
                </button>
                <button class="pl-menu-item" role="menuitem" type="button" tabindex="-1" @click="editProduct(row)">
                  <span class="pl-menu-ic" aria-hidden="true">✎</span> Editar produto
                </button>
              </div>
            </div>
          </div>
        </template>

        <template #empty-action>
          <UiButton v-if="hasActiveFilters" variant="ghost" @click="clearFilters">Limpar filtros</UiButton>
          <UiButton v-else to="/products/new">Cadastrar produto</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- Modal: pedido manual (POST /v1/products/{id}/order) -->
    <UiModal v-model:open="manual.open" title="Criar pedido manual" width="sm">
      <div class="pl-manual">
        <p class="pl-manual-lead">
          Abrir um pedido manual para <strong>{{ manual.product?.name }}</strong>?
          Use quando quiser repor mesmo sem ruptura. O pedido é enviado ao fornecedor de forma assíncrona.
        </p>
        <dl class="pl-manual-facts">
          <div class="pl-manual-fact">
            <dt>Estoque atual</dt>
            <dd>{{ fmtNum(manual.product?.current_stock) }}</dd>
          </div>
          <div class="pl-manual-fact">
            <dt>Estoque mínimo</dt>
            <dd>{{ fmtNum(manual.product?.min_stock) }}</dd>
          </div>
          <div class="pl-manual-fact">
            <dt>Status</dt>
            <dd>
              <UiStatusBadge
                :status="manual.product?.status"
                :tone="statusTone(manual.product?.status)"
                :label="statusLabel(manual.product?.status)"
              />
            </dd>
          </div>
        </dl>
      </div>
      <template #footer>
        <UiButton variant="ghost" :disabled="manual.busy" @click="manual.open = false">Cancelar</UiButton>
        <UiButton :loading="manual.busy" @click="submitManualOrder">Criar pedido</UiButton>
      </template>
    </UiModal>

    <!-- Modal: sugestão de reposição via IA (dry-run, grounded) -->
    <UiModal v-model:open="ai.open" :title="aiTitle" width="md">
      <div class="pl-ai">
        <UiLoadingState
          v-if="ai.loading"
          :title="'Consultando o assistente para ' + (ai.product?.name || 'o produto') + '…'"
        />

        <UiErrorState
          v-else-if="ai.error"
          :message="ai.error"
          :retryable="ai.retryable"
          @retry="ai.product && suggestAi(ai.product)"
        />

        <div v-else-if="ai.result" class="pl-ai-body">
          <p class="pl-ai-lead">
            Sugestão para <strong>{{ ai.product?.name }}</strong>. É um rascunho — nada é alterado até você confirmar a reposição.
          </p>

          <div class="pl-ai-headline">
            <div class="pl-ai-qty">
              <span class="pl-ai-qty-label">Quantidade sugerida</span>
              <span class="pl-ai-qty-value">{{ fmtNum(aiQty) }}</span>
              <span class="pl-ai-qty-unit">unidades</span>
            </div>
            <UiStatusBadge
              :tone="confidenceTone(aiConfidence)"
              :label="'Confiança: ' + confidenceLabel(aiConfidence)"
              status="info"
            />
          </div>

          <p v-if="aiRationale" class="pl-ai-rationale">{{ aiRationale }}</p>

          <div v-if="aiSources.length" class="pl-ai-sources">
            <p class="pl-ai-sources-title">Dados usados (grounding)</p>
            <ul class="pl-ai-sources-list">
              <li v-for="(s, i) in aiSources" :key="i">{{ s }}</li>
            </ul>
          </div>

          <p v-if="ai.result.model" class="pl-ai-model">Modelo: {{ ai.result.model }} · dry-run</p>
        </div>
      </div>

      <template #footer>
        <UiButton variant="ghost" @click="ai.open = false">Fechar</UiButton>
        <UiButton
          v-if="ai.result && !ai.loading && !ai.error"
          :loading="busyId === ai.product?.id"
          :disabled="ai.product?.has_open_order"
          @click="reorderFromAi"
        >
          Confirmar reposição
        </UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout, UiCard, UiMetricCard, UiDataTable, UiButton,
  UiStatusBadge, UiModal, UiLoadingState, UiErrorState,
  useToast, useConfirm, format,
} from '../ui/index.js';
import { products } from '../api.js';

const router = useRouter();
const toast = useToast();
const ask = useConfirm();

// ---- estado de dados (lista completa do tenant; backend não pagina /v1/products) ----
const allRows = ref([]);
const loading = ref(true);
const hasLoadedOnce = ref(false);
const loadError = ref(null);
const busyId = ref(null);
const openMenuId = ref(null);
const menuListEl = ref(null);
const searchEl = ref(null);

// ---- busca / filtro / ordenação / paginação (client-side, sobre a lista carregada) ----
const search = ref('');
const filters = reactive({ q: '', status: '' });
const sort = ref({ key: 'status', dir: 'asc' });
const page = ref(1);
const pageSize = ref(25);
let searchTimer = null;

const statusOptions = [
  { value: '', label: 'Todos', tone: 'neutral' },
  { value: 'RUPTURA', label: 'Ruptura', tone: 'error' },
  { value: 'ALERTA', label: 'Alerta', tone: 'warning' },
  { value: 'OK', label: 'OK', tone: 'success' },
];

const columns = [
  { key: 'name', label: 'Produto', sortable: true },
  { key: 'stock', label: 'Estoque (atual / mín.)', sortable: true },
  { key: 'status', label: 'Status', sortable: true, align: 'center' },
  { key: 'has_open_order', label: 'Pedido aberto', align: 'center' },
  { key: 'last_order_date', label: 'Último pedido', sortable: true },
  { key: 'actions', label: 'Ações', align: 'right' },
];

// peso do status p/ ordenação (urgência primeiro)
const STATUS_WEIGHT = { RUPTURA: 0, ALERTA: 1, OK: 2 };

const hasActiveFilters = computed(() => Boolean(filters.q.trim() || filters.status));

const filteredRows = computed(() => {
  const q = filters.q.trim().toLowerCase();
  const status = filters.status;
  let rows = allRows.value.filter((r) => {
    if (status && r.status !== status) return false;
    if (q) {
      const hay = (String(r.name || '') + ' ' + String(r.sku || '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const s = sort.value;
  if (s && s.key) {
    const mul = s.dir === 'desc' ? -1 : 1;
    rows = [...rows].sort((a, b) => mul * compareBy(a, b, s.key));
  }
  return rows;
});

const pageRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filteredRows.value.slice(start, start + pageSize.value);
});

function compareBy(a, b, key) {
  if (key === 'status') return (STATUS_WEIGHT[a.status] ?? 9) - (STATUS_WEIGHT[b.status] ?? 9);
  if (key === 'stock') return Number(a.current_stock) - Number(b.current_stock);
  if (key === 'last_order_date') {
    return new Date(a.last_order_date || 0).getTime() - new Date(b.last_order_date || 0).getTime();
  }
  const x = a[key], y = b[key];
  if (x == null) return 1;
  if (y == null) return -1;
  return x > y ? 1 : x < y ? -1 : 0;
}

// ---- KPIs derivados ----
const kpis = computed(() => {
  const list = allRows.value;
  return {
    total: list.length,
    rupture: list.filter((r) => r.status === 'RUPTURA').length,
    alert: list.filter((r) => r.status === 'ALERTA').length,
    openOrders: list.filter((r) => r.has_open_order).length,
  };
});

// contagem por status p/ os chips do filtro (sobre a lista carregada, ignora a busca textual)
const statusCounts = computed(() => {
  const list = allRows.value;
  return {
    all: list.length,
    RUPTURA: list.filter((r) => r.status === 'RUPTURA').length,
    ALERTA: list.filter((r) => r.status === 'ALERTA').length,
    OK: list.filter((r) => r.status === 'OK').length,
  };
});

const resultSummary = computed(() => {
  if (loading.value) return 'Carregando…';
  const n = filteredRows.value.length;
  const base = n === 1 ? '1 produto' : fmtNum(n) + ' produtos';
  return hasActiveFilters.value ? base + ' (filtrado)' : base;
});

const emptyState = computed(() =>
  hasActiveFilters.value
    ? { title: 'Nenhum produto no filtro', description: 'Ajuste a busca ou o status para ver resultados.', icon: 'search' }
    : { title: 'Nenhum produto ainda', description: 'Cadastre o primeiro produto para acompanhar o estoque.', icon: 'box' });

// ---- formatação / semáforo ----
const fmtNum = (v) => format.formatNumber(v);
const fmtDateTime = (v) => format.formatDateTime(v);

const TONE_BY_STATUS = { OK: 'success', ALERTA: 'warning', RUPTURA: 'error' };
const LABEL_BY_STATUS = { OK: 'OK', ALERTA: 'Alerta', RUPTURA: 'Ruptura' };
const statusTone = (s) => TONE_BY_STATUS[s] || 'neutral';
const statusLabel = (s) => LABEL_BY_STATUS[s] || String(s || '—');
const rowTone = (row) => statusTone(row.status);

// proporção atual/mínimo em "buckets" (0..100), só via data-attr (CSP: sem :style)
function stockBucket(row) {
  const min = Number(row.min_stock) || 0;
  const cur = Number(row.current_stock) || 0;
  if (min <= 0) return cur > 0 ? 100 : 0;
  const pct = Math.round((cur / (min * 1.5)) * 100); // mínimo*1.5 = "folga saudável"
  return Math.max(0, Math.min(100, Math.round(pct / 10) * 10));
}
const stockAria = (row) =>
  'Estoque ' + fmtNum(row.current_stock) + ' de mínimo ' + fmtNum(row.min_stock) + ', status ' + statusLabel(row.status);

// ---- carregamento ----
async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const res = await products.list();
    const data = res && res.data !== undefined ? res.data : res;
    allRows.value = Array.isArray(data) ? data : [];
    const maxPage = Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value));
    if (page.value > maxPage) page.value = maxPage;
  } catch (e) {
    loadError.value = e;
    allRows.value = [];
  } finally {
    loading.value = false;
    hasLoadedOnce.value = true;
  }
}

// ---- busca (debounced) / filtro / ordenação / paginação ----
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    filters.q = search.value;
    page.value = 1;
  }, 220);
}
function clearSearch() {
  search.value = '';
  filters.q = '';
  page.value = 1;
}
function clearFilters() {
  clearSearch();
  filters.status = '';
}
function setStatusFilter(status) {
  filters.status = filters.status === status && status !== '' ? '' : status;
  page.value = 1;
}
function onSort(s) { sort.value = s; page.value = 1; }
function onPageSize(ps) { pageSize.value = ps; page.value = 1; }

// reposiciona a página se ela ficar vazia após filtrar
watch([filteredRows, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value));
  if (page.value > maxPage) page.value = maxPage;
});

// ---- menu de ações por linha (menu acessível: foco no 1º item ao abrir; setas/Home/End navegam;
//      Esc/Tab fecham e devolvem o foco ao gatilho — padrão SICAT/GymOps) ----
function menuItems() {
  return menuListEl.value ? Array.from(menuListEl.value.querySelectorAll('[role="menuitem"]')) : [];
}
function focusMenuItem(index) {
  const items = menuItems();
  if (!items.length) return;
  const i = (index + items.length) % items.length;
  items[i].focus();
}
function currentTrigger() {
  // o gatilho (⋯) da linha cujo menu está aberto (só um existe por vez via v-if),
  // p/ devolver o foco ao fechar pelo teclado
  return menuListEl.value
    ? menuListEl.value.parentElement?.querySelector('.pl-menu-trigger') || null
    : null;
}
async function openMenu(id, focusTarget = 'first') {
  openMenuId.value = id;
  await nextTick();
  focusMenuItem(focusTarget === 'last' ? -1 : 0);
}
function toggleMenu(id) {
  if (openMenuId.value === id) closeMenu();
  else openMenu(id);
}
function closeMenu(restoreFocus = false) {
  const trigger = restoreFocus ? currentTrigger() : null;
  openMenuId.value = null;
  if (trigger) nextTick(() => trigger.focus());
}
function onMenuKeydown(e) {
  const items = menuItems();
  if (!items.length) return;
  const current = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); focusMenuItem(current + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); focusMenuItem(current - 1); }
  else if (e.key === 'Home') { e.preventDefault(); focusMenuItem(0); }
  else if (e.key === 'End') { e.preventDefault(); focusMenuItem(-1); }
  else if (e.key === 'Tab' || e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
}
function onDocClick() { closeMenu(); }
function onEsc(e) { if (e.key === 'Escape' && openMenuId.value !== null) closeMenu(true); }
onMounted(() => {
  load();
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onEsc);
});
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onEsc);
});

// ---- navegação (sempre rotas de DOMÍNIO) ----
const openDetail = (row) => { closeMenu(); router.push('/products/' + row.id); };
const editProduct = (row) => { closeMenu(); router.push('/products/' + row.id + '/edit'); };
const goToOrders = () => router.push('/orders');

// ---- reposição (POST /v1/products/{id}/reorder) ----
async function confirmReorder(row) {
  closeMenu();
  const ok = await ask({
    title: 'Repor estoque',
    message: 'Criar uma reposição para "' + row.name + '"? O pedido será enviado ao fornecedor de forma assíncrona.',
    confirmLabel: 'Repor agora',
  });
  if (!ok) return;
  await doReorder(row);
}

async function doReorder(row) {
  busyId.value = row.id;
  try {
    const res = await products.reorder(row.id);
    if (res && res.deduped) {
      toast.info('Já havia uma reposição aberta para "' + row.name + '".', { detail: 'Pedido existente reaproveitado.' });
    } else {
      toast.success('Reposição criada para "' + row.name + '".', { detail: 'O fornecedor será acionado em segundo plano.' });
    }
    await load();
  } catch (e) {
    toast.error('Falha ao repor "' + row.name + '".', { detail: errMsg(e), code: e && e.status ? String(e.status) : '' });
  } finally {
    busyId.value = null;
  }
}

// ---- pedido manual (POST /v1/products/{id}/order) ----
const manual = reactive({ open: false, busy: false, product: null });
function openManualOrder(row) {
  closeMenu();
  manual.product = row;
  manual.busy = false;
  manual.open = true;
}
async function submitManualOrder() {
  const row = manual.product;
  if (!row) return;
  manual.busy = true;
  try {
    await products.order(row.id);
    toast.success('Pedido manual criado para "' + row.name + '".', { detail: 'Acompanhe o andamento na lista de pedidos.' });
    manual.open = false;
    await load();
  } catch (e) {
    toast.error('Falha ao criar pedido para "' + row.name + '".', { detail: errMsg(e), code: e && e.status ? String(e.status) : '' });
  } finally {
    manual.busy = false;
  }
}

// ---- sugestão via IA (POST /v1/products/{id}/suggest-reorder) — dry-run ----
const ai = reactive({ open: false, loading: false, error: null, retryable: true, result: null, product: null });
const aiTitle = computed(() => (ai.product ? 'Sugestão de reposição — ' + ai.product.name : 'Sugestão de reposição'));
const aiSuggestion = computed(() => (ai.result && ai.result.suggestion) || {});
const aiQty = computed(() => aiSuggestion.value.suggested_quantity ?? 0);
const aiRationale = computed(() => aiSuggestion.value.rationale || '');
const aiConfidence = computed(() => aiSuggestion.value.confidence || '');
const aiSources = computed(() => {
  const r = ai.result;
  if (!r) return [];
  const fromSuggestion = (r.suggestion && r.suggestion.sources) || [];
  const fromGrounding = (r.grounding && r.grounding.sources) || [];
  return fromSuggestion.length ? fromSuggestion : fromGrounding;
});

const CONF_TONE = { high: 'success', medium: 'warning', low: 'error' };
const CONF_LABEL = { high: 'alta', medium: 'média', low: 'baixa' };
const confidenceTone = (c) => CONF_TONE[c] || 'neutral';
const confidenceLabel = (c) => CONF_LABEL[c] || String(c || '—');

async function suggestAi(row) {
  closeMenu();
  ai.product = row;
  ai.open = true;
  ai.loading = true;
  ai.error = null;
  ai.retryable = true;
  ai.result = null;
  try {
    ai.result = await products.suggestReorder(row.id);
  } catch (e) {
    ai.error = aiErrMsg(e);
    ai.retryable = !(e && e.status === 503);
  } finally {
    ai.loading = false;
  }
}

async function reorderFromAi() {
  const row = ai.product;
  if (!row) return;
  ai.open = false;
  await doReorder(row);
}

// ---- helpers de erro ----
function errMsg(e) {
  if (!e) return 'Erro desconhecido.';
  return e.message || 'Erro inesperado.';
}
function aiErrMsg(e) {
  if (e && e.status === 503) return 'O assistente de IA está indisponível (chave não configurada). A reposição manual continua funcionando.';
  if (e && e.status === 502) return 'A IA retornou uma resposta inválida. Tente novamente em instantes.';
  return errMsg(e);
}
</script>

<style scoped>
.pl-ic { font-size: var(--ui-text-md); line-height: 1; }
.pl-faint { color: rgb(var(--ui-faint)); }

/* banner de ruptura */
.pl-banner {
  display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap;
  background: rgb(var(--ui-danger) / 0.10);
  border: 1px solid rgb(var(--ui-danger) / 0.28);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.pl-banner-ic { color: rgb(var(--ui-danger)); font-size: var(--ui-text-lg); line-height: 1; }
.pl-banner-text { color: rgb(var(--ui-fg)); font-size: var(--ui-text-sm); }
.pl-banner-action {
  margin-left: auto; background: transparent; border: none; cursor: pointer;
  color: rgb(var(--ui-danger)); font: inherit; font-size: var(--ui-text-sm); font-weight: 700;
  padding: 4px 8px; border-radius: var(--ui-radius-sm);
}
.pl-banner-action:hover { background: rgb(var(--ui-danger) / 0.12); }

/* KPIs */
.pl-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}

/* toolbar: busca + filtro de status */
.pl-toolbar {
  display: flex; align-items: center; gap: var(--ui-space-4); flex-wrap: wrap;
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-3) var(--ui-space-4);
}

.pl-search {
  position: relative; display: flex; align-items: center;
  flex: 1 1 280px; min-width: 220px;
}
.pl-search-ic {
  position: absolute; left: 12px; color: rgb(var(--ui-muted));
  font-size: var(--ui-text-lg); line-height: 1; pointer-events: none;
}
.pl-search-input {
  width: 100%; font: inherit; font-size: var(--ui-text-sm);
  background: rgb(var(--ui-bg)); color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong)); border-radius: var(--ui-radius-md);
  padding: 9px 34px 9px 36px;
}
.pl-search-input::placeholder { color: rgb(var(--ui-faint)); }
.pl-search-input::-webkit-search-cancel-button { appearance: none; }
.pl-search-clear {
  position: absolute; right: 8px; display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0;
  background: transparent; border: none; cursor: pointer;
  color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); border-radius: var(--ui-radius-pill);
}
.pl-search-clear:hover { background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-fg)); }

/* StatusFilter — segmented chips */
.pl-statusfilter { display: inline-flex; gap: var(--ui-space-2); flex-wrap: wrap; }
.pl-chip {
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit; font-size: var(--ui-text-xs); font-weight: 600;
  padding: 6px 12px; cursor: pointer;
  background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-muted));
  border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-pill);
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.pl-chip:hover { color: rgb(var(--ui-fg)); border-color: rgb(var(--ui-border-strong)); }
.pl-chip-dot { width: 7px; height: 7px; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-faint)); }
.pl-chip[data-tone="success"] .pl-chip-dot { background: rgb(var(--ui-ok)); }
.pl-chip[data-tone="warning"] .pl-chip-dot { background: rgb(var(--ui-warn)); }
.pl-chip[data-tone="error"] .pl-chip-dot { background: rgb(var(--ui-danger)); }
.pl-chip-count {
  font-size: var(--ui-text-xs); font-weight: 700; padding: 1px 6px;
  background: rgb(var(--ui-bg)); color: rgb(var(--ui-muted));
  border-radius: var(--ui-radius-pill);
}
.pl-chip[data-active="true"] {
  background: rgb(var(--ui-accent)); color: rgb(var(--ui-accent-fg));
  border-color: rgb(var(--ui-accent));
}
.pl-chip[data-active="true"] .pl-chip-count { background: rgb(var(--ui-accent-fg) / 0.18); color: rgb(var(--ui-accent-fg)); }
.pl-chip[data-active="true"] .pl-chip-dot { background: rgb(var(--ui-accent-fg)); }

/* legenda do semáforo */
.pl-legend { display: inline-flex; gap: var(--ui-space-3); flex-wrap: wrap; }
.pl-legend-item {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--ui-text-xs); font-weight: 600; color: rgb(var(--ui-muted));
}
.pl-dot { width: 8px; height: 8px; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-faint)); }
.pl-legend-item[data-tone="success"] .pl-dot { background: rgb(var(--ui-ok)); }
.pl-legend-item[data-tone="warning"] .pl-dot { background: rgb(var(--ui-warn)); }
.pl-legend-item[data-tone="error"] .pl-dot { background: rgb(var(--ui-danger)); }

/* coluna nome + sku */
.pl-name { display: flex; flex-direction: column; gap: 2px; }
.pl-name-main { font-weight: 600; color: rgb(var(--ui-fg)); }
.pl-name-sku {
  font-size: var(--ui-text-xs); color: rgb(var(--ui-muted));
  font-family: var(--ui-font-display); letter-spacing: .02em;
}
.pl-name-nosku { font-size: var(--ui-text-xs); color: rgb(var(--ui-faint)); font-style: italic; }

/* coluna estoque + barra */
.pl-stock { display: flex; flex-direction: column; gap: 5px; min-width: 150px; }
.pl-stock-fig { display: inline-flex; align-items: baseline; gap: 5px; font-size: var(--ui-text-sm); }
.pl-stock-cur { font-family: var(--ui-font-display); font-size: var(--ui-text-md); }
.pl-stock-cur[data-tone="success"] { color: rgb(var(--ui-ok)); }
.pl-stock-cur[data-tone="warning"] { color: rgb(var(--ui-warn)); }
.pl-stock-cur[data-tone="error"] { color: rgb(var(--ui-danger)); }
.pl-stock-cur[data-tone="neutral"] { color: rgb(var(--ui-fg)); }
.pl-stock-sep { color: rgb(var(--ui-faint)); }
.pl-stock-min { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }

.pl-bar {
  display: block; height: 6px; width: 100%;
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-pill); overflow: hidden;
}
.pl-bar-fill { display: block; height: 100%; border-radius: var(--ui-radius-pill); transition: width .25s ease; }
.pl-bar-fill[data-tone="success"] { background: rgb(var(--ui-ok)); }
.pl-bar-fill[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.pl-bar-fill[data-tone="error"] { background: rgb(var(--ui-danger)); }
.pl-bar-fill[data-tone="neutral"] { background: rgb(var(--ui-faint)); }
.pl-bar-fill[data-pct="0"] { width: 0; }
.pl-bar-fill[data-pct="10"] { width: 10%; }
.pl-bar-fill[data-pct="20"] { width: 20%; }
.pl-bar-fill[data-pct="30"] { width: 30%; }
.pl-bar-fill[data-pct="40"] { width: 40%; }
.pl-bar-fill[data-pct="50"] { width: 50%; }
.pl-bar-fill[data-pct="60"] { width: 60%; }
.pl-bar-fill[data-pct="70"] { width: 70%; }
.pl-bar-fill[data-pct="80"] { width: 80%; }
.pl-bar-fill[data-pct="90"] { width: 90%; }
.pl-bar-fill[data-pct="100"] { width: 100%; }

/* flag pedido aberto */
.pl-flag { font-size: var(--ui-text-sm); color: rgb(var(--ui-faint)); }
.pl-flag[data-on="true"] { color: rgb(var(--ui-accent-strong)); font-weight: 600; }

/* ações por linha */
.pl-rowactions { display: inline-flex; align-items: center; gap: var(--ui-space-2); justify-content: flex-end; }
/* o menu é ancorado à DIREITA (right:0) e abre para a esquerda a partir da última coluna
   (right-aligned), então permanece dentro da largura da tabela e não cruza a borda direita;
   o ancestral .ui-dt-scroll só faz overflow-x, logo o corpo do menu não é cortado verticalmente.
   data-open eleva o stacking da célula ativa acima do thead sticky (que não declara z-index). */
.pl-menu { position: relative; }
.pl-menu[data-open="true"] { z-index: var(--ui-z-bar); }
.pl-menu-trigger {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; padding: 0;
  background: transparent; border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm); color: rgb(var(--ui-muted));
  cursor: pointer; font-size: var(--ui-text-lg); line-height: 1;
}
.pl-menu-trigger:hover { background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-fg)); }
.pl-menu-trigger:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }

.pl-menu-list {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: var(--ui-z-bar);
  min-width: 232px; display: flex; flex-direction: column;
  background: rgb(var(--ui-surface)); border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md); box-shadow: var(--ui-shadow-md);
  padding: var(--ui-space-1); overflow: hidden;
}
.pl-menu-item {
  display: flex; align-items: center; gap: var(--ui-space-2);
  width: 100%; text-align: left;
  background: transparent; border: none; cursor: pointer;
  padding: 8px 10px; border-radius: var(--ui-radius-sm);
  color: rgb(var(--ui-fg)); font: inherit; font-size: var(--ui-text-sm);
}
.pl-menu-item:hover { background: rgb(var(--ui-accent) / 0.10); color: rgb(var(--ui-accent-strong)); }
.pl-menu-item:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: -2px; }
.pl-menu-ic { width: 16px; text-align: center; color: rgb(var(--ui-accent-strong)); }

/* modal de pedido manual */
.pl-manual { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.pl-manual-lead { margin: 0; color: rgb(var(--ui-fg)); font-size: var(--ui-text-sm); line-height: 1.55; }
.pl-manual-facts {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--ui-space-3); margin: 0;
}
.pl-manual-fact {
  display: flex; flex-direction: column; gap: 4px;
  background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md); padding: var(--ui-space-3);
}
.pl-manual-fact dt { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); text-transform: uppercase; letter-spacing: .04em; font-weight: 700; }
.pl-manual-fact dd { margin: 0; font-family: var(--ui-font-display); font-size: var(--ui-text-md); font-weight: 700; color: rgb(var(--ui-fg)); }

/* modal de IA */
.pl-ai { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.pl-ai-body { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.pl-ai-lead { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.pl-ai-headline {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-4);
  flex-wrap: wrap;
  background: rgb(var(--ui-accent) / 0.08);
  border: 1px solid rgb(var(--ui-accent) / 0.22);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-4) var(--ui-space-5);
}
.pl-ai-qty { display: inline-flex; align-items: baseline; gap: var(--ui-space-2); flex-wrap: wrap; }
.pl-ai-qty-label { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); text-transform: uppercase; letter-spacing: .05em; font-weight: 700; }
.pl-ai-qty-value { font-family: var(--ui-font-display); font-size: var(--ui-text-xl); font-weight: 700; color: rgb(var(--ui-accent-strong)); }
.pl-ai-qty-unit { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.pl-ai-rationale { margin: 0; color: rgb(var(--ui-fg)); line-height: 1.55; }
.pl-ai-sources {
  background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md); padding: var(--ui-space-3) var(--ui-space-4);
}
.pl-ai-sources-title { margin: 0 0 var(--ui-space-2); font-size: var(--ui-text-xs); font-weight: 700; color: rgb(var(--ui-muted)); text-transform: uppercase; letter-spacing: .04em; }
.pl-ai-sources-list { margin: 0; padding-left: var(--ui-space-5); display: flex; flex-direction: column; gap: 3px; }
.pl-ai-sources-list li { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }
.pl-ai-model { margin: 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-faint)); }

@media (max-width: 860px) {
  .pl-toolbar { align-items: stretch; }
  .pl-statusfilter { justify-content: flex-start; }
  .pl-stock { min-width: 120px; }
  .pl-menu-list { min-width: 200px; }
  .pl-manual-facts { grid-template-columns: 1fr; }
}
</style>
