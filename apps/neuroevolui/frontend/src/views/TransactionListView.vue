<!--
  Transações — lista de transações de pagamento (REQ-NEUROEVOLUI-0005).
  Endpoints REAIS:
    · GET /v1/payment-transactions  (resourceFactory) — coleção (fail-aware: 403/401 = sem acesso)
    · GET /v1/dashboard/revenue     (resourceFactory) — KPI de receita confirmada (fail-soft)
  Restrito a clinic_manager+ no backend: tratamos 401/403 como "sem acesso" (não como erro fatal).
  Estados: loading (skeleton via UiDataTable) · empty (com CTA) · error (com retry) · normal.
  CSP-safe: zero style inline / :style / v-html — estado visual por class + data-* no <style scoped>.
-->
<template>
  <UiPageLayout
    eyebrow="Financeiro"
    title="Transações"
    subtitle="Transações de pagamento por gateway, valor, moeda e status. Filtre por período e situação para acompanhar a receita."
    width="wide"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="loading" @click="reload">Atualizar</UiButton>
      <UiButton variant="subtle" to="/consultations">Ver agendamentos</UiButton>
    </template>

    <!-- KPIs — sempre visíveis; placeholders enquanto carrega -->
    <section class="tx-metrics" aria-label="Resumo das transações">
      <UiMetricCard
        label="Transações"
        :value="loading ? null : format.formatNumber(metrics.total)"
        :loading="loading"
        tone="primary"
        :hint="metricsHint"
      />
      <UiMetricCard
        label="Recebido"
        :value="loading ? null : formatCents(metrics.succeededCents)"
        :loading="loading"
        tone="success"
        :hint="metrics.succeeded + ' confirmada(s)'"
      />
      <UiMetricCard
        label="Pendente"
        :value="loading ? null : formatCents(metrics.pendingCents)"
        :loading="loading"
        tone="warning"
        :hint="metrics.pending + ' aguardando'"
      />
      <UiMetricCard
        label="Falhas"
        :value="loading ? null : format.formatNumber(metrics.failed)"
        :loading="loading"
        tone="error"
        hint="Cobranças recusadas"
      />
      <UiMetricCard
        label="Receita confirmada"
        :value="revenueValue"
        :loading="revenue.loading"
        :tone="revenueDenied ? 'neutral' : 'success'"
        :hint="revenueHint"
      />
    </section>

    <!-- Filtros -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="onApply"
        @clear="onClear"
      />
    </template>

    <!-- Banner: acesso negado (RBAC clinic_manager+) -->
    <template v-if="accessDenied" #banner>
      <div class="tx-banner tx-banner--warn" role="status">
        <span class="tx-banner-text">
          Seu perfil não tem acesso às transações de pagamento. Esta área é restrita a gestores da clínica.
        </span>
      </div>
    </template>
    <!-- Banner: filtro ativo -->
    <template v-else-if="hasActiveFilters && !error" #banner>
      <div class="tx-banner" role="status">
        <span class="tx-banner-text">
          Mostrando {{ format.formatNumber(filteredRows.length) }} de {{ format.formatNumber(rows.length) }} transações com os filtros aplicados.
        </span>
        <UiButton variant="subtle" size="sm" @click="onClear">Limpar filtros</UiButton>
      </div>
    </template>

    <!-- Tabela — estados loading/error/empty/normal tratados pelo UiDataTable -->
    <UiDataTable
      :columns="columns"
      :rows="pagedRows"
      :loading="loading"
      :error="errorMessage"
      row-key="id"
      density="comfortable"
      clickable-rows
      :sort="sort"
      :paginated="false"
      :empty="emptyState"
      @row-click="openDetail"
      @update:sort="onSort"
      @retry="reload"
    >
      <!-- Data -->
      <template #cell-created_at="{ value }">
        <span class="tx-when">{{ format.formatDateTime(value) }}</span>
      </template>

      <!-- Gateway + ID no gateway -->
      <template #cell-gateway_provider="{ row }">
        <div class="tx-gw">
          <span class="tx-gw-name">{{ gatewayLabel(row.gateway_provider) }}</span>
          <span v-if="row.gateway_transaction_id" class="tx-gw-id">{{ row.gateway_transaction_id }}</span>
        </div>
      </template>

      <!-- Agendamento vinculado -->
      <template #cell-consultation_id="{ value }">
        <span class="tx-id">{{ value || '—' }}</span>
      </template>

      <!-- Valor + moeda -->
      <template #cell-amount_cents="{ row }">
        <span class="tx-amount">{{ amountLabel(row) }}</span>
      </template>

      <!-- Status -->
      <template #cell-status="{ value }">
        <UiStatusBadge :status="value" :tone="statusTone(value)" :label="statusText(value)" with-dot />
      </template>

      <!-- CTA dentro do empty da própria tabela -->
      <template #empty-action>
        <div class="tx-empty-actions">
          <UiButton v-if="hasActiveFilters" variant="ghost" @click="onClear">Limpar filtros</UiButton>
          <UiButton variant="primary" to="/consultations">Ir para agendamentos</UiButton>
        </div>
      </template>
    </UiDataTable>

    <!-- Paginação local (a API entrega tudo de uma vez; paginamos no cliente) -->
    <UiPagination
      v-if="!loading && !error && filteredRows.length > pageSize"
      :page="page"
      :page-size="pageSize"
      :total="filteredRows.length"
      @update:page="page = $event"
      @update:page-size="onPageSize"
    />

    <template #footer>
      <span>Fonte: gateway de pagamentos do tenant. Clique numa linha para ver os detalhes da transação.</span>
    </template>

    <!-- Detalhe da transação (read-only) -->
    <UiModal v-model:open="detailOpen" :title="detailTitle" width="md">
      <dl v-if="selected" class="tx-detail">
        <div class="tx-detail-row">
          <dt>Status</dt>
          <dd>
            <UiStatusBadge :status="selected.status" :tone="statusTone(selected.status)" :label="statusText(selected.status)" with-dot />
          </dd>
        </div>
        <div class="tx-detail-row">
          <dt>Valor</dt>
          <dd class="tx-detail-amount">{{ amountLabel(selected) }}</dd>
        </div>
        <div class="tx-detail-row">
          <dt>Moeda</dt>
          <dd>{{ (selected.currency || 'BRL').toUpperCase() }}</dd>
        </div>
        <div class="tx-detail-row">
          <dt>Gateway</dt>
          <dd>{{ gatewayLabel(selected.gateway_provider) }}</dd>
        </div>
        <div class="tx-detail-row">
          <dt>ID no gateway</dt>
          <dd class="tx-detail-mono">{{ selected.gateway_transaction_id || '—' }}</dd>
        </div>
        <div class="tx-detail-row">
          <dt>Agendamento</dt>
          <dd class="tx-detail-mono">{{ selected.consultation_id || '—' }}</dd>
        </div>
        <div class="tx-detail-row">
          <dt>Data</dt>
          <dd>{{ format.formatDateTime(selected.created_at) }}</dd>
        </div>
      </dl>
      <template #footer>
        <UiButton variant="ghost" @click="detailOpen = false">Fechar</UiButton>
        <UiButton
          v-if="selected && selected.consultation_id"
          variant="primary"
          :to="'/consultations/' + selected.consultation_id"
        >
          Abrir agendamento
        </UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiDataTable,
  UiPagination,
  UiFiltersPanel,
  UiStatusBadge,
  UiMetricCard,
  UiModal,
  UiButton,
  useToast,
  format,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

