<!--
  Transações Financeiras — lista paginada (REF-NEUROEVOLUI-0039 / REQ-NEUROEVOLUI-0005).
  Rota: /payment-transactions  Roles: user
  Endpoint: GET /v1/payment-transactions?status=&page=&pageSize=
  Export:   GET /v1/payment-transactions/export (CSV, BOM UTF-8)
  Colunas:  data (dd/MM/yyyy) · paciente · valor BRL · status · forma de pagamento · ID
  Interações:
    - linha clicável → navega para /payment-transactions/:id
    - filtro por status → atualiza query params + recarrega da API
    - botão Exportar → download CSV via âncora
  Estados: loading (skeleton) · empty (filtros ativos) · error (banner + retry) · normal.
  CSP-safe: zero style inline / :style / v-html — estado visual por class + data-* no <style scoped>.
-->
<template>
  <UiPageLayout
    eyebrow="Financeiro"
    title="Transações"
    subtitle="Histórico completo de transações financeiras por paciente, valor e status."
    width="wide"
    :error="fatalError"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="loading" @click="reload">Atualizar</UiButton>
      <UiButton variant="subtle" @click="onExport">Exportar</UiButton>
    </template>

    <!-- KPIs derivados dos dados filtrados -->
    <section class="pt-metrics" aria-label="Resumo das transações">
      <UiMetricCard
        label="Total"
        :value="loading ? null : format.formatNumber(metrics.total)"
        :loading="loading"
        tone="primary"
        :hint="hasActiveFilters ? 'no filtro ativo' : 'todas as transações'"
      />
      <UiMetricCard
        label="Confirmadas"
        :value="loading ? null : formatCents(metrics.confirmedCents)"
        :loading="loading"
        tone="success"
        :hint="metrics.confirmed + ' transação(ões)'"
      />
      <UiMetricCard
        label="Pendentes"
        :value="loading ? null : formatCents(metrics.pendingCents)"
        :loading="loading"
        tone="warning"
        :hint="metrics.pending + ' aguardando'"
      />
      <UiMetricCard
        label="Reembolsadas"
        :value="loading ? null : format.formatNumber(metrics.refunded)"
        :loading="loading"
        tone="neutral"
        hint="Devoluções processadas"
      />
      <UiMetricCard
        label="Falhas"
        :value="loading ? null : format.formatNumber(metrics.failed)"
        :loading="loading"
        tone="error"
        hint="Cobranças recusadas"
      />
    </section>

    <!-- Filtros: status, data e paciente -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="onApply"
        @clear="onClear"
      />
    </template>

    <!-- Banner de filtro ativo -->
    <template v-if="hasActiveFilters && !fatalError" #banner>
      <div class="pt-banner" role="status">
        <span class="pt-banner-text">
          Exibindo {{ format.formatNumber(filteredRows.length) }} de
          {{ format.formatNumber(rows.length) }} transações com filtros aplicados.
        </span>
        <UiButton variant="subtle" size="sm" @click="onClear">Limpar filtros</UiButton>
      </div>
    </template>

    <!-- Tabela principal -->
    <UiDataTable
      :columns="columns"
      :rows="pagedRows"
      :loading="loading"
      :error="tableError"
      row-key="id"
      density="comfortable"
      clickable-rows
      :sort="sort"
      :paginated="false"
      :empty="emptyState"
      @row-click="onRowClick"
      @update:sort="onSort"
      @retry="reload"
    >
      <!-- Data no formato dd/MM/yyyy -->
      <template #cell-created_at="{ value }">
        <span class="pt-datetime">{{ format.formatDate(value) }}</span>
      </template>

      <!-- Paciente -->
      <template #cell-patient_name="{ value }">
        <span class="pt-patient">{{ value || '—' }}</span>
      </template>

      <!-- Valor formatado (centavos → BRL) -->
      <template #cell-amount_cents="{ row }">
        <span class="pt-amount">{{ amountLabel(row) }}</span>
      </template>

      <!-- Status com badge semântico -->
      <template #cell-status="{ value }">
        <UiStatusBadge
          :status="value"
          :tone="statusTone(value)"
          :label="statusText(value)"
          with-dot
        />
      </template>

      <!-- Forma de pagamento (gateway) -->
      <template #cell-gateway_provider="{ value }">
        <span class="pt-gateway">{{ gatewayLabel(value) }}</span>
      </template>

      <!-- ID da transação -->
      <template #cell-id="{ value }">
        <span class="pt-mono">{{ value }}</span>
      </template>

      <!-- CTA dentro do empty da tabela -->
      <template #empty-action>
        <div class="pt-empty-actions">
          <UiButton v-if="hasActiveFilters" variant="ghost" @click="onClear">
            Limpar filtros
          </UiButton>
          <UiButton variant="primary" to="/consultations">
            Ir para agendamentos
          </UiButton>
        </div>
      </template>
    </UiDataTable>

    <!-- Paginação local -->
    <UiPagination
      v-if="!loading && !fatalError && filteredRows.length > pageSize"
      :page="page"
      :page-size="pageSize"
      :total="filteredRows.length"
      @update:page="page = $event"
      @update:page-size="onPageSize"
    />

    <template #footer>
      <span>
        Clique em uma linha para ver o detalhe completo da transação.
      </span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiPagination,
  UiFiltersPanel,
  UiStatusBadge,
  UiMetricCard,
  UiButton,
  useToast,
  format,
} from '../ui/index.js';
import { paymentTransactions } from '../api.js';

