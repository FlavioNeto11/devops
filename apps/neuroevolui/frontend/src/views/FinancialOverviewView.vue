<!--
  FinancialOverviewView — Dashboard Financeiro (REQ-NEUROEVOLUI-0005 / rota /financial).
  KPIs: receita bruta, transações confirmadas, transações falhas, ticket médio.
  Gráfico de receita por período (barras horizontais CSS-safe, buckets 5..100).
  Filtro por período e profissional.
  Tabela paginada de payment-transactions com status e link para a consulta.
  Endpoints REAIS:
    · GET /v1/payment-transactions  → lista paginada de transações
    · GET /v1/dashboard/revenue     → meta { revenue_cents, total, ... }
    · GET /v1/professionals         → catálogo para o filtro de profissional (fail-soft)
  CSP-safe: zero style= inline / :style / v-html — estado visual por class + data-* no <style scoped>.
  Estados: loading (skeleton), empty (com CTA), error (com retry), normal — todos cobertos.
-->
<template>
  <UiPageLayout
    eyebrow="NeuroEvolui · Financeiro"
    title="Financeiro"
    subtitle="Visão consolidada de receita, transações e indicadores financeiros da clínica."
    width="wide"
    :error="fatalError"
    @retry="load"
  >
    <template #actions>
      <UiButton variant="subtle" :loading="loadingTx" @click="reload">Atualizar</UiButton>
      <UiButton to="/transactions">Ver todas as transações</UiButton>
    </template>

    <!-- Filtros: período + profissional -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="onApply"
        @clear="onClear"
      />
    </template>

    <!-- Banner: acesso negado -->
    <template v-if="accessDenied" #banner>
      <div class="fo-banner fo-banner--warn" role="status">
        <span class="fo-banner-text">
          Seu perfil não tem acesso às transações financeiras. Esta área é restrita a gestores da clínica.
        </span>
        <UiButton variant="subtle" size="sm" to="/consultations">Ver agendamentos</UiButton>
      </div>
    </template>

    <!-- Banner: filtro ativo -->
    <template v-else-if="hasActiveFilters && !errorTx" #banner>
      <div class="fo-banner" role="status">
        <span class="fo-banner-text">
          Exibindo {{ format.formatNumber(filteredRows.length) }} de
          {{ format.formatNumber(rows.length) }} transações com os filtros aplicados.
        </span>
        <UiButton variant="subtle" size="sm" @click="onClear">Limpar filtros</UiButton>
      </div>
    </template>

    <!-- KPIs -->
    <section class="fo-metrics" aria-label="Indicadores financeiros">
      <UiMetricCard
        label="Receita bruta"
        :value="loadingRevenue ? null : revenueDisplay"
        :loading="loadingRevenue"
        tone="success"
        :hint="revenueHint"
      />
      <UiMetricCard
        label="Confirmadas"
        :value="loadingTx ? null : format.formatNumber(kpis.confirmed)"
        :loading="loadingTx"
        tone="primary"
        :hint="formatCents(kpis.confirmedCents)"
        clickable
        @click="setStatusFilter('confirmed')"
      />
      <UiMetricCard
        label="Pendentes"
        :value="loadingTx ? null : format.formatNumber(kpis.pending)"
        :loading="loadingTx"
        tone="warning"
        :hint="formatCents(kpis.pendingCents)"
        clickable
        @click="setStatusFilter('pending')"
      />
      <UiMetricCard
        label="Falhas"
        :value="loadingTx ? null : format.formatNumber(kpis.failed)"
        :loading="loadingTx"
        tone="error"
        hint="Cobranças recusadas"
        clickable
        @click="setStatusFilter('failed')"
      />
      <UiMetricCard
        label="Ticket médio"
        :value="loadingTx ? null : ticketDisplay"
        :loading="loadingTx"
        tone="running"
        hint="receita confirmada ÷ transações"
      />
    </section>

    <!-- Gráfico de receita por período + distribuição por gateway -->
    <div class="fo-grid">
      <!-- Receita por dia -->
      <UiCard title="Receita por dia" :subtitle="seriesSubtitle">
        <template #actions>
          <UiButton variant="ghost" size="sm" to="/revenue">Painel de receita</UiButton>
        </template>
        <UiLoadingState v-if="loadingTx" variant="skeleton" :skeleton-lines="6" />
        <UiErrorState
          v-else-if="errorTx && !accessDenied"
          :message="errorTx.message || 'Falha ao carregar transações.'"
          :code="errorTx.status ? String(errorTx.status) : null"
          retryable
          @retry="loadTransactions"
        />
        <UiEmptyState
          v-else-if="!dailySeries.length"
          title="Sem dados no período"
          description="Nenhuma transação confirmada nos filtros atuais. Ajuste o período ou verifique os agendamentos."
          icon="chart"
        >
          <template #action>
            <UiButton to="/consultations">Ver agendamentos</UiButton>
          </template>
        </UiEmptyState>
        <ul v-else class="fo-bars" role="list" aria-label="Receita por dia">
          <li
            v-for="b in dailySeries"
            :key="b.day"
            class="fo-bar-row"
            :aria-label="`${b.label}: ${b.display}`"
          >
            <span class="fo-bar-label" aria-hidden="true">{{ b.label }}</span>
            <span class="fo-bar-track" aria-hidden="true">
              <span class="fo-bar-fill" :data-pct="b.bucket" />
            </span>
            <span class="fo-bar-value" aria-hidden="true">{{ b.display }}</span>
          </li>
        </ul>
      </UiCard>

      <!-- Distribuição por gateway -->
      <UiCard
        title="Por gateway"
        subtitle="Transações agrupadas por provedor de pagamento."
      >
        <template #actions>
          <UiButton variant="ghost" size="sm" to="/transactions">Transações</UiButton>
        </template>
        <UiLoadingState v-if="loadingTx" variant="skeleton" :skeleton-lines="4" />
        <UiErrorState v-else-if="errorTx && !accessDenied" :message="errorMsg" @retry="loadTransactions" />
        <UiEmptyState
          v-else-if="!byGateway.length"
          title="Sem dados"
          description="Nenhuma transação no período para agrupar por gateway."
          icon="inbox"
        />
        <ul v-else class="fo-gw-list" role="list" aria-label="Transações por gateway">
          <li v-for="g in byGateway" :key="g.gateway" class="fo-gw-row">
            <span class="fo-gw-name">{{ gatewayLabel(g.gateway) }}</span>
            <span class="fo-gw-count">{{ format.formatNumber(g.count) }} tx</span>
            <span class="fo-gw-track" aria-hidden="true">
              <span class="fo-gw-fill" :data-pct="g.bucket" />
            </span>
            <span class="fo-gw-value">{{ formatCents(g.cents) }}</span>
          </li>
        </ul>
      </UiCard>
    </div>

    <!-- Tabela de transações paginada -->
    <UiCard title="Transações" :subtitle="tableSubtitle">
      <template #actions>
        <UiButton variant="ghost" size="sm" to="/transactions">Abrir lista completa</UiButton>
      </template>

      <UiDataTable
        :columns="columns"
        :rows="pagedRows"
        :loading="loadingTx"
        :error="tableError"
        row-key="id"
        density="compact"
        clickable-rows
        :sort="sort"
        :empty="emptyState"
        @update:sort="onSort"
        @row-click="openTransaction"
        @retry="loadTransactions"
      >
        <!-- Data -->
        <template #cell-created_at="{ value }">
          <span class="fo-when">{{ format.formatDateTime(value) }}</span>
        </template>

        <!-- Valor -->
        <template #cell-amount_cents="{ row }">
          <span class="fo-amount">{{ amountLabel(row) }}</span>
        </template>

        <!-- Status -->
        <template #cell-status="{ value }">
          <UiStatusBadge :status="value || 'pending'" :tone="statusTone(value)" :label="statusLabel(value)" with-dot />
        </template>

        <!-- Gateway -->
        <template #cell-gateway="{ value }">
          <span class="fo-gw-badge">{{ gatewayLabel(value) }}</span>
        </template>

        <!-- Agendamento vinculado -->
        <template #cell-consultation_id="{ value }">
          <span class="fo-mono">{{ value || '—' }}</span>
        </template>

        <!-- Paciente -->
        <template #cell-patient_id="{ value }">
          <span class="fo-mono">{{ value || '—' }}</span>
        </template>

        <!-- CTA no empty -->
        <template #empty-action>
          <div class="fo-empty-actions">
            <UiButton v-if="hasActiveFilters" variant="ghost" @click="onClear">Limpar filtros</UiButton>
            <UiButton to="/consultations">Ver agendamentos</UiButton>
          </div>
        </template>
      </UiDataTable>

      <!-- Paginação local -->
      <UiPagination
        v-if="!loadingTx && !errorTx && filteredRows.length > pageSize"
        :page="page"
        :page-size="pageSize"
        :total="filteredRows.length"
        @update:page="page = $event"
        @update:page-size="onPageSize"
      />
    </UiCard>

    <template #footer>
      <span>Escopo automático por clínica (tenant). Clique numa transação para abrir o agendamento vinculado. Atualizado: {{ lastUpdatedLabel }}.</span>
    </template>

    <!-- Modal de detalhe rápido -->
    <UiModal v-model:open="detailOpen" :title="detailTitle" width="md">
      <dl v-if="selected" class="fo-detail">
        <div class="fo-detail-row">
          <dt>Status</dt>
          <dd>
            <UiStatusBadge
              :status="selected.status || 'pending'"
              :tone="statusTone(selected.status)"
              :label="statusLabel(selected.status)"
              with-dot
            />
          </dd>
        </div>
        <div class="fo-detail-row">
          <dt>Valor</dt>
          <dd class="fo-detail-amount">{{ amountLabel(selected) }}</dd>
        </div>
        <div class="fo-detail-row">
          <dt>Moeda</dt>
          <dd>{{ (selected.currency || 'BRL').toUpperCase() }}</dd>
        </div>
        <div class="fo-detail-row">
          <dt>Gateway</dt>
          <dd>{{ gatewayLabel(selected.gateway) }}</dd>
        </div>
        <div class="fo-detail-row">
          <dt>ID externo</dt>
          <dd class="fo-detail-mono">{{ selected.external_id || '—' }}</dd>
        </div>
        <div class="fo-detail-row">
          <dt>Tipo de evento</dt>
          <dd>{{ format.humanize(selected.event_type) || '—' }}</dd>
        </div>
        <div class="fo-detail-row">
          <dt>Agendamento</dt>
          <dd class="fo-detail-mono">{{ selected.consultation_id || '—' }}</dd>
        </div>
        <div class="fo-detail-row">
          <dt>Paciente</dt>
          <dd class="fo-detail-mono">{{ selected.patient_id || '—' }}</dd>
        </div>
        <div class="fo-detail-row">
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
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiPagination,
  UiFiltersPanel,
  UiStatusBadge,
  UiModal,
  UiButton,
  UiEmptyState,
  UiErrorState,
  UiLoadingState,
  useToast,
  format,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