const toast = useToast();

// Recursos REAIS (resourceFactory → /v1/<name>). 'payment-transactions' tem hífen,
// então não importamos por nome — instanciamos contra o endpoint real diretamente.
const transactionsApi = resourceFactory('payment-transactions');
const dashboardRevenueApi = resourceFactory('dashboard/revenue');

// ── Estado de dados ─────────────────────────────────────────────────────────────
const rows = ref([]);
const loading = ref(false);
const error = ref(null);

const sort = ref({ key: 'created_at', dir: 'desc' });
const page = ref(1);
const pageSize = ref(25);

const filters = ref({ q: '', from: '', to: '', status: '', gateway: '' });

// Receita confirmada (KPI cruzado) — carrega de forma independente (fail-soft).
const revenue = reactive({ loading: true, error: null, meta: null });

// Detalhe
const detailOpen = ref(false);
const selected = ref(null);

// ── Enums (cor NUNCA é o único sinal) ────────────────────────────────────────────
const STATUS_LABELS = {
  pending: 'Pendente',
  succeeded: 'Aprovada',
  failed: 'Falhou',
  refunded: 'Reembolsada',
};
const STATUS_TONES = {
  pending: 'warning',
  succeeded: 'success',
  failed: 'error',
  refunded: 'neutral',
};
const GATEWAY_LABELS = {
  stripe: 'Stripe',
  pagarme: 'Pagar.me',
  mercadopago: 'Mercado Pago',
  pagseguro: 'PagSeguro',
  manual: 'Manual',
};

