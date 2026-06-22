<template>
  <UiPageLayout
    eyebrow="Financeiro · Reconciliação"
    title="Transações de pagamento"
    subtitle="Trilha de auditoria das cobranças: valor, situação, gateway, Idempotency-Key e horário. Base da reconciliação."
    width="wide"
    :error="loadError"
    @retry="load"
  >
    <!-- Ações de cabeçalho -->
    <template #actions>
      <UiButton variant="ghost" :loading="loading" @click="load">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton
        variant="subtle"
        :disabled="!filteredRows.length || loading"
        @click="exportCsv"
      >
        <template #icon-left><span aria-hidden="true">⬇</span></template>
        Exportar CSV
      </UiButton>
    </template>

    <!-- Filtros (sobre os registros REAIS carregados) -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="onApply"
        @clear="onClear"
      />
    </template>

    <!-- Aviso de fonte: a trilha mantém as últimas cobranças em memória do gateway -->
    <template #banner>
      <div class="tx-banner" role="note">
        <span class="tx-banner-icon" aria-hidden="true">🛈</span>
        <p class="tx-banner-text">
          A trilha exibe as <strong>{{ totalLoaded }}</strong> cobranças mais recentes processadas pelo
          gateway <strong>{{ gatewayLabel }}</strong>. Use a Idempotency-Key para conciliar com o pedido.
        </p>
      </div>
    </template>

    <!-- KPIs derivados das transações reais -->
    <div class="tx-kpis" role="group" aria-label="Indicadores de transações">
      <UiMetricCard
        label="Transações"
        :value="kpis.count"
        tone="primary"
        :hint="kpis.count === totalLoaded ? 'Total carregado' : 'Após filtros'"
        :loading="loading"
      />
      <UiMetricCard
        label="Volume autorizado"
        :value="format.formatCurrency(kpis.authorizedVolume)"
        tone="success"
        hint="Soma das cobranças autorizadas"
        :loading="loading"
      />
      <UiMetricCard
        label="Recusadas"
        :value="kpis.declined"
        tone="error"
        :hint="kpis.count ? kpis.declinedRate + '% das exibidas' : 'Sem dados'"
        :loading="loading"
      />
      <UiMetricCard
        label="Estornos"
        :value="kpis.refunded"
        tone="warning"
        hint="Cobranças estornadas"
        :loading="loading"
      />
    </div>

    <!-- Tabela da trilha de auditoria -->
    <UiCard title="Trilha de auditoria" :subtitle="resultSummary">
      <template #actions>
        <UiStatusBadge
          v-if="hasActiveFilter"
          tone="running"
          status="Filtro ativo"
          :with-dot="true"
          size="sm"
        />
      </template>

      <UiDataTable
        :columns="columns"
        :rows="pageRows"
        row-key="rowId"
        density="comfortable"
        clickable-rows
        server-mode
        :loading="loading"
        :sort="sort"
        :page="page"
        :page-size="pageSize"
        :total="filteredRows.length"
        paginated
        :empty="emptyState"
        @row-click="openDetail"
        @update:sort="setSort"
        @update:page="setPage"
        @update:page-size="setPageSize"
      >
        <!-- Transação + pedido -->
        <template #cell-transactionId="{ row }">
          <div class="tx-id">
            <span class="tx-id-main ui-mono">{{ row.transactionId || '—' }}</span>
            <span class="tx-id-sub">{{ row.orderId ? 'Pedido ' + row.orderId : 'Pedido não vinculado' }}</span>
          </div>
        </template>

        <!-- Tipo de evento -->
        <template #cell-event="{ value }">
          <span class="tx-event" :data-event="value">
            <span class="tx-event-mark" aria-hidden="true">{{ eventIcon(value) }}</span>
            {{ eventLabel(value) }}
          </span>
        </template>

        <!-- Valor -->
        <template #cell-amount="{ value }">
          <span v-if="value != null && value !== ''" class="tx-amount">{{ format.formatCurrency(value) }}</span>
          <span v-else class="ui-muted">—</span>
        </template>

        <!-- Gateway -->
        <template #cell-provider="{ value }">
          <span class="tx-provider">{{ providerLabel(value) }}</span>
        </template>

        <!-- Situação -->
        <template #cell-status="{ value }">
          <UiStatusBadge :status="value" :label="statusLabelFor(value)" />
        </template>

        <!-- Idempotency-Key -->
        <template #cell-idempotencyKey="{ row }">
          <button
            v-if="row.idempotencyKey"
            type="button"
            class="tx-key"
            :title="'Copiar ' + row.idempotencyKey"
            @click.stop="copyKey(row.idempotencyKey)"
          >
            <span class="ui-mono tx-key-text">{{ row.idempotencyKey }}</span>
            <span class="tx-key-copy" aria-hidden="true">⧉</span>
          </button>
          <span v-else class="ui-muted">—</span>
        </template>

        <!-- Horário -->
        <template #cell-at="{ value }">
          {{ format.formatDateTime(value) }}
        </template>

        <!-- Ações por linha -->
        <template #cell-actions="{ row }">
          <div class="tx-actions" @click.stop>
            <UiButton variant="ghost" size="sm" @click="openDetail(row)">Detalhes</UiButton>
          </div>
        </template>

        <!-- Sem resultados após filtro -->
        <template #empty-action>
          <UiButton v-if="hasActiveFilter" variant="ghost" @click="onClear">Limpar filtros</UiButton>
          <UiButton v-else variant="ghost" @click="load">Recarregar trilha</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- Modal: detalhe da transação -->
    <UiModal v-model:open="detailOpen" :title="detailTitle" width="md">
      <dl v-if="detail" class="tx-detail">
        <div class="tx-detail-row">
          <dt>ID da transação</dt>
          <dd class="ui-mono">{{ detail.transactionId || '—' }}</dd>
        </div>
        <div class="tx-detail-row">
          <dt>Pedido</dt>
          <dd>{{ detail.orderId || 'Não vinculado' }}</dd>
        </div>
        <div class="tx-detail-row">
          <dt>Evento</dt>
          <dd>
            <span class="tx-event" :data-event="detail.event">
              <span class="tx-event-mark" aria-hidden="true">{{ eventIcon(detail.event) }}</span>
              {{ eventLabel(detail.event) }}
            </span>
          </dd>
        </div>
        <div class="tx-detail-row">
          <dt>Situação</dt>
          <dd><UiStatusBadge :status="detail.status" :label="statusLabelFor(detail.status)" /></dd>
        </div>
        <div class="tx-detail-row">
          <dt>Valor</dt>
          <dd class="tx-amount">{{ detail.amount != null && detail.amount !== '' ? format.formatCurrency(detail.amount) : '—' }}</dd>
        </div>
        <div class="tx-detail-row">
          <dt>Gateway</dt>
          <dd>{{ providerLabel(detail.provider) }}</dd>
        </div>
        <div class="tx-detail-row">
          <dt>Idempotency-Key</dt>
          <dd class="tx-detail-key">
            <span class="ui-mono">{{ detail.idempotencyKey || '—' }}</span>
            <UiButton
              v-if="detail.idempotencyKey"
              variant="ghost"
              size="sm"
              @click="copyKey(detail.idempotencyKey)"
            >
              Copiar
            </UiButton>
          </dd>
        </div>
        <div class="tx-detail-row">
          <dt>Horário</dt>
          <dd>{{ format.formatDateTime(detail.at) }}</dd>
        </div>
        <div v-if="detail.error" class="tx-detail-row tx-detail-error">
          <dt>Erro</dt>
          <dd>{{ detail.error }}</dd>
        </div>
      </dl>
      <UiEmptyState
        v-else
        title="Sem detalhes"
        description="Selecione uma transação na trilha para inspecionar."
        icon="🧾"
      />
      <template #footer>
        <UiButton
          v-if="detail && detail.idempotencyKey"
          variant="ghost"
          @click="copyKey(detail.idempotencyKey)"
        >
          Copiar Idempotency-Key
        </UiButton>
        <UiButton variant="primary" @click="detailOpen = false">Fechar</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiFiltersPanel,
  UiStatusBadge,
  UiButton,
  UiModal,
  UiEmptyState,
  useToast,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

