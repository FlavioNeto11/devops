<template>
  <UiPageLayout
    eyebrow="Operação da loja"
    title="Pedidos"
    subtitle="Acompanhe, reembolse e rastreie os pedidos da loja em um só lugar."
    width="wide"
    :error="r.error.value"
    @retry="r.load"
  >
    <!-- Ações de cabeçalho -->
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="r.refresh">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton
        variant="subtle"
        :disabled="!filteredRows.length || r.loading.value"
        @click="exportCsv"
      >
        <template #icon-left><span aria-hidden="true">⬇</span></template>
        Exportar CSV
      </UiButton>
    </template>

    <!-- Filtros -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="onClear"
      />
      <!-- Feedback de valor inválido: a faixa de valor é texto livre; em vez de
           descartar em silêncio, avisamos quando não dá para interpretar. -->
      <p v-if="valueRangeWarning" class="orders-filter-warn" role="status">
        <span aria-hidden="true">⚠</span> {{ valueRangeWarning }}
      </p>
    </template>

    <!-- KPIs derivados dos pedidos reais carregados -->
    <div class="orders-kpis" role="group" aria-label="Indicadores de pedidos">
      <UiMetricCard
        label="Pedidos na página"
        :value="kpis.count"
        tone="primary"
        :hint="totalHint"
        :loading="r.loading.value"
      />
      <UiMetricCard
        label="Faturamento (página)"
        :value="format.formatCurrency(kpis.revenue)"
        tone="success"
        hint="Soma dos pedidos exibidos"
        :loading="r.loading.value"
      />
      <UiMetricCard
        label="Aguardando ação"
        :value="kpis.pending"
        tone="warning"
        hint="Pendentes ou em separação"
        :loading="r.loading.value"
      />
      <UiMetricCard
        label="Reembolsados"
        :value="kpis.refunded"
        tone="error"
        hint="Pedidos estornados"
        :loading="r.loading.value"
      />
    </div>

    <!-- Tabela de pedidos -->
    <UiCard title="Lista de pedidos" :subtitle="resultSummary">
      <template #actions>
        <UiStatusBadge
          v-if="hasLocalFilter"
          tone="running"
          :status="'Filtro local ativo'"
          :with-dot="true"
        />
      </template>

      <UiDataTable
        :columns="columns"
        :rows="filteredRows"
        row-key="id"
        density="comfortable"
        clickable-rows
        server-mode
        :loading="r.loading.value"
        :sort="r.sort.value"
        :page="r.page.value"
        :page-size="r.pageSize.value"
        :total="r.total.value"
        paginated
        :empty="emptyState"
        @row-click="openDetail"
        @update:sort="r.setSort"
        @update:page="r.setPage"
        @update:page-size="onPageSize"
      >
        <!-- Código + cliente -->
        <template #cell-code="{ row }">
          <div class="orders-id">
            <span class="orders-id-code ui-mono">{{ row.code || '—' }}</span>
            <span class="orders-id-cust">{{ row.customer_name || 'Cliente não informado' }}</span>
          </div>
        </template>

        <!-- Total -->
        <template #cell-total="{ value }">
          <span class="orders-total">{{ format.formatCurrency(value) }}</span>
        </template>

        <!-- Itens -->
        <template #cell-items_count="{ value }">
          {{ value != null ? format.formatNumber(value) : '—' }}
        </template>

        <!-- Situação do pedido -->
        <template #cell-status="{ value }">
          <UiStatusBadge :status="value" :label="labelFor(value)" />
        </template>

        <!-- Pagamento -->
        <template #cell-payment_status="{ value }">
          <UiStatusBadge v-if="value" :status="value" :label="labelFor(value)" size="sm" />
          <span v-else class="ui-muted">—</span>
        </template>

        <!-- Criado em -->
        <template #cell-created_at="{ value }">
          {{ format.formatDateTime(value) }}
        </template>

        <!-- Ações por linha -->
        <template #cell-actions="{ row }">
          <div class="orders-actions" @click.stop>
            <UiButton variant="ghost" size="sm" :to="{ name: 'order', params: { id: row.id } }">Ver</UiButton>
            <UiButton
              variant="ghost"
              size="sm"
              :disabled="!canTrack(row)"
              @click="openTracking(row)"
            >
              Rastrear
            </UiButton>
            <UiButton
              variant="danger"
              size="sm"
              :disabled="!canRefund(row)"
              :loading="busyId === row.id"
              @click="refund(row)"
            >
              Reembolsar
            </UiButton>
          </div>
        </template>

        <!-- Sem resultados após filtro -->
        <template #empty-action>
          <UiButton v-if="hasLocalFilter" variant="ghost" @click="onClear">Limpar filtros</UiButton>
          <UiButton v-else variant="ghost" @click="r.load">Recarregar</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- Modal: rastreamento -->
    <UiModal v-model:open="trackOpen" title="Rastreamento do pedido" width="sm">
      <div v-if="trackTarget" class="orders-track">
        <p class="orders-track-lead">
          Pedido <strong class="ui-mono">{{ trackTarget.code }}</strong> — situação atual:
          <UiStatusBadge :status="trackTarget.status" :label="labelFor(trackTarget.status)" size="sm" />
        </p>
        <div class="orders-track-code">
          <span class="orders-track-label">Código de rastreio</span>
          <span class="ui-mono orders-track-value">{{ trackTarget.tracking_code }}</span>
        </div>
        <p class="ui-muted orders-track-note">
          Use este código no site da transportadora para acompanhar a entrega.
        </p>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="copyTracking">Copiar código</UiButton>
        <UiButton variant="primary" @click="trackOpen = false">Fechar</UiButton>
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
  UiFiltersPanel,
  UiStatusBadge,
  UiButton,
  UiModal,
  useResource,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// ---------------------------------------------------------------------------