function norm(v) {
  return String(v || '').trim().toLowerCase();
}
const statusText = (v) => STATUS_LABELS[norm(v)] || format.humanize(v);
const statusTone = (v) => STATUS_TONES[norm(v)] || 'neutral';
const gatewayLabel = (v) => GATEWAY_LABELS[norm(v)] || (v ? format.humanize(v) : '—');

// Opções de gateway descobertas dinamicamente a partir dos dados reais.
const gatewayOptions = computed(() => {
  const seen = new Map();
  for (const r of rows.value) {
    const key = norm(r.gateway_provider);
    if (key && !seen.has(key)) seen.set(key, gatewayLabel(r.gateway_provider));
  }
  return [...seen.entries()].map(([value, label]) => ({ value, label }));
});

// ── Colunas ──────────────────────────────────────────────────────────────────────
const columns = [
  { key: 'created_at', label: 'Data', sortable: true },
  { key: 'gateway_provider', label: 'Gateway', sortable: true },
  { key: 'consultation_id', label: 'Agendamento' },
  { key: 'amount_cents', label: 'Valor', align: 'right', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
];

const filterFields = computed(() => [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'ID do gateway, agendamento…' },
  { key: 'from', label: 'De', type: 'date' },
  { key: 'to', label: 'Até', type: 'date' },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'pending', label: 'Pendente' },
      { value: 'succeeded', label: 'Aprovada' },
      { value: 'failed', label: 'Falhou' },
      { value: 'refunded', label: 'Reembolsada' },
    ],
  },
  {
    key: 'gateway',
    label: 'Gateway',
    type: 'select',
    options: gatewayOptions.value,
  },
]);

// ── Helpers puros ─────────────────────────────────────────────────────────────────
function isDenied(err) {
  return !!err && (err.status === 401 || err.status === 403);
}
function formatCents(cents) {
  const n = Number(cents);
  if (!isFinite(n)) return '—';
  return format.formatCurrency(n / 100);
}
function amountLabel(row) {
  const n = Number(row && row.amount_cents);
  if (!isFinite(n)) return '—';
  const cur = (row && row.currency ? String(row.currency) : 'BRL').toUpperCase();
  return format.formatCurrency(n / 100, cur);
}

// ── Filtragem (client-side) ────────────────────────────────────────────────────────
function matchesText(needle, ...haystack) {
  const q = norm(needle);
  if (!q) return true;
  return haystack.some((h) => String(h ?? '').toLowerCase().includes(q));
}
function inDateRange(value, from, to) {
  if (!from && !to) return true;
  if (!value) return false;
  const t = new Date(value).getTime();
  if (!isFinite(t)) return false;
  if (from) {
    const f = new Date(from + 'T00:00:00').getTime();
    if (isFinite(f) && t < f) return false;
  }
  if (to) {
    const e = new Date(to + 'T23:59:59').getTime();
    if (isFinite(e) && t > e) return false;
  }
  return true;
}

const hasActiveFilters = computed(() =>
  Object.values(filters.value).some((v) => norm(v) !== ''),
);

