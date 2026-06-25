<!--
  Transações Financeiras — lista paginada de payment-transactions (REQ-NEUROEVOLUI-0005).
  Rota: /payment-transactions
  Endpoints REAIS:
    · GET /v1/payment-transactions  (resourceFactory → paymentTransactions)
  Somente leitura — escrita é via webhook no backend.
  Linha clicável abre modal de detalhe (read-only).
  Estados: loading (skeleton) · empty (com CTA) · error (com retry) · normal.
  CSP-safe: zero style inline / :style / v-html — estado visual por class + data-* no <style scoped>.
-->
<template>
  <UiPageLayout
    eyebrow="Financeiro"
    title="Transações"
    subtitle="Histórico completo de transações financeiras por gateway, valor, moeda e status."
    width="wide"
    :error="fatalError"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="loading" @click="reload">Atualizar</UiButton>
      <UiButton variant="subtle" to="/consultations">Ver agendamentos</UiButton>
    </template>

    <!-- KPIs derivados dos dados filtrados -->
    <section class="pt-metrics" aria-label="Resumo das transações">
      <UiMetricCard
        label="Total"
        :value="loading ? null : format.formatNumber(metrics.total)"
        :loading="loading"
        tone="primary"
        :hint="hasActiveFilters ? 'no filtro ativo' : 'no período'"
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

    <!-- Filtros: status, gateway, período e busca livre -->
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
      @row-click="openDetail"
      @update:sort="onSort"
      @retry="reload"
    >
      <!-- Data/hora -->
      <template #cell-created_at="{ value }">
        <span class="pt-datetime">{{ format.formatDateTime(value) }}</span>
      </template>

      <!-- Gateway + ID externo -->
      <template #cell-gateway="{ row }">
        <div class="pt-gw">
          <span class="pt-gw-name">{{ gatewayLabel(row.gateway) }}</span>
          <span v-if="row.external_id" class="pt-gw-id">{{ row.external_id }}</span>
        </div>
      </template>

      <!-- Agendamento vinculado -->
      <template #cell-consultation_id="{ value }">
        <span class="pt-mono">{{ value || '—' }}</span>
      </template>

      <!-- Paciente -->
      <template #cell-patient_id="{ value }">
        <span class="pt-mono">{{ value || '—' }}</span>
      </template>

      <!-- Valor formatado (centavos → moeda) -->
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

      <!-- Tipo de evento -->
      <template #cell-event_type="{ value }">
        <span class="pt-event">{{ value || '—' }}</span>
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
        Somente leitura — transações são criadas automaticamente por webhooks dos gateways.
        Clique numa linha para ver o detalhe completo.
      </span>
    </template>

    <!-- Modal de detalhe da transação (read-only) -->
    <UiModal
      v-model:open="detailOpen"
      :title="detailTitle"
      width="md"
    >
      <dl v-if="selected" class="pt-detail">
        <div class="pt-detail-row">
          <dt>Status</dt>
          <dd>
            <UiStatusBadge
              :status="selected.status"
              :tone="statusTone(selected.status)"
              :label="statusText(selected.status)"
              with-dot
            />
          </dd>
        </div>
        <div class="pt-detail-row">
          <dt>Valor</dt>
          <dd class="pt-detail-amount">{{ amountLabel(selected) }}</dd>
        </div>
        <div class="pt-detail-row">
          <dt>Moeda</dt>
          <dd>{{ currencyLabel(selected.currency) }}</dd>
        </div>
        <div class="pt-detail-row">
          <dt>Gateway</dt>
          <dd>{{ gatewayLabel(selected.gateway) }}</dd>
        </div>
        <div class="pt-detail-row">
          <dt>ID externo</dt>
          <dd class="pt-detail-mono">{{ selected.external_id || '—' }}</dd>
        </div>
        <div class="pt-detail-row">
          <dt>Tipo de evento</dt>
          <dd>{{ selected.event_type || '—' }}</dd>
        </div>
        <div class="pt-detail-row">
          <dt>Agendamento</dt>
          <dd class="pt-detail-mono">{{ selected.consultation_id || '—' }}</dd>
        </div>
        <div class="pt-detail-row">
          <dt>Paciente</dt>
          <dd class="pt-detail-mono">{{ selected.patient_id || '—' }}</dd>
        </div>
        <div class="pt-detail-row">
          <dt>Registrado em</dt>
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
        <UiButton
          v-if="selected && selected.patient_id"
          variant="subtle"
          :to="'/patients/' + selected.patient_id"
        >
          Ver paciente
        </UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
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
import { paymentTransactions } from '../api.js';

const router = useRouter();
const toast = useToast();

// ── Estado de dados ────────────────────────────────────────────────────────────
const rows = ref([]);
const loading = ref(false);
const loadError = ref(null);