const toast = useToast();

// ---------------------------------------------------------------------------
// Fonte REAL da trilha de auditoria: GET /v1/checkout/audit -> { data: [...] }.
// Cada entrada do gateway carrega: { at, event, idempotencyKey, transactionId,
// status, amount } (e, quando houver, provider/orderId/error). O endpoint
// devolve as cobranças mais recentes — sem paginação no servidor — então
// filtramos/ordenamos/paginamos no cliente sobre os registros reais.
//
// Se o integrador tiver fiado resourceFactory("transactions") (api.transactions),
// preferimos esse recurso; caso contrário caímos no endpoint canônico de auditoria,
// reusando a MESMA base da api.js (sem inventar rota).
// ---------------------------------------------------------------------------
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/shopdesk/api';

async function fetchAuditTrail() {
  const tx = api.transactions;
  if (tx && typeof tx.list === 'function') {
    const res = await tx.list();
    return Array.isArray(res) ? res : res.data || res.items || [];
  }
  const res = await fetch(API_BASE + '/v1/checkout/audit', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error((data && data.error && data.error.message) || 'HTTP ' + res.status);
    e.status = res.status;
    throw e;
  }
  return data.data || data.items || (Array.isArray(data) ? data : []);
}

// Normaliza cada entrada em uma linha estável (rowId p/ key + sort determinístico).
function normalize(entry, index) {
  const e = entry || {};
  return {
    rowId: e.id || e.transactionId ? String(e.id || e.transactionId) + ':' + index : 'tx-' + index,
    transactionId: e.transactionId ?? e.transaction_id ?? '',
    orderId: e.orderId ?? e.order_id ?? '',
    event: e.event ?? 'charge',
    status: e.status ?? '',
    amount: e.amount ?? e.value ?? null,
    provider: e.provider ?? '',
    idempotencyKey: e.idempotencyKey ?? e.idempotency_key ?? '',
    at: e.at ?? e.createdAt ?? e.created_at ?? e.timestamp ?? null,
    error: e.error ?? '',
  };
}