const filteredRows = computed(() => {
  const f = filters.value;
  return rows.value.filter((r) => {
    if (!matchesText(f.q, r.gateway_transaction_id, r.consultation_id, r.id, r.gateway_provider)) return false;
    if (!inDateRange(r.created_at, f.from, f.to)) return false;
    if (f.status && norm(r.status) !== norm(f.status)) return false;
    if (f.gateway && norm(r.gateway_provider) !== norm(f.gateway)) return false;
    return true;
  });
});

// ── Ordenação (client-side) ──────────────────────────────────────────────────────
const sortedRows = computed(() => {
  const s = sort.value;
  if (!s || !s.key) return filteredRows.value;
  const mul = s.dir === 'desc' ? -1 : 1;
  const numeric = s.key === 'amount_cents';
  const dated = s.key === 'created_at';
  return [...filteredRows.value].sort((a, b) => {
    let x = a[s.key];
    let y = b[s.key];
    if (dated) {
      x = x ? new Date(x).getTime() : 0;
      y = y ? new Date(y).getTime() : 0;
    } else if (numeric) {
      x = Number(x) || 0;
      y = Number(y) || 0;
    } else {
      x = String(x ?? '').toLowerCase();
      y = String(y ?? '').toLowerCase();
    }
    if (x === y) return 0;
    return (x > y ? 1 : -1) * mul;
  });
});

// ── Paginação (client-side) ──────────────────────────────────────────────────────
const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedRows.value.slice(start, start + pageSize.value);
});

// ── Métricas derivadas ────────────────────────────────────────────────────────────
const metrics = computed(() => {
  const src = filteredRows.value;
  let succeeded = 0;
  let pending = 0;
  let failed = 0;
  let refunded = 0;
  let succeededCents = 0;
  let pendingCents = 0;
  for (const r of src) {
    const st = norm(r.status);
    const cents = Number(r.amount_cents) || 0;
    if (st === 'succeeded') {
      succeeded += 1;
      succeededCents += cents;
    } else if (st === 'pending') {
      pending += 1;
      pendingCents += cents;
    } else if (st === 'failed') {
      failed += 1;
    } else if (st === 'refunded') {
      refunded += 1;
    }
  }
  return { total: src.length, succeeded, pending, failed, refunded, succeededCents, pendingCents };
});

const metricsHint = computed(() =>
  hasActiveFilters.value ? 'no filtro aplicado' : 'no total',
);

// ── Receita confirmada (endpoint dashboard/revenue) ───────────────────────────────
const revenueDenied = computed(() => isDenied(revenue.error));
const revenueValue = computed(() => {
  if (revenue.loading) return null;
  if (revenueDenied.value) return 'Sem acesso';
  if (revenue.error || !revenue.meta) return '—';
  return formatCents(revenue.meta.revenue_cents);
});
const revenueHint = computed(() => {
  if (revenue.loading) return 'apurando…';
  if (revenueDenied.value) return 'requer perfil de gestão';
  if (revenue.error) return 'falha ao apurar';
  const total = revenue.meta && revenue.meta.total != null ? revenue.meta.total : 0;
  return total ? 'de ' + format.formatNumber(total) + ' cobrança(s)' : 'nenhuma cobrança ainda';
});

// ── Estados / mensagens ────────────────────────────────────────────────────────────
const accessDenied = computed(() => isDenied(error.value));
const errorMessage = computed(() => {
  if (!error.value) return null;
  // Acesso negado não é "erro de tabela": vira banner + empty informativo.
  if (accessDenied.value) return null;
  return error.value.message || 'Não foi possível carregar as transações.';
});

const emptyState = computed(() => {
  if (accessDenied.value) {
    return {
      title: 'Acesso restrito',
      description: 'As transações de pagamento são visíveis apenas para gestores da clínica.',
      icon: 'lock',
    };
  }
  if (hasActiveFilters.value) {
    return {
      title: 'Nenhuma transação encontrada',
      description: 'Nenhuma transação corresponde aos filtros aplicados. Ajuste ou limpe os filtros.',
      icon: 'search',
    };
  }
  return {
    title: 'Nenhuma transação ainda',
    description: 'Assim que houver cobranças nos agendamentos, elas aparecerão aqui.',
    icon: 'card',
  };
});