const router = useRouter();
const route = useRoute();
const toast = useToast();

// ── Estado de dados ────────────────────────────────────────────────────────────
const rows = ref([]);
const loading = ref(false);
const loadError = ref(null);

const sort = ref({ key: 'created_at', dir: 'desc' });
const page = ref(1);
const pageSize = ref(25);

const filters = ref({ q: '', from: '', to: '', status: '' });

// ── Enums ──────────────────────────────────────────────────────────────────────
const STATUS_LABELS = {
  pending: 'Pendente',
  confirmed: 'Confirmada',
  refunded: 'Reembolsada',
  failed: 'Falhou',
};
const STATUS_TONES = {
  pending: 'warning',
  confirmed: 'success',
  refunded: 'neutral',
  failed: 'error',
};
const GATEWAY_LABELS = {
  stripe: 'Stripe',
  pagseguro: 'PagSeguro',
  sandbox: 'Sandbox',
};

function norm(v) {
  return String(v || '').trim().toLowerCase();
}

const statusText = (v) => STATUS_LABELS[norm(v)] || format.humanize(v);
const statusTone = (v) => STATUS_TONES[norm(v)] || 'neutral';
const gatewayLabel = (v) => GATEWAY_LABELS[norm(v)] || (v ? format.humanize(v) : '—');

// ── Colunas da tabela ─────────────────────────────────────────────────────────
const columns = [
  { key: 'created_at', label: 'Data', sortable: true },
  { key: 'patient_name', label: 'Paciente' },
  { key: 'amount_cents', label: 'Valor', align: 'right', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'gateway_provider', label: 'Forma de Pagamento' },
  { key: 'id', label: 'ID', sortable: true },
];

// ── Campos de filtro ───────────────────────────────────────────────────────────
const filterFields = computed(() => [
  { key: 'q', label: 'Buscar paciente', type: 'text', placeholder: 'Nome do paciente…' },
  { key: 'from', label: 'De', type: 'date' },
  { key: 'to', label: 'Até', type: 'date' },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'pending', label: 'Pendente' },
      { value: 'confirmed', label: 'Confirmada' },
      { value: 'refunded', label: 'Reembolsada' },
      { value: 'failed', label: 'Falhou' },
    ],
  },
]);

// ── Helpers de formatação ──────────────────────────────────────────────────────
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

// ── Filtragem (client-side: status é também server-side via query param) ───────
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
    if (!matchesText(f.q, r.patient_name, r.id)) return false;
    if (!inDateRange(r.created_at, f.from, f.to)) return false;
    // status já é filtrado no servidor; filtragem local garante consistência após onClear parcial
    if (f.status && norm(r.status) !== norm(f.status)) return false;
    return true;
  });
});