const router = useRouter();
const toast = useToast();

// Recursos REAIS de domínio.
const transactionsApi = resourceFactory('payment-transactions');
const revenueApi = resourceFactory('dashboard/revenue');
const professionalsApi = resourceFactory('professionals');

// ── Estado ────────────────────────────────────────────────────────────────────
const rows = ref([]);
const loadingTx = ref(false);
const errorTx = ref(null);

const loadingRevenue = ref(false);
const errorRevenue = ref(null);
const revenueMeta = ref(null); // { revenue_cents, total, ... }

const professionals = ref([]); // [{ id, full_name }]

const sort = ref({ key: 'created_at', dir: 'desc' });
const page = ref(1);
const pageSize = ref(25);
const lastUpdated = ref(null);

const filters = reactive({ date_from: '', date_to: '', status: '', professional_id: '' });

// Modal de detalhe rápido
const detailOpen = ref(false);
const selected = ref(null);

// ── Enums ────────────────────────────────────────────────────────────────────
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
  pagarme: 'Pagar.me',
  mercadopago: 'Mercado Pago',
  manual: 'Manual',
};

function norm(v) { return String(v || '').trim().toLowerCase(); }
const statusLabel = (v) => STATUS_LABELS[norm(v)] || format.humanize(v);
const statusTone = (v) => STATUS_TONES[norm(v)] || 'neutral';
const gatewayLabel = (v) => GATEWAY_LABELS[norm(v)] || (v ? format.humanize(v) : '—');