const detailTitle = computed(() => {
  if (!selected.value) return 'Transação';
  return 'Transação · ' + amountLabel(selected.value);
});

// ── Ações ──────────────────────────────────────────────────────────────────────────
function openDetail(row) {
  selected.value = row;
  detailOpen.value = true;
}
function onSort(s) {
  sort.value = s;
  page.value = 1;
}
function onApply() {
  page.value = 1;
}
function onClear() {
  filters.value = { q: '', from: '', to: '', status: '', gateway: '' };
  page.value = 1;
}
function onPageSize(size) {
  pageSize.value = size;
  page.value = 1;
}

// ── Carga ────────────────────────────────────────────────────────────────────────
async function loadTransactions() {
  loading.value = true;
  error.value = null;
  try {
    const res = await transactionsApi.list();
    const data = Array.isArray(res) ? res : res && res.data ? res.data : [];
    rows.value = data;
  } catch (e) {
    error.value = e;
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadRevenue() {
  revenue.loading = true;
  revenue.error = null;
  try {
    const res = await dashboardRevenueApi.list();
    // Contrato real (api/src/services/dashboard-service.js): { data: [...], meta: { total, revenue_cents, … } }.
    // O resourceFactory.list NÃO desembrulha quando há `data`, então o envelope chega inteiro:
    // revenue_cents/total vivem em `meta`. Lemos `meta` primeiro; só caímos para `data`/raiz
    // se o backend mudar de shape (fail-soft), nunca para o array de linhas.
    const env = res || {};
    if (env.meta && !Array.isArray(env.meta)) {
      revenue.meta = env.meta;
    } else if (env.data && !Array.isArray(env.data)) {
      revenue.meta = env.data;
    } else {
      revenue.meta = env;
    }
  } catch (e) {
    revenue.error = e;
    revenue.meta = null;
  } finally {
    revenue.loading = false;
  }
}

async function load() {
  await Promise.all([loadTransactions(), loadRevenue()]);
}

async function reload() {
  await load();
  if (accessDenied.value) {
    toast.error('Sem acesso às transações.', { detail: 'Esta área é restrita a gestores da clínica.' });
  } else if (error.value) {
    toast.error('Falha ao atualizar as transações.', { detail: errorMessage.value });
  } else {
    toast.success('Transações atualizadas.');
  }
}

onMounted(load);
</script>

<style scoped>
.tx-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}

.tx-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  background: rgb(var(--ui-accent) / 0.08);
  border: 1px solid rgb(var(--ui-accent) / 0.28);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-3) var(--ui-space-4);
}

.tx-banner--warn {
  background: rgb(var(--ui-warn) / 0.1);
  border-color: rgb(var(--ui-warn) / 0.35);
}

.tx-banner-text {
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

.tx-when {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.tx-gw {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  min-width: 0;
  /* largura máxima do ID do gateway (texto mono longo) — exceção semântica alinhada ao kit */
  --tx-gw-id-max: 240px;
}

.tx-gw-name {
  font-weight: 600;
}

.tx-gw-id {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: var(--tx-gw-id-max);
}

.tx-id {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

.tx-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  white-space: nowrap;
}

.tx-empty-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  justify-content: center;
}

/* Detalhe (modal) */
.tx-detail {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  margin: 0;
}

.tx-detail-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: var(--ui-space-3);
  align-items: center;
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}

.tx-detail-row:last-child {
  border-bottom: none;
}

.tx-detail dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

.tx-detail dd {
  margin: 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}

.tx-detail-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: var(--ui-text-md);
}

.tx-detail-mono {
  font-family: var(--ui-font-mono, monospace);
  word-break: break-all;
}

@media (max-width: 860px) {
  .tx-metrics {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--ui-space-3);
  }

  .tx-detail-row {
    grid-template-columns: 1fr;
    gap: var(--ui-space-1);
    align-items: start;
  }
}
</style>