// Recurso REAL: GET/PUT /v1/orders (api.orders, fábrica `resource("orders")` em api.js).
// useResource trata { data, total, page, pageSize } e os estados de lista.
// Cinto de segurança: se o integrador não injetar api.orders, usamos um stub que
// rejeita de forma controlada (a tela cai no estado de erro em vez de TypeError).
// ---------------------------------------------------------------------------
const ORDERS_UNAVAILABLE = 'Recurso de pedidos indisponível.';
const orders = api.orders || {
  list: () => Promise.reject(new Error(ORDERS_UNAVAILABLE)),
};
const r = useResource(orders, { pageSize: 25, sort: { key: 'created_at', dir: 'desc' } });
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// Rótulos legíveis dos enums do domínio (sem alterar o tom resolvido pelo kit).
const STATUS_LABELS = {
  pendente: 'Pendente',
  pago: 'Pago',
  falha_pagamento: 'Falha no pagamento',
  em_separacao: 'Em separação',
  enviado: 'Enviado',
  entregue: 'Entregue',
  reembolsado: 'Reembolsado',
  cancelado: 'Cancelado',
  aguardando: 'Aguardando',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  estornado: 'Estornado',
};
const labelFor = (v) => STATUS_LABELS[v] || format.humanize(v);

// ---------------------------------------------------------------------------
// Colunas (chaves em snake_case, como o backend serializa as linhas).
// ---------------------------------------------------------------------------
const columns = [
  { key: 'code', label: 'Pedido / Cliente', sortable: true },
  { key: 'total', label: 'Total', align: 'right', sortable: true },
  { key: 'items_count', label: 'Itens', align: 'right' },
  { key: 'status', label: 'Situação', sortable: true },
  { key: 'payment_status', label: 'Pagamento' },
  { key: 'created_at', label: 'Criado em', sortable: true },
  { key: 'actions', label: 'Ações', align: 'right' },
];

// ---------------------------------------------------------------------------
// Filtros. `q`/`status`/`payment_status` vão ao servidor (parâmetros ignorados
// com segurança quando não suportados); intervalo de data e faixa de valor são
// refinados no cliente sobre as linhas REAIS carregadas, com aviso visível.
// ---------------------------------------------------------------------------
const filterFields = [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'código, cliente ou e-mail' },
  {
    key: 'status',
    label: 'Situação',
    type: 'select',
    options: [
      { value: 'pendente', label: 'Pendente' },
      { value: 'pago', label: 'Pago' },
      { value: 'falha_pagamento', label: 'Falha no pagamento' },
      { value: 'em_separacao', label: 'Em separação' },
      { value: 'enviado', label: 'Enviado' },
      { value: 'entregue', label: 'Entregue' },
      { value: 'reembolsado', label: 'Reembolsado' },
      { value: 'cancelado', label: 'Cancelado' },
    ],
  },
  {
    key: 'payment_status',
    label: 'Pagamento',
    type: 'select',
    options: [
      { value: 'aguardando', label: 'Aguardando' },
      { value: 'aprovado', label: 'Aprovado' },
      { value: 'recusado', label: 'Recusado' },
      { value: 'estornado', label: 'Estornado' },
    ],
  },
  { key: 'from', label: 'De', type: 'date' },
  { key: 'to', label: 'Até', type: 'date' },
  { key: 'min', label: 'Valor mín.', type: 'text', placeholder: '0,00' },
  { key: 'max', label: 'Valor máx.', type: 'text', placeholder: '0,00' },
];
const blankFilters = () => ({ q: '', status: '', payment_status: '', from: '', to: '', min: '', max: '' });
const filters = ref(blankFilters());