const sort = ref({ key: 'created_at', dir: 'desc' });
const page = ref(1);
const pageSize = ref(25);

const filters = ref({ q: '', from: '', to: '', status: '', gateway: '', currency: '' });

// Detalhe
const detailOpen = ref(false);
const selected = ref(null);

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
};
const CURRENCY_LABELS = {
  BRL: 'BRL — Real',
  USD: 'USD — Dólar',
};

function norm(v) {
  return String(v || '').trim().toLowerCase();
}

const statusText = (v) => STATUS_LABELS[norm(v)] || format.humanize(v);
const statusTone = (v) => STATUS_TONES[norm(v)] || 'neutral';
const gatewayLabel = (v) => GATEWAY_LABELS[norm(v)] || (v ? format.humanize(v) : '—');
const currencyLabel = (v) => CURRENCY_LABELS[String(v || '').toUpperCase()] || String(v || 'BRL').toUpperCase();

// ── Colunas da tabela ─────────────────────────────────────────────────────────
const columns = [
  { key: 'created_at', label: 'Registrado em', sortable: true },
  { key: 'gateway', label: 'Gateway', sortable: true },
  { key: 'external_id', label: 'ID externo' },
  { key: 'consultation_id', label: 'Agendamento' },
  { key: 'amount_cents', label: 'Valor', align: 'right', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'event_type', label: 'Evento' },
];

// ── Campos de filtro ───────────────────────────────────────────────────────────
const filterFields = computed(() => [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'ID externo, agendamento, paciente…' },
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
  {
    key: 'gateway',
    label: 'Gateway',
    type: 'select',
    options: [
      { value: 'stripe', label: 'Stripe' },
      { value: 'pagseguro', label: 'PagSeguro' },
    ],
  },
  {
    key: 'currency',
    label: 'Moeda',
    type: 'select',
    options: [
      { value: 'BRL', label: 'BRL' },
      { value: 'USD', label: 'USD' },
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

// ── Filtragem (client-side) ────────────────────────────────────────────────────
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
    if (!matchesText(f.q, r.external_id, r.consultation_id, r.patient_id, r.id)) return false;
    if (!inDateRange(r.created_at, f.from, f.to)) return false;
    if (f.status && norm(r.status) !== norm(f.status)) return false;
    if (f.gateway && norm(r.gateway) !== norm(f.gateway)) return false;
    if (f.currency && String(r.currency || '').toUpperCase() !== f.currency.toUpperCase()) return false;
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
    } else if (s.key === 'amount_cents') {
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
  let confirmed = 0;
  let pending = 0;
  let failed = 0;
  let refunded = 0;
  let confirmedCents = 0;
  let pendingCents = 0;
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
// Erro fatal (401/403) → erro no UiPageLayout (não na tabela)
const fatalError = computed(() => {
  if (!loadError.value) return null;
  const s = loadError.value.status;
  if (s === 401 || s === 403) return 'Sem acesso às transações. Esta área é restrita a gestores da clínica.';
  return loadError.value.message || 'Não foi possível carregar as transações.';
});

// Erro da tabela (não-fatal, permite retry)
const tableError = computed(() => {
  if (!loadError.value) return null;
  const s = loadError.value.status;
  if (s === 401 || s === 403) return null; // vira erro de página
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

const detailTitle = computed(() => {
  if (!selected.value) return 'Transação';
  return 'Transação · ' + amountLabel(selected.value);
});

// ── Ações ──────────────────────────────────────────────────────────────────────
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
  filters.value = { q: '', from: '', to: '', status: '', gateway: '', currency: '' };
  page.value = 1;
}

function onPageSize(size) {
  pageSize.value = size;
  page.value = 1;
}

// ── Carga ──────────────────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const res = await paymentTransactions.list();
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

onMounted(load);
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

.pt-gw {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  min-width: 0;
}

.pt-gw-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

.pt-gw-id {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}

.pt-mono {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

.pt-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  white-space: nowrap;
  color: rgb(var(--ui-fg));
}

.pt-event {
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

/* ── Modal de detalhe ───────────────────────────────────────────────────────── */
.pt-detail {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
}

.pt-detail-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: var(--ui-space-3);
  align-items: center;
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}

.pt-detail-row:last-child {
  border-bottom: none;
}

.pt-detail dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

.pt-detail dd {
  margin: 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}

.pt-detail-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: var(--ui-text-md, 1rem);
}

.pt-detail-mono {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-sm);
  word-break: break-all;
}

/* ── Responsivo ─────────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .pt-metrics {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--ui-space-3);
  }

  .pt-detail-row {
    grid-template-columns: 1fr;
    gap: var(--ui-space-1);
    align-items: flex-start;
  }

  .pt-gw-id {
    max-width: 100%;
  }
}
</style>