// ── Helpers ──────────────────────────────────────────────────────────────────
function isDenied(err) {
  return !!err && (err.status === 401 || err.status === 403);
}
function formatCents(cents) {
  const n = Number(cents);
  if (!isFinite(n)) return '—';
  return format.formatCurrency(n / 100);
}
function amountLabel(row) {
  if (!row) return '—';
  const n = Number(row.amount_cents);
  if (!isFinite(n)) return '—';
  const cur = (row.currency ? String(row.currency) : 'BRL').toUpperCase();
  return format.formatCurrency(n / 100, cur);
}
function unwrap(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  return [];
}

// ── Filtros ──────────────────────────────────────────────────────────────────
const hasActiveFilters = computed(() =>
  Object.values(filters).some((v) => norm(v) !== ''),
);

const filteredRows = computed(() => {
  const f = filters;
  return rows.value.filter((r) => {
    if (f.status && norm(r.status) !== norm(f.status)) return false;
    if (f.professional_id && String(r.professional_id || '') !== String(f.professional_id)) return false;
    if (f.date_from) {
      const from = new Date(f.date_from + 'T00:00:00').getTime();
      const t = new Date(r.created_at).getTime();
      if (isFinite(from) && isFinite(t) && t < from) return false;
    }
    if (f.date_to) {
      const to = new Date(f.date_to + 'T23:59:59').getTime();
      const t = new Date(r.created_at).getTime();
      if (isFinite(to) && isFinite(t) && t > to) return false;
    }
    return true;
  });
});

