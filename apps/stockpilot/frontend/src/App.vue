<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from './api.js';

const activeTab = ref('produtos');
const TABS = [
  { key: 'produtos', label: 'Produtos' },
  { key: 'pedidos', label: 'Pedidos' },
  { key: 'alertas', label: 'Alertas' },
];

// Produtos
const products = ref([]);
const productsLoading = ref(false);
const productsError = ref(null);
const filterStatus = ref('');
const sortBy = ref('name');
const sortDir = ref('asc');

const filteredProducts = computed(() => {
  let list = filterStatus.value
    ? products.value.filter((p) => p.status === filterStatus.value)
    : [...products.value];
  list.sort((a, b) => {
    let va = a[sortBy.value] ?? '';
    let vb = b[sortBy.value] ?? '';
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
    return sortDir.value === 'asc' ? cmp : -cmp;
  });
  return list;
});

async function loadProducts() {
  productsLoading.value = true;
  productsError.value = null;
  try {
    products.value = await api.products.list();
  } catch (e) {
    productsError.value = e.message;
  } finally {
    productsLoading.value = false;
  }
}

async function createOrder(product) {
  try {
    await api.products.createOrder(product.id);
    await Promise.all([loadProducts(), loadOrders(), loadAlerts()]);
  } catch (e) {
    alert('Erro ao criar pedido: ' + e.message);
  }
}

// Assistente de IA (REQ-STOCKPILOT-0008): sugere quantidade de reposição (dry-run, não cria pedido).
const suggestingId = ref(null);
const suggestions = ref({});
async function suggestReorder(product) {
  suggestingId.value = product.id;
  try {
    const r = await api.products.suggestReorder(product.id);
    suggestions.value = { ...suggestions.value, [product.id]: r.suggestion || r };
  } catch (e) {
    if (e.status === 503) alert('Assistente de IA indisponível (sem chave configurada).');
    else alert('Erro na sugestão de IA: ' + e.message);
  } finally {
    suggestingId.value = null;
  }
}

function toggleSort(field) {
  if (sortBy.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = field;
    sortDir.value = 'asc';
  }
}

function sortIcon(field) {
  if (sortBy.value !== field) return '⇅';
  return sortDir.value === 'asc' ? '▲' : '▼';
}

// Pedidos
const orders = ref([]);
const ordersLoading = ref(false);
const ordersError = ref(null);

async function loadOrders() {
  ordersLoading.value = true;
  ordersError.value = null;
  try {
    orders.value = await api.orders.list();
  } catch (e) {
    ordersError.value = e.message;
  } finally {
    ordersLoading.value = false;
  }
}

// Alertas
const alerts = ref([]);
const alertsLoading = ref(false);
const alertsError = ref(null);

async function loadAlerts() {
  alertsLoading.value = true;
  alertsError.value = null;
  try {
    alerts.value = await api.alerts.list();
  } catch (e) {
    alertsError.value = e.message;
  } finally {
    alertsLoading.value = false;
  }
}

onMounted(() => Promise.all([loadProducts(), loadOrders(), loadAlerts()]));

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
</script>