// Apenas filtros que o servidor entende viram parâmetros do recurso.
function applyFilters() {
  r.setFilters({
    q: filters.value.q || undefined,
    status: filters.value.status || undefined,
    payment_status: filters.value.payment_status || undefined,
  });
}
function onClear() {
  filters.value = blankFilters();
  r.setFilters({ q: undefined, status: undefined, payment_status: undefined });
}
function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}

// Refino local (data + faixa de valor) sobre a página carregada.
const parseMoney = (s) => {
  if (s === '' || s == null) return null;
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
};
// distingue "vazio" de "não interpretável" para dar feedback em vez de descartar em silêncio.
const isInvalidMoney = (s) => s !== '' && s != null && parseMoney(s) == null;
const valueRangeWarning = computed(() => {
  const f = filters.value;
  const bad = [];
  if (isInvalidMoney(f.min)) bad.push('mín.');
  if (isInvalidMoney(f.max)) bad.push('máx.');
  if (bad.length) return 'Valor ' + bad.join(' e ') + ' não reconhecido — use apenas números (ex.: 1.234,56). Esse filtro está sendo ignorado.';
  const min = parseMoney(f.min);
  const max = parseMoney(f.max);
  if (min != null && max != null && min > max) return 'O valor mínimo é maior que o máximo — nenhum pedido entra nessa faixa.';
  return '';
});
const hasLocalFilter = computed(() => {
  const f = filters.value;
  return !!(f.from || f.to || parseMoney(f.min) != null || parseMoney(f.max) != null);
});
const filteredRows = computed(() => {
  const f = filters.value;
  const min = parseMoney(f.min);
  const max = parseMoney(f.max);
  const fromTs = f.from ? new Date(f.from + 'T00:00:00').getTime() : null;
  const toTs = f.to ? new Date(f.to + 'T23:59:59').getTime() : null;
  return r.items.value.filter((row) => {
    if (min != null && Number(row.total) < min) return false;
    if (max != null && Number(row.total) > max) return false;
    if (fromTs != null || toTs != null) {
      const ts = row.created_at ? new Date(row.created_at).getTime() : NaN;
      if (isNaN(ts)) return false;
      if (fromTs != null && ts < fromTs) return false;
      if (toTs != null && ts > toTs) return false;
    }
    return true;
  });
});

// ---------------------------------------------------------------------------
// KPIs derivados das linhas reais exibidas.
// ---------------------------------------------------------------------------
const kpis = computed(() => {
  const rows = filteredRows.value;
  return {
    count: rows.length,
    revenue: rows.reduce((s, o) => s + (Number(o.total) || 0), 0),
    pending: rows.filter((o) => o.status === 'pendente' || o.status === 'em_separacao').length,
    refunded: rows.filter((o) => o.status === 'reembolsado').length,
  };
});
const totalHint = computed(() => (r.total.value ? r.total.value + ' no total' : 'Sem pedidos'));
const resultSummary = computed(() => {
  if (r.loading.value) return 'Carregando…';
  const shown = filteredRows.value.length;
  if (!r.total.value) return 'Nenhum pedido cadastrado';
  if (hasLocalFilter.value) return shown + ' de ' + r.items.value.length + ' nesta página (filtro local)';
  return shown + ' nesta página · ' + r.total.value + ' no total';
});
const emptyState = computed(() =>
  hasLocalFilter.value
    ? { title: 'Nenhum pedido no filtro', description: 'Ajuste o período ou a faixa de valor.', icon: '🔍' }
    : { title: 'Nenhum pedido ainda', description: 'Os pedidos da loja aparecerão aqui assim que forem criados.', icon: '🧾' },
);