// ── Ordenação ────────────────────────────────────────────────────────────────
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

// ── Paginação local ──────────────────────────────────────────────────────────
const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedRows.value.slice(start, start + pageSize.value);
});

// ── KPIs derivados das transações ────────────────────────────────────────────
const kpis = computed(() => {
  const src = filteredRows.value;
  let confirmed = 0, confirmedCents = 0;
  let pending = 0, pendingCents = 0;
  let failed = 0, refunded = 0;
  for (const r of src) {
    const st = norm(r.status);
    const cents = Number(r.amount_cents) || 0;
    if (st === 'confirmed') { confirmed++; confirmedCents += cents; }
    else if (st === 'pending') { pending++; pendingCents += cents; }
    else if (st === 'failed') { failed++; }
    else if (st === 'refunded') { refunded++; }
  }
  return { confirmed, confirmedCents, pending, pendingCents, failed, refunded, total: src.length };
});

const ticketDisplay = computed(() => {
  if (!kpis.value.confirmed) return '—';
  return formatCents(kpis.value.confirmedCents / kpis.value.confirmed);
});

// ── KPI receita (via dashboard/revenue) ──────────────────────────────────────
const revenueDisplay = computed(() => {
  if (!revenueMeta.value) return '—';
  return formatCents(revenueMeta.value.revenue_cents);
});
const revenueHint = computed(() => {
  if (loadingRevenue.value) return 'apurando…';
  if (isDenied(errorRevenue.value)) return 'requer perfil de gestão';
  if (errorRevenue.value) return 'falha ao apurar';
  const total = revenueMeta.value && revenueMeta.value.total != null ? revenueMeta.value.total : 0;
  return total ? `de ${format.formatNumber(total)} cobrança(s)` : 'nenhuma cobrança ainda';
});