const rows = ref([]);
const loading = ref(false);
const loadError = ref(null);

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const raw = await fetchAuditTrail();
    rows.value = raw.map(normalize);
  } catch (e) {
    loadError.value = e.message || 'Não foi possível carregar a trilha de auditoria.';
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

const totalLoaded = computed(() => rows.value.length);
const gatewayLabel = computed(() => {
  const p = rows.value.find((r) => r.provider)?.provider;
  return p ? providerLabel(p) : 'sandbox';
});

// ---------------------------------------------------------------------------
// Rótulos legíveis dos enums do domínio (o kit resolve o TOM por palavra-chave).
// ---------------------------------------------------------------------------
const STATUS_LABELS = {
  authorized: 'Autorizada',
  autorizada: 'Autorizada',
  captured: 'Capturada',
  capturada: 'Capturada',
  declined: 'Recusada',
  recusada: 'Recusada',
  refunded: 'Estornada',
  estornada: 'Estornada',
  pending: 'Pendente',
  pendente: 'Pendente',
};
const statusLabelFor = (v) => STATUS_LABELS[String(v || '').toLowerCase()] || format.humanize(v);

const EVENT_LABELS = { charge: 'Cobrança', refund: 'Estorno', capture: 'Captura' };
const eventLabel = (v) => EVENT_LABELS[String(v || '').toLowerCase()] || format.humanize(v);
const eventIcon = (v) => (String(v).toLowerCase() === 'refund' ? '↩' : String(v).toLowerCase() === 'capture' ? '✓' : '＋');

const PROVIDER_LABELS = { sandbox: 'Sandbox', real: 'PSP (produção)' };
const providerLabel = (v) => (v ? PROVIDER_LABELS[String(v).toLowerCase()] || format.humanize(v) : '—');

// ---------------------------------------------------------------------------
// Colunas da trilha.
// ---------------------------------------------------------------------------
const columns = [
  { key: 'transactionId', label: 'Transação / Pedido', sortable: true },
  { key: 'event', label: 'Evento', sortable: true },
  { key: 'amount', label: 'Valor', align: 'right', sortable: true },
  { key: 'provider', label: 'Gateway' },
  { key: 'status', label: 'Situação', sortable: true },
  { key: 'idempotencyKey', label: 'Idempotency-Key' },
  { key: 'at', label: 'Horário', sortable: true },
  { key: 'actions', label: '', align: 'right' },
];

// ---------------------------------------------------------------------------
// Filtros (todos aplicados no cliente sobre os registros reais).
// ---------------------------------------------------------------------------
const filterFields = [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'transação, pedido ou key' },
  {
    key: 'status',
    label: 'Situação',
    type: 'select',
    options: [
      { value: 'authorized', label: 'Autorizada' },
      { value: 'captured', label: 'Capturada' },
      { value: 'declined', label: 'Recusada' },
      { value: 'refunded', label: 'Estornada' },
    ],
  },
  {
    key: 'event',
    label: 'Evento',
    type: 'select',
    options: [
      { value: 'charge', label: 'Cobrança' },
      { value: 'refund', label: 'Estorno' },
    ],
  },
  { key: 'from', label: 'De', type: 'date' },
  { key: 'to', label: 'Até', type: 'date' },
];
const blankFilters = () => ({ q: '', status: '', event: '', from: '', to: '' });
const filters = ref(blankFilters());