// ---------------------------------------------------------------------------
// Regras de ação por linha.
// ---------------------------------------------------------------------------
const REFUNDABLE = new Set(['pago', 'em_separacao', 'enviado', 'entregue']);
const canRefund = (row) => REFUNDABLE.has(row.status) && typeof orders.update === 'function';
const canTrack = (row) => !!(row && row.tracking_code);

// ---------------------------------------------------------------------------
// Detalhe: navega para /orders/:id (OrderDetailView).
// ---------------------------------------------------------------------------
function openDetail(row) {
  router.push({ name: 'order', params: { id: row.id } });
}

// ---------------------------------------------------------------------------
// Rastreamento (modal sobre o tracking_code real).
// ---------------------------------------------------------------------------
const trackOpen = ref(false);
const trackTarget = ref(null);
function openTracking(row) {
  if (!canTrack(row)) {
    toast.warning('Este pedido ainda não tem código de rastreio.');
    return;
  }
  trackTarget.value = row;
  trackOpen.value = true;
}
async function copyTracking() {
  const code = trackTarget.value && trackTarget.value.tracking_code;
  if (!code) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(code);
      toast.success('Código de rastreio copiado.');
    } else {
      toast.info('Código: ' + code);
    }
  } catch {
    toast.error('Não foi possível copiar o código.');
  }
}

// ---------------------------------------------------------------------------
// Reembolso (ação destrutiva): confirmação + PUT /v1/orders/:id.
// ---------------------------------------------------------------------------
const busyId = ref(null);
async function refund(row) {
  if (!canRefund(row)) return;
  const ok = await confirm({
    title: 'Confirmar reembolso',
    message:
      'Reembolsar o pedido ' +
      (row.code || row.id) +
      ' no valor de ' +
      format.formatCurrency(row.total) +
      '? O pedido será marcado como reembolsado e o pagamento como estornado.',
    confirmLabel: 'Reembolsar',
    danger: true,
  });
  if (!ok) return;
  busyId.value = row.id;
  try {
    await orders.update(row.id, { status: 'reembolsado', paymentStatus: 'estornado' });
    toast.success('Pedido ' + (row.code || row.id) + ' reembolsado.');
    await r.refresh();
  } catch (e) {
    toast.error('Falha ao reembolsar', { detail: e.message, code: e.status ? 'HTTP ' + e.status : '' });
  } finally {
    busyId.value = null;
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
  const rows = filteredRows.value;
  if (!rows.length) {
    toast.warning('Nada para exportar.');
    return;
  }
  const head = ['Código', 'Cliente', 'E-mail', 'Total', 'Itens', 'Situação', 'Pagamento', 'Rastreio', 'Criado em'];
  const lines = [head.join(';')];
  for (const o of rows) {
    lines.push(
      [
        csvCell(o.code),
        csvCell(o.customer_name),
        csvCell(o.customer_email),
        csvCell(o.total),
        csvCell(o.items_count),
        csvCell(labelFor(o.status)),
        csvCell(o.payment_status ? labelFor(o.payment_status) : ''),
        csvCell(o.tracking_code),
        csvCell(o.created_at),
      ].join(';'),
    );
  }
  try {
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pedidos-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado (' + rows.length + ' pedidos).');
  } catch (e) {
    toast.error('Falha ao exportar CSV', { detail: e.message });
  }
}

onMounted(r.load);
</script>

<style scoped>
.orders-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

.orders-filter-warn {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: var(--ui-space-2) 0 0;
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-warn));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-warn) / 0.1);
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}

.orders-id {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.orders-id-code {
  font-weight: 600;
}
.orders-id-cust {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

.orders-total {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.orders-actions {
  display: inline-flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  flex-wrap: wrap;
}

.orders-track {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.orders-track-lead {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.orders-track-code {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-4);
}
.orders-track-label {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgb(var(--ui-muted));
  font-weight: 600;
}
.orders-track-value {
  font-size: var(--ui-text-lg);
  font-weight: 700;
}
.orders-track-note {
  margin: 0;
  font-size: var(--ui-text-sm);
}

@media (max-width: 980px) {
  .orders-kpis {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 560px) {
  .orders-kpis {
    grid-template-columns: 1fr;
  }
}
</style>