// ── Série diária (barras) ─────────────────────────────────────────────────────
const confirmedRows = computed(() =>
  filteredRows.value.filter((r) => norm(r.status) === 'confirmed'),
);
const dailySeries = computed(() => {
  const map = new Map();
  for (const r of confirmedRows.value) {
    const d = new Date(r.created_at);
    if (isNaN(d.getTime())) continue;
    const key = d.toISOString().slice(0, 10);
    map.set(key, (map.get(key) || 0) + (Number(r.amount_cents) || 0));
  }
  const entries = [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const max = entries.reduce((m, [, v]) => Math.max(m, v), 0) || 1;
  return entries.slice(-14).map(([day, cents]) => ({
    day,
    label: format.formatDate(day),
    cents,
    display: formatCents(cents),
    bucket: Math.max(1, Math.round((cents / max) * 20)) * 5,
  }));
});
const seriesSubtitle = computed(() => {
  if (loadingTx.value) return 'Carregando…';
  const n = dailySeries.value.length;
  return n
    ? `${n} dia(s) com receita confirmada — últimas 2 semanas da amostra`
    : 'Sem transações confirmadas no período';
});

// ── Distribuição por gateway ──────────────────────────────────────────────────
const byGateway = computed(() => {
  const map = new Map();
  for (const r of filteredRows.value) {
    const gw = norm(r.gateway) || 'desconhecido';
    const cur = map.get(gw) || { gateway: r.gateway || gw, count: 0, cents: 0 };
    cur.count++;
    cur.cents += Number(r.amount_cents) || 0;
    map.set(gw, cur);
  }
  const entries = [...map.values()].sort((a, b) => b.cents - a.cents);
  const max = entries.reduce((m, e) => Math.max(m, e.cents), 0) || 1;
  return entries.map((e) => ({
    ...e,
    bucket: Math.max(1, Math.round((e.cents / max) * 20)) * 5,
  }));
});

// ── Campos do filtro ─────────────────────────────────────────────────────────
const filterFields = computed(() => [
  { key: 'date_from', label: 'De', type: 'date' },
  { key: 'date_to', label: 'Até', type: 'date' },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'pending', label: 'Pendente' },
      { value: 'confirmed', label: 'Confirmada' },
      { value: 'failed', label: 'Falhou' },
      { value: 'refunded', label: 'Reembolsada' },
    ],
  },
  {
    key: 'professional_id',
    label: 'Profissional',
    type: 'select',
    options: professionals.value.map((p) => ({
      value: String(p.id),
      label: p.full_name || p.name || '#' + p.id,
    })),
  },
]);