const hasActiveFilter = computed(() => {
  const f = filters.value;
  return !!(f.q || f.status || f.event || f.from || f.to);
});

function matchesStatus(row, want) {
  if (!want) return true;
  const s = String(row.status || '').toLowerCase();
  // aceita sinônimos pt/en mapeados ao mesmo rótulo
  return statusLabelFor(s) === statusLabelFor(want);
}

const filteredRows = computed(() => {
  const f = filters.value;
  const q = f.q.trim().toLowerCase();
  const fromTs = f.from ? new Date(f.from + 'T00:00:00').getTime() : null;
  const toTs = f.to ? new Date(f.to + 'T23:59:59').getTime() : null;
  return rows.value.filter((row) => {
    if (q) {
      const hay = [row.transactionId, row.orderId, row.idempotencyKey].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (!matchesStatus(row, f.status)) return false;
    if (f.event && String(row.event).toLowerCase() !== f.event) return false;
    if (fromTs != null || toTs != null) {
      const ts = row.at ? new Date(row.at).getTime() : NaN;
      if (isNaN(ts)) return false;
      if (fromTs != null && ts < fromTs) return false;
      if (toTs != null && ts > toTs) return false;
    }
    return true;
  });
});

// ---------------------------------------------------------------------------
// Ordenação + paginação no cliente.
// ---------------------------------------------------------------------------
const sort = ref({ key: 'at', dir: 'desc' });
const page = ref(1);
const pageSize = ref(25);

const sortedRows = computed(() => {
  const s = sort.value;
  if (!s || !s.key) return filteredRows.value;
  const mul = s.dir === 'desc' ? -1 : 1;
  const isNum = s.key === 'amount';
  const isDate = s.key === 'at';
  return [...filteredRows.value].sort((a, b) => {
    let x = a[s.key];
    let y = b[s.key];
    if (isNum) {
      x = Number(x);
      y = Number(y);
      if (isNaN(x)) x = -Infinity;
      if (isNaN(y)) y = -Infinity;
    } else if (isDate) {
      x = x ? new Date(x).getTime() : 0;
      y = y ? new Date(y).getTime() : 0;
    } else {
      x = String(x ?? '').toLowerCase();
      y = String(y ?? '').toLowerCase();
    }
    return (x > y ? 1 : x < y ? -1 : 0) * mul;
  });
});

const pageRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedRows.value.slice(start, start + pageSize.value);
});

function setSort(s) {
  sort.value = s;
  page.value = 1;
}
function setPage(p) {
  page.value = p;
}
function setPageSize(size) {
  pageSize.value = size;
  page.value = 1;
}
function onApply() {
  page.value = 1;
}
function onClear() {
  filters.value = blankFilters();
  page.value = 1;
}

// ---------------------------------------------------------------------------
// KPIs derivados das linhas filtradas (reais).
// ---------------------------------------------------------------------------
const kpis = computed(() => {
  const list = filteredRows.value;
  const isAuth = (r) => ['authorized', 'autorizada', 'captured', 'capturada'].includes(String(r.status).toLowerCase());
  const isDeclined = (r) => ['declined', 'recusada'].includes(String(r.status).toLowerCase());
  const isRefunded = (r) =>
    ['refunded', 'estornada'].includes(String(r.status).toLowerCase()) || String(r.event).toLowerCase() === 'refund';
  const declined = list.filter(isDeclined).length;
  return {
    count: list.length,
    authorizedVolume: list.filter(isAuth).reduce((s, r) => s + (Number(r.amount) || 0), 0),
    declined,
    declinedRate: list.length ? Math.round((declined / list.length) * 100) : 0,
    refunded: list.filter(isRefunded).length,
  };
});