// ── Ordenação (client-side) ────────────────────────────────────────────────────
const sortedRows = computed(() => {
  const s = sort.value;
  if (!s || !s.key) return filteredRows.value;
  const mul = s.dir === 'desc' ? -1 : 1;
  return [...filteredRows.value].sort((a, b) => {
    let x = a[s.key];
    let y = b[s.key];
    if (s.key === 'created_at') {
      x = x ? new Date(x).getTime() : 0;
      y = y ? new Date(y).getTime() : 0;
    } else if (s.key === 'amount_cents' || s.key === 'id') {
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

// ── Paginação (client-side) ────────────────────────────────────────────────────
const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedRows.value.slice(start, start + pageSize.value);
});

// ── Métricas derivadas ─────────────────────────────────────────────────────────
const metrics = computed(() => {
  let confirmed = 0, pending = 0, failed = 0, refunded = 0, confirmedCents = 0, pendingCents = 0;
  for (const r of filteredRows.value) {
    const st = norm(r.status);
    const cents = Number(r.amount_cents) || 0;
    if (st === 'confirmed') { confirmed += 1; confirmedCents += cents; }
    else if (st === 'pending') { pending += 1; pendingCents += cents; }
    else if (st === 'failed') { failed += 1; }
    else if (st === 'refunded') { refunded += 1; }
  }
  return { total: filteredRows.value.length, confirmed, pending, failed, refunded, confirmedCents, pendingCents };
});

// ── Estados / mensagens ────────────────────────────────────────────────────────
const fatalError = computed(() => {
  if (!loadError.value) return null;
  const s = loadError.value.status;
  if (s === 401 || s === 403) return 'Sem acesso às transações. Esta área é restrita a gestores da clínica.';
  return loadError.value.message || 'Não foi possível carregar as transações.';
});

const tableError = computed(() => {
  if (!loadError.value) return null;
  const s = loadError.value.status;
  if (s === 401 || s === 403) return null;
  return loadError.value.message || 'Erro ao carregar as transações.';
});

const emptyState = computed(() => {
  if (hasActiveFilters.value) {
    return {
      title: 'Nenhuma transação encontrada',
      description: 'Nenhuma transação corresponde aos filtros aplicados. Ajuste ou limpe os filtros.',
      icon: 'search',
    };
  }
  return {
    title: 'Nenhuma transação ainda',
    description: 'As transações são criadas automaticamente pelos gateways de pagamento ao processar cobranças dos agendamentos.',
    icon: 'card',
  };
});

// ── Ações ──────────────────────────────────────────────────────────────────────
function onRowClick(row) {
  router.push('/payment-transactions/' + row.id);
}

function onSort(s) {
  sort.value = s;
  page.value = 1;
}

function onApply() {
  page.value = 1;
  // Sincroniza status com query params e recarrega da API com filtro server-side
  const query = {};
  if (filters.value.status) query.status = filters.value.status;
  router.replace({ query });
  load();
}

function onClear() {
  filters.value = { q: '', from: '', to: '', status: '' };
  page.value = 1;
  router.replace({ query: {} });
  load();
}

function onPageSize(size) {
  pageSize.value = size;
  page.value = 1;
}

function onExport() {
  const url = paymentTransactions.exportUrl({ status: filters.value.status });
  const a = document.createElement('a');
  a.href = url;
  a.download = 'transacoes.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Carga ──────────────────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const params = {};
    if (filters.value.status) params.status = filters.value.status;
    const res = await paymentTransactions.list(params);
    rows.value = Array.isArray(res) ? res : (res && res.data ? res.data : []);
  } catch (e) {
    loadError.value = e;
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

async function reload() {
  await load();
  if (loadError.value) {
    const s = loadError.value.status;
    if (s === 401 || s === 403) {
      toast.error('Sem acesso.', { detail: 'Transações requerem perfil de gestor da clínica.' });
    } else {
      toast.error('Falha ao atualizar.', { detail: loadError.value.message });
    }
  } else {
    toast.success('Transações atualizadas.');
  }
}

onMounted(() => {
  // Restaura filtro de status da URL (ex.: navegação de volta com ?status=pending)
  const q = route.query;
  if (q.status) filters.value.status = q.status;
  load();
});
</script>

<style scoped>
/* ── KPIs ──────────────────────────────────────────────────────────────────── */
.pt-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}

/* ── Banner de filtro ativo ─────────────────────────────────────────────────── */
.pt-banner {
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

.pt-banner-text {
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

/* ── Células da tabela ──────────────────────────────────────────────────────── */
.pt-datetime {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pt-patient {
  font-weight: 500;
  color: rgb(var(--ui-fg));
}

.pt-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  white-space: nowrap;
  color: rgb(var(--ui-fg));
}

.pt-gateway {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

.pt-mono {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* ── CTA no empty state ─────────────────────────────────────────────────────── */
.pt-empty-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  justify-content: center;
}

/* ── Responsivo ─────────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .pt-metrics {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--ui-space-3);
  }
}
</style>