// ── Colunas da tabela ────────────────────────────────────────────────────────
const columns = [
  { key: 'created_at', label: 'Data', sortable: true },
  { key: 'gateway', label: 'Gateway', sortable: true },
  { key: 'patient_id', label: 'Paciente' },
  { key: 'consultation_id', label: 'Agendamento' },
  { key: 'amount_cents', label: 'Valor', align: 'right', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
];

// ── Estados ──────────────────────────────────────────────────────────────────
const accessDenied = computed(() => isDenied(errorTx.value));
const fatalError = computed(() => {
  if (!errorTx.value) return null;
  if (accessDenied.value) return null; // tratado pelo banner
  return errorTx.value.message || 'Não foi possível carregar as transações.';
});
const errorMsg = computed(() =>
  accessDenied.value
    ? 'Sem acesso às transações financeiras.'
    : (errorTx.value && errorTx.value.message) || 'Falha ao carregar transações.',
);
const tableError = computed(() => (errorTx.value && !accessDenied.value ? errorMsg.value : null));

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

const tableSubtitle = computed(() => {
  if (loadingTx.value) return 'Carregando transações…';
  const total = filteredRows.value.length;
  if (!total) return 'Nenhuma transação no período';
  return `${format.formatNumber(total)} transação(ões) · clique para abrir o agendamento`;
});

const lastUpdatedLabel = computed(() =>
  lastUpdated.value ? format.formatDateTime(lastUpdated.value) : '—',
);

const detailTitle = computed(() => {
  if (!selected.value) return 'Transação';
  return 'Transação · ' + amountLabel(selected.value);
});

// ── Carregamento ─────────────────────────────────────────────────────────────
async function loadTransactions() {
  loadingTx.value = true;
  errorTx.value = null;
  try {
    const res = await transactionsApi.list({ pageSize: 500 });
    rows.value = unwrap(res);
  } catch (e) {
    errorTx.value = e;
    rows.value = [];
  } finally {
    loadingTx.value = false;
  }
}

async function loadRevenue() {
  loadingRevenue.value = true;
  errorRevenue.value = null;
  try {
    const res = await revenueApi.list();
    const env = res || {};
    // Contrato: { data: [...], meta: { total, revenue_cents, ... } }
    if (env.meta && !Array.isArray(env.meta)) {
      revenueMeta.value = env.meta;
    } else if (env.data && !Array.isArray(env.data)) {
      revenueMeta.value = env.data;
    } else {
      revenueMeta.value = env;
    }
  } catch (e) {
    errorRevenue.value = e;
    revenueMeta.value = null;
  } finally {
    loadingRevenue.value = false;
  }
}

async function loadProfessionals() {
  try {
    const res = await professionalsApi.list({ pageSize: 200 });
    professionals.value = unwrap(res);
  } catch {
    professionals.value = [];
  }
}

async function load() {
  await Promise.allSettled([loadTransactions(), loadRevenue(), loadProfessionals()]);
  lastUpdated.value = new Date().toISOString();
}

// ── Ações / interações ────────────────────────────────────────────────────────
function onApply() {
  page.value = 1;
  toast.success('Filtros aplicados');
}
function onClear() {
  filters.date_from = '';
  filters.date_to = '';
  filters.status = '';
  filters.professional_id = '';
  page.value = 1;
}
function onSort(s) {
  sort.value = s;
  page.value = 1;
}
function onPageSize(size) {
  pageSize.value = size;
  page.value = 1;
}
function setStatusFilter(status) {
  filters.status = status;
  page.value = 1;
  toast.info(`Filtro: ${statusLabel(status)}`);
}
function openTransaction(row) {
  // Detalhe rápido no modal; se houver consultation_id, oferece link direto.
  selected.value = row;
  detailOpen.value = true;
}

async function reload() {
  await load();
  if (accessDenied.value) {
    toast.error('Sem acesso às transações.', { detail: 'Requer perfil de gestão da clínica.' });
  } else if (errorTx.value) {
    toast.error('Falha ao atualizar as transações.');
  } else {
    toast.success('Dados atualizados.');
  }
}

onMounted(load);
</script>

<style scoped>
/* KPIs */
.fo-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}

/* Grid: série + gateway */
.fo-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: var(--ui-space-4);
  align-items: start;
}