<template>
  <div class="sp-shell">
    <header class="sp-bar" role="banner">
      <span class="sp-logo" aria-hidden="true">SP</span>
      <div class="sp-brand">
        <strong>StockPilot</strong>
        <span class="sp-sub">Reposição de Estoque</span>
      </div>
    </header>

    <main class="sp-main">
      <nav class="sp-tabs" role="tablist" aria-label="Seções do painel">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          role="tab"
          :aria-selected="activeTab === tab.key"
          :class="['sp-tab', { 'sp-tab--active': activeTab === tab.key }]"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span v-if="tab.key === 'alertas' && alerts.length" class="sp-badge" aria-label="alertas ativos">
            {{ alerts.length }}
          </span>
        </button>
      </nav>

      <!-- Aba Produtos -->
      <section v-show="activeTab === 'produtos'" role="tabpanel" aria-label="Produtos" class="sp-panel">
        <div class="sp-toolbar">
          <label class="sp-label">
            Filtrar por status:
            <select v-model="filterStatus" class="sp-select" aria-label="Filtrar por status">
              <option value="">Todos</option>
              <option value="OK">OK</option>
              <option value="ALERTA">ALERTA</option>
              <option value="RUPTURA">RUPTURA</option>
            </select>
          </label>
        </div>

        <div v-if="productsLoading" class="sp-state" role="status">Carregando...</div>
        <div v-else-if="productsError" class="sp-state sp-state--error" role="alert">{{ productsError }}</div>
        <div v-else-if="!filteredProducts.length" class="sp-state">Nenhum produto encontrado.</div>
        <div v-else class="sp-table-wrap">
          <table class="sp-table" aria-label="Lista de produtos">
            <thead>
              <tr>
                <th class="sp-th sp-th--sort" scope="col" @click="toggleSort('name')">
                  Produto <span class="sp-sort-ic" aria-hidden="true">{{ sortIcon('name') }}</span>
                </th>
                <th class="sp-th sp-th--sort sp-th--num" scope="col" @click="toggleSort('current_stock')">
                  Estoque atual <span class="sp-sort-ic" aria-hidden="true">{{ sortIcon('current_stock') }}</span>
                </th>
                <th class="sp-th sp-th--num" scope="col">Estoque mínimo</th>
                <th class="sp-th" scope="col">Status</th>
                <th class="sp-th sp-th--sort" scope="col" @click="toggleSort('last_order_date')">
                  Último pedido <span class="sp-sort-ic" aria-hidden="true">{{ sortIcon('last_order_date') }}</span>
                </th>
                <th class="sp-th" scope="col">Ação</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in filteredProducts" :key="p.id" class="sp-tr">
                <td class="sp-td">{{ p.name }}</td>
                <td class="sp-td sp-td--num">{{ p.current_stock }}</td>
                <td class="sp-td sp-td--num">{{ p.min_stock }}</td>
                <td class="sp-td">
                  <span :class="['sp-status', `sp-status--${p.status.toLowerCase()}`]">{{ p.status }}</span>
                </td>
                <td class="sp-td">{{ fmtDate(p.last_order_date) }}</td>
                <td class="sp-td">
                  <button
                    class="sp-btn sp-btn--sm"
                    :disabled="p.has_open_order"
                    :title="p.has_open_order ? 'Já existe pedido aberto para este produto' : 'Criar pedido manual de reposição'"
                    @click="createOrder(p)"
                  >
                    Criar pedido
                  </button>
                  <button
                    class="sp-btn sp-btn--sm sp-btn--ghost"
                    :disabled="suggestingId === p.id"
                    title="Sugerir quantidade de reposição com IA (dry-run)"
                    @click="suggestReorder(p)"
                  >
                    {{ suggestingId === p.id ? '…' : 'Sugerir (IA)' }}
                  </button>
                  <span v-if="suggestions[p.id]" class="sp-suggest" :title="suggestions[p.id].rationale">
                    IA: repor {{ suggestions[p.id].suggested_quantity }} un ({{ suggestions[p.id].confidence }})
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Aba Pedidos -->
      <section v-show="activeTab === 'pedidos'" role="tabpanel" aria-label="Pedidos" class="sp-panel">
        <div v-if="ordersLoading" class="sp-state" role="status">Carregando...</div>
        <div v-else-if="ordersError" class="sp-state sp-state--error" role="alert">{{ ordersError }}</div>
        <div v-else-if="!orders.length" class="sp-state">Nenhum pedido aberto.</div>
        <div v-else class="sp-table-wrap">
          <table class="sp-table" aria-label="Pedidos abertos">
            <thead>
              <tr>
                <th class="sp-th" scope="col">ID</th>
                <th class="sp-th" scope="col">Produto</th>
                <th class="sp-th" scope="col">Status</th>
                <th class="sp-th" scope="col">ID Fornecedor</th>
                <th class="sp-th" scope="col">Criado em</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in orders" :key="o.id" class="sp-tr">
                <td class="sp-td sp-td--mono">#{{ o.id }}</td>
                <td class="sp-td">{{ o.product_name }}</td>
                <td class="sp-td">
                  <span :class="['sp-status', `sp-status--${o.status}`]">{{ o.status }}</span>
                </td>
                <td class="sp-td sp-td--mono">{{ o.external_ref || '—' }}</td>
                <td class="sp-td">{{ fmtDate(o.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Aba Alertas -->
      <section v-show="activeTab === 'alertas'" role="tabpanel" aria-label="Alertas" class="sp-panel">
        <div v-if="alertsLoading" class="sp-state" role="status">Carregando...</div>
        <div v-else-if="alertsError" class="sp-state sp-state--error" role="alert">{{ alertsError }}</div>
        <div v-else-if="!alerts.length" class="sp-state sp-state--ok">Nenhum alerta ativo.</div>
        <div v-else class="sp-table-wrap">
          <table class="sp-table" aria-label="Alertas de ruptura e falhas">
            <thead>
              <tr>
                <th class="sp-th" scope="col">Produto</th>
                <th class="sp-th sp-th--num" scope="col">Estoque atual</th>
                <th class="sp-th sp-th--num" scope="col">Estoque mínimo</th>
                <th class="sp-th" scope="col">Tipo</th>
                <th class="sp-th" scope="col">Última tentativa</th>
                <th class="sp-th" scope="col">Erro</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in alerts" :key="a.id" class="sp-tr">
                <td class="sp-td">{{ a.name }}</td>
                <td class="sp-td sp-td--num">{{ a.current_stock }}</td>
                <td class="sp-td sp-td--num">{{ a.min_stock }}</td>
                <td class="sp-td">
                  <span :class="['sp-status', `sp-status--${(a.alert_type || 'ruptura').toLowerCase()}`]">
                    {{ a.alert_type || 'RUPTURA' }}
                  </span>
                </td>
                <td class="sp-td">{{ fmtDate(a.last_attempt_at) }}</td>
                <td class="sp-td sp-td--error">{{ a.last_error || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</template>

<style>
/* Reset mínimo */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--p-font-sans);
  background: rgb(var(--p-bg));
  color: rgb(var(--p-fg));
  min-height: 100dvh;
  font-size: var(--p-text-md);
  line-height: 1.5;
}

.sp-shell { display: flex; flex-direction: column; min-height: 100dvh; }

/* Barra de topo */
.sp-bar {
  display: flex; align-items: center; gap: var(--p-space-3);
  height: 52px; padding: 0 var(--p-space-4);
  background: rgb(var(--p-surface));
  border-bottom: 1px solid rgb(var(--p-border));
  position: sticky; top: 0; z-index: var(--p-z-bar);
  box-shadow: var(--p-shadow-sm);
}

.sp-logo {
  width: 32px; height: 32px; border-radius: 9px;
  background: rgb(var(--p-neon)); color: rgb(var(--p-on-neon));
  display: inline-flex; align-items: center; justify-content: center;
  font-family: var(--p-font-display); font-weight: 800; font-size: 13px;
  flex: none; user-select: none;
}

.sp-brand { display: flex; flex-direction: column; line-height: 1.1; }
.sp-brand strong { font-family: var(--p-font-display); font-size: 14px; font-weight: 700; letter-spacing: -0.2px; }
.sp-sub { font-size: var(--p-text-xs); color: rgb(var(--p-muted)); }

/* Conteúdo principal */
.sp-main { flex: 1; max-width: 1200px; margin: 0 auto; width: 100%; padding: var(--p-space-4); }

/* Abas */
.sp-tabs {
  display: flex; gap: var(--p-space-1);
  border-bottom: 2px solid rgb(var(--p-border));
  margin-bottom: var(--p-space-4);
}

.sp-tab {
  padding: var(--p-space-2) var(--p-space-4);
  border: none; background: none; cursor: pointer;
  font-family: var(--p-font-sans); font-size: var(--p-text-sm); font-weight: 500;
  color: rgb(var(--p-muted));
  border-bottom: 2px solid transparent; margin-bottom: -2px;
  border-radius: var(--p-radius-sm) var(--p-radius-sm) 0 0;
  transition: color .15s, border-color .15s;
  display: inline-flex; align-items: center; gap: var(--p-space-1);
}

.sp-tab:hover { color: rgb(var(--p-fg)); }
.sp-tab--active { color: rgb(var(--p-neon)); border-bottom-color: rgb(var(--p-neon)); }
.sp-tab:focus-visible { outline: 2px solid rgb(var(--p-neon)); outline-offset: 2px; }

.sp-badge {
  background: rgb(var(--p-danger)); color: #fff;
  border-radius: var(--p-radius-pill); padding: 1px 6px;
  font-size: 11px; font-weight: 700; line-height: 1.4;
}

.sp-panel { padding: 0; }

/* Barra de ferramentas */
.sp-toolbar { display: flex; align-items: center; gap: var(--p-space-3); margin-bottom: var(--p-space-3); }

.sp-label { display: flex; align-items: center; gap: var(--p-space-2); font-size: var(--p-text-sm); }

.sp-select {
  padding: 5px 8px; border: 1px solid rgb(var(--p-border));
  border-radius: var(--p-radius-sm); background: rgb(var(--p-surface));
  color: rgb(var(--p-fg)); font-size: var(--p-text-sm); cursor: pointer;
}
.sp-select:focus { outline: 2px solid rgb(var(--p-neon)); outline-offset: 1px; }

/* Tabelas */
.sp-table-wrap {
  overflow-x: auto;
  border-radius: var(--p-radius-md);
  border: 1px solid rgb(var(--p-border));
  box-shadow: var(--p-shadow-sm);
}

.sp-table { width: 100%; border-collapse: collapse; font-size: var(--p-text-sm); }

.sp-th {
  text-align: left; padding: var(--p-space-2) var(--p-space-3);
  background: rgb(var(--p-surface2));
  font-weight: 600; font-size: 11.5px; text-transform: uppercase;
  letter-spacing: 0.5px; color: rgb(var(--p-muted));
  border-bottom: 1px solid rgb(var(--p-border));
  white-space: nowrap;
}
.sp-th--sort { cursor: pointer; user-select: none; }
.sp-th--sort:hover { color: rgb(var(--p-fg)); }
.sp-th--num { text-align: right; }
.sp-sort-ic { font-size: 10px; margin-left: 3px; opacity: .6; }

.sp-tr { border-bottom: 1px solid rgb(var(--p-border)); }
.sp-tr:last-child { border-bottom: none; }
.sp-tr:hover { background: rgb(var(--p-surface2)); }

.sp-td { padding: var(--p-space-2) var(--p-space-3); vertical-align: middle; }
.sp-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.sp-td--mono { font-family: ui-monospace, monospace; font-size: 12px; color: rgb(var(--p-muted)); }
.sp-td--error { font-size: 12px; color: rgb(var(--p-danger)); max-width: 260px; word-break: break-word; }

/* Badges de status */
.sp-status {
  display: inline-flex; align-items: center;
  padding: 2px 8px; border-radius: var(--p-radius-pill);
  font-size: 11.5px; font-weight: 600; line-height: 1.4;
  white-space: nowrap;
}
.sp-status--ok       { background: rgb(var(--p-ok) / .12);      color: rgb(var(--p-ok)); }
.sp-status--alerta   { background: rgb(var(--p-warn) / .14);     color: rgb(var(--p-warn)); }
.sp-status--ruptura  { background: rgb(var(--p-danger) / .12);   color: rgb(var(--p-danger)); }
.sp-status--error    { background: rgb(var(--p-danger) / .12);   color: rgb(var(--p-danger)); }
.sp-status--pending  { background: rgb(var(--p-neon) / .10);     color: rgb(var(--p-neon)); }
.sp-status--processing { background: rgb(var(--p-accent2) / .12); color: rgb(var(--p-accent2)); }
.sp-status--delivered { background: rgb(var(--p-ok) / .12);      color: rgb(var(--p-ok)); }

/* Botões */
.sp-btn {
  padding: 6px 12px; border: 1px solid rgb(var(--p-border));
  border-radius: var(--p-radius-sm); background: rgb(var(--p-surface));
  color: rgb(var(--p-fg)); font-size: var(--p-text-sm);
  font-family: var(--p-font-sans); cursor: pointer;
  transition: border-color .15s, color .15s;
}
.sp-btn:hover:not(:disabled) { border-color: rgb(var(--p-neon)); color: rgb(var(--p-neon)); }
.sp-btn:disabled { opacity: .45; cursor: not-allowed; }
.sp-btn:focus-visible { outline: 2px solid rgb(var(--p-neon)); outline-offset: 2px; }
.sp-btn--sm { padding: 4px 10px; font-size: 12px; }
.sp-btn--ghost { background: transparent; border: 1px solid var(--p-accent, #6366f1); margin-left: 6px; }
.sp-suggest { display: inline-block; margin-left: 8px; font-size: 12px; color: var(--p-ok, #16a34a); }

/* Estados de carga / vazio */
.sp-state { padding: var(--p-space-5); text-align: center; color: rgb(var(--p-muted)); }
.sp-state--error { color: rgb(var(--p-danger)); }
.sp-state--ok    { color: rgb(var(--p-ok)); font-weight: 500; }

/* Responsividade */
@media (max-width: 640px) {
  .sp-bar { padding: 0 var(--p-space-3); }
  .sp-main { padding: var(--p-space-3); }
  .sp-th, .sp-td { padding: var(--p-space-2); }
  .sp-tab { padding: var(--p-space-2) var(--p-space-3); }
}

/* Movimento reduzido — WCAG 2.3.3 */
@media (prefers-reduced-motion: reduce) {
  .sp-tab, .sp-btn { transition: none; }
}
</style>