const resultSummary = computed(() => {
  if (loading.value) return 'Carregando trilha…';
  if (!totalLoaded.value) return 'Nenhuma transação registrada';
  const shown = filteredRows.value.length;
  if (hasActiveFilter.value) return shown + ' de ' + totalLoaded.value + ' (filtro ativo)';
  return shown + ' transações na trilha';
});

const emptyState = computed(() =>
  hasActiveFilter.value
    ? { title: 'Nenhuma transação no filtro', description: 'Ajuste a busca, a situação ou o período.', icon: '🔍' }
    : {
        title: 'Trilha de auditoria vazia',
        description: 'As cobranças aparecerão aqui assim que o gateway processar o primeiro pagamento.',
        icon: '🧾',
      },
);

// ---------------------------------------------------------------------------
// Detalhe (modal sobre a linha real já carregada — sem chamada extra).
// ---------------------------------------------------------------------------
const detailOpen = ref(false);
const detail = ref(null);
const detailTitle = computed(() =>
  detail.value ? 'Transação ' + (detail.value.transactionId || detail.value.orderId || '') : 'Transação',
);
function openDetail(row) {
  detail.value = row;
  detailOpen.value = true;
}

// ---------------------------------------------------------------------------
// Copiar Idempotency-Key (sem efeito colateral no servidor; CSP-safe).
// ---------------------------------------------------------------------------
async function copyKey(key) {
  if (!key) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(key);
      toast.success('Idempotency-Key copiada.');
    } else {
      toast.info('Idempotency-Key: ' + key);
    }
  } catch {
    toast.error('Não foi possível copiar a chave.');
  }
}

// ---------------------------------------------------------------------------
// Exportar CSV (cliente, sobre as linhas filtradas; CSP-safe via Blob).
// ---------------------------------------------------------------------------
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCsv() {
  const list = sortedRows.value;
  if (!list.length) {
    toast.warning('Nada para exportar.');
    return;
  }
  const head = ['Transação', 'Pedido', 'Evento', 'Valor', 'Gateway', 'Situação', 'Idempotency-Key', 'Horário'];
  const lines = [head.join(';')];
  for (const r of list) {
    lines.push(
      [
        csvCell(r.transactionId),
        csvCell(r.orderId),
        csvCell(eventLabel(r.event)),
        csvCell(r.amount),
        csvCell(providerLabel(r.provider)),
        csvCell(statusLabelFor(r.status)),
        csvCell(r.idempotencyKey),
        csvCell(r.at),
      ].join(';'),
    );
  }
  try {
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transacoes-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado (' + list.length + ' transações).');
  } catch (e) {
    toast.error('Falha ao exportar CSV', { detail: e.message });
  }
}

onMounted(load);
</script>

<style scoped>
.tx-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-accent));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.tx-banner-icon {
  font-size: var(--ui-text-lg);
  line-height: 1.2;
}
.tx-banner-text {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

.tx-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

.tx-id {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tx-id-main {
  font-weight: 600;
}
.tx-id-sub {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

.tx-event {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: var(--ui-text-sm);
}
.tx-event-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: var(--ui-text-xs);
  background: rgb(var(--ui-ok) / 0.16);
  color: rgb(var(--ui-ok));
}
.tx-event[data-event="refund"] .tx-event-mark {
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
}

.tx-amount {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.tx-provider {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}

.tx-key {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: 3px 8px;
  cursor: pointer;
  color: rgb(var(--ui-fg));
  font: inherit;
}
.tx-key:hover {
  border-color: rgb(var(--ui-accent));
}
.tx-key-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ui-text-xs);
}
.tx-key-copy {
  color: rgb(var(--ui-muted));
  flex-shrink: 0;
}

.tx-actions {
  display: inline-flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
}

.tx-detail {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
}
.tx-detail-row {
  display: grid;
  grid-template-columns: 150px 1fr;
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
  overflow-wrap: anywhere;
}
.tx-detail-key {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.tx-detail-error dd {
  color: rgb(var(--ui-danger));
}

@media (max-width: 980px) {
  .tx-kpis {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 560px) {
  .tx-kpis {
    grid-template-columns: 1fr;
  }
  .tx-detail-row {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>