/* Banner */
.fo-banner {
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
.fo-banner--warn {
  background: rgb(var(--ui-warn) / 0.1);
  border-color: rgb(var(--ui-warn) / 0.35);
}
.fo-banner-text {
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

/* Barras de receita por dia */
.fo-bars {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.fo-bar-row {
  display: grid;
  grid-template-columns: 88px 1fr auto;
  align-items: center;
  gap: var(--ui-space-3);
}
.fo-bar-label {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  white-space: nowrap;
}
.fo-bar-track {
  position: relative;
  height: 14px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  overflow: hidden;
}
.fo-bar-fill {
  display: block;
  height: 100%;
  border-radius: var(--ui-radius-pill);
  background: linear-gradient(90deg, rgb(var(--ui-ok) / 0.5), rgb(var(--ui-ok)));
  transition: width 0.4s ease;
}
.fo-bar-value {
  font-family: var(--ui-font-display);
  font-weight: 600;
  font-size: var(--ui-text-sm);
  white-space: nowrap;
}

/* Buckets de largura 5..100 (CSP-safe — sem :style) */
.fo-bar-fill[data-pct="5"]   { width: 5%; }
.fo-bar-fill[data-pct="10"]  { width: 10%; }
.fo-bar-fill[data-pct="15"]  { width: 15%; }
.fo-bar-fill[data-pct="20"]  { width: 20%; }
.fo-bar-fill[data-pct="25"]  { width: 25%; }
.fo-bar-fill[data-pct="30"]  { width: 30%; }
.fo-bar-fill[data-pct="35"]  { width: 35%; }
.fo-bar-fill[data-pct="40"]  { width: 40%; }
.fo-bar-fill[data-pct="45"]  { width: 45%; }
.fo-bar-fill[data-pct="50"]  { width: 50%; }
.fo-bar-fill[data-pct="55"]  { width: 55%; }
.fo-bar-fill[data-pct="60"]  { width: 60%; }
.fo-bar-fill[data-pct="65"]  { width: 65%; }
.fo-bar-fill[data-pct="70"]  { width: 70%; }
.fo-bar-fill[data-pct="75"]  { width: 75%; }
.fo-bar-fill[data-pct="80"]  { width: 80%; }
.fo-bar-fill[data-pct="85"]  { width: 85%; }
.fo-bar-fill[data-pct="90"]  { width: 90%; }
.fo-bar-fill[data-pct="95"]  { width: 95%; }
.fo-bar-fill[data-pct="100"] { width: 100%; }

/* Gateway distribution */
.fo-gw-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.fo-gw-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-rows: auto auto;
  grid-template-areas:
    "name name value"
    "count track value";
  gap: var(--ui-space-1) var(--ui-space-3);
  align-items: center;
}
.fo-gw-name {
  grid-area: name;
  font-weight: 600;
  font-size: var(--ui-text-sm);
}
.fo-gw-count {
  grid-area: count;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  white-space: nowrap;
}
.fo-gw-track {
  grid-area: track;
  height: 8px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  overflow: hidden;
}
.fo-gw-fill {
  display: block;
  height: 100%;
  border-radius: var(--ui-radius-pill);
  background: linear-gradient(90deg, rgb(var(--ui-accent) / 0.55), rgb(var(--ui-accent-strong)));
  transition: width 0.4s ease;
}
/* Buckets gw (mesma sequência) */
.fo-gw-fill[data-pct="5"]   { width: 5%; }
.fo-gw-fill[data-pct="10"]  { width: 10%; }
.fo-gw-fill[data-pct="15"]  { width: 15%; }
.fo-gw-fill[data-pct="20"]  { width: 20%; }
.fo-gw-fill[data-pct="25"]  { width: 25%; }
.fo-gw-fill[data-pct="30"]  { width: 30%; }
.fo-gw-fill[data-pct="35"]  { width: 35%; }
.fo-gw-fill[data-pct="40"]  { width: 40%; }
.fo-gw-fill[data-pct="45"]  { width: 45%; }
.fo-gw-fill[data-pct="50"]  { width: 50%; }
.fo-gw-fill[data-pct="55"]  { width: 55%; }
.fo-gw-fill[data-pct="60"]  { width: 60%; }
.fo-gw-fill[data-pct="65"]  { width: 65%; }
.fo-gw-fill[data-pct="70"]  { width: 70%; }
.fo-gw-fill[data-pct="75"]  { width: 75%; }
.fo-gw-fill[data-pct="80"]  { width: 80%; }
.fo-gw-fill[data-pct="85"]  { width: 85%; }
.fo-gw-fill[data-pct="90"]  { width: 90%; }
.fo-gw-fill[data-pct="95"]  { width: 95%; }
.fo-gw-fill[data-pct="100"] { width: 100%; }
.fo-gw-value {
  grid-area: value;
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-sm);
  white-space: nowrap;
  text-align: right;
}

/* Tabela */
.fo-when {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.fo-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  white-space: nowrap;
}
.fo-gw-badge {
  font-weight: 600;
  font-size: var(--ui-text-sm);
}
.fo-mono {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.fo-empty-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  justify-content: center;
}

/* Modal de detalhe */
.fo-detail {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  margin: 0;
}
.fo-detail-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: var(--ui-space-3);
  align-items: center;
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.fo-detail-row:last-child { border-bottom: none; }
.fo-detail dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.fo-detail dd {
  margin: 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}
.fo-detail-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: var(--ui-text-md);
}
.fo-detail-mono {
  font-family: var(--ui-font-mono, monospace);
  word-break: break-all;
}

/* Responsivo */
@media (max-width: 860px) {
  .fo-metrics {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--ui-space-3);
  }
  .fo-grid {
    grid-template-columns: 1fr;
  }
  .fo-bar-row {
    grid-template-columns: 72px 1fr auto;
  }
  .fo-detail-row {
    grid-template-columns: 1fr;
    gap: var(--ui-space-1);
    align-items: start;
  }
}
</style>
