<template>
  <UiPageLayout
    eyebrow="StockPilot · Reposição assíncrona"
    title="Pedidos de reposição"
    subtitle="A fila viva da reposição. Cada pedido nasce pendente, o worker o assume (processando), envia ao fornecedor de forma idempotente e o conclui como entregue — ou, esgotadas as tentativas, ele cai na DLQ como falha."
    width="wide"
    :error="pageError"
    @retry="reload"
  >
    <!-- Ações de cabeçalho — sempre rotas de DOMÍNIO -->
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="manualRefresh">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar fila
      </UiButton>
      <UiButton
        variant="subtle"
        :disabled="!r.items.value.length || r.loading.value"
        @click="exportCsv"
      >
        <template #icon-left><span aria-hidden="true">⬇</span></template>
        Exportar CSV
      </UiButton>
      <UiButton variant="ghost" to="/products">
        <template #icon-left><span aria-hidden="true">📦</span></template>
        Produtos
      </UiButton>
    </template>

    <!-- KPIs: o pulso da fila (derivados do conjunto REAL carregado) -->
    <template #banner>
      <div class="ol-kpis" role="group" aria-label="Resumo da fila de reposição">
        <UiMetricCard
          label="Na fila"
          :value="metrics.total"
          tone="primary"
          :hint="metrics.total ? 'pedidos carregados' : 'nada em aberto'"
          :loading="r.loading.value"
          clickable
          @click="setStatus('')"
        />
        <UiMetricCard
          label="Pendentes"
          :value="metrics.pending"
          tone="warning"
          hint="aguardando o worker"
          :loading="r.loading.value"
          clickable
          @click="setStatus('pending')"
        />
        <UiMetricCard
          label="Processando"
          :value="metrics.processing"
          tone="running"
          hint="enviando ao fornecedor"
          :loading="r.loading.value"
          clickable
          @click="setStatus('processing')"
        />
        <UiMetricCard
          label="Entregues"
          :value="metrics.delivered"
          tone="success"
          hint="confirmados pelo fornecedor"
          :loading="r.loading.value"
          clickable
          @click="setStatus('delivered')"
        />
        <UiMetricCard
          label="Falhas (DLQ)"
          :value="metrics.failed"
          :tone="metrics.failed > 0 ? 'error' : 'neutral'"
          hint="esgotaram as tentativas"
          :loading="r.loading.value"
          clickable
          @click="setStatus('failed')"
        />
      </div>

      <!-- Faixa de destaque da DLQ — só quando há falhas -->
      <div
        v-if="!r.loading.value && metrics.failed > 0"
        class="ol-spotlight"
        role="alert"
      >
        <span class="ol-spotlight-icon" aria-hidden="true">🚨</span>
        <div class="ol-spotlight-body">
          <p class="ol-spotlight-title">
            {{ metrics.failed }} {{ metrics.failed === 1 ? 'pedido falhou' : 'pedidos falharam' }} ao enviar ao fornecedor
          </p>
          <p class="ol-spotlight-desc">
            Esgotaram retry/backoff e foram para a DLQ. Abra um pedido para ver o último erro
            (redigido) e a trilha de auditoria.
          </p>
        </div>
        <UiButton
          variant="primary"
          size="sm"
          :data-active="filters.status === 'failed' ? 'true' : null"
          @click="setStatus('failed')"
        >
          {{ filters.status === 'failed' ? 'Mostrando falhas' : 'Ver falhas' }}
        </UiButton>
      </div>
    </template>

    <!-- Toolbar: busca + chips de status -->
    <template #filters>
      <div class="ol-toolbar">
        <form class="ol-search" role="search" @submit.prevent>
          <span class="ol-search-icon" aria-hidden="true">⌕</span>
          <input
            id="ol-search-input"
            v-model="search"
            class="ol-search-input"
            type="search"
            placeholder="Buscar por produto, ref. do fornecedor ou #pedido…"
            aria-label="Buscar pedidos por produto, referência ou número"
          />
          <button
            v-if="search"
            class="ol-search-clear"
            type="button"
            aria-label="Limpar busca"
            @click="search = ''"
          >✕</button>
        </form>

        <div class="ol-chips" role="group" aria-label="Filtrar por status">
          <button
            v-for="opt in statusOptions"
            :key="opt.value || 'all'"
            type="button"
            class="ol-chip"
            :data-active="filters.status === opt.value ? 'true' : null"
            :data-tone="opt.tone"
            :aria-pressed="filters.status === opt.value ? 'true' : 'false'"
            @click="setStatus(opt.value)"
          >
            <span class="ol-chip-dot" aria-hidden="true" />
            {{ opt.label }}
            <span class="ol-chip-count">{{ opt.count }}</span>
          </button>
        </div>
      </div>

      <div v-if="hasActiveFilters" class="ol-active-filters">
        <span class="ui-muted">{{ resultSummary }}</span>
        <UiButton variant="subtle" size="sm" @click="resetFilters">Limpar filtros</UiButton>
      </div>
    </template>

    <!-- Tabela: cobre loading / error / empty / normal -->
    <UiCard title="Fila de pedidos" :subtitle="tableSummary">
      <template #actions>
        <UiStatusBadge
          v-if="hasActiveFilters"
          tone="running"
          status="Filtro ativo"
          size="sm"
        />
      </template>

      <UiDataTable
        :columns="columns"
        :rows="pageRows"
        :loading="r.loading.value"
        :error="tableError"
        row-key="id"
        density="comfortable"
        clickable-rows
        :sort="sort"
        :page="page"
        :page-size="pageSize"
        :total="filteredRows.length"
        paginated
        :empty="emptyState"
        @retry="reload"
        @update:sort="onSort"
        @update:page="onPage"
        @update:page-size="onPageSize"
        @row-click="openOrder"
      >
        <!-- Pedido (#id) -->
        <template #cell-id="{ value }">
          <span class="ol-id ui-mono">#{{ value }}</span>
        </template>

        <!-- Produto: nome + identificador -->
        <template #cell-product="{ row }">
          <div class="ol-product">
            <span class="ol-product-name">{{ row.product_name || ('Produto #' + row.product_id) }}</span>
            <span class="ol-product-id ui-mono">PROD-{{ row.product_id }}</span>
          </div>
        </template>

        <!-- Status: badge + micro-trilha do ciclo -->
        <template #cell-status="{ value }">
          <div class="ol-status">
            <UiStatusBadge :status="value" :label="statusText(value)" />
            <span class="ol-track" :aria-label="trackAria(value)" role="img">
              <span
                v-for="(step, i) in lifecycle"
                :key="step.key"
                class="ol-track-dot"
                :data-state="stepState(value, i)"
              />
            </span>
          </div>
        </template>

        <!-- Ref. do fornecedor -->
        <template #cell-external_ref="{ value }">
          <span v-if="value" class="ol-ref ui-mono">{{ value }}</span>
          <span v-else class="ol-pending-ref">aguardando fornecedor</span>
        </template>

        <!-- Último erro (DLQ) -->
        <template #cell-last_error="{ row }">
          <button
            v-if="row.last_error"
            class="ol-errlink"
            type="button"
            @click.stop="openOrder(row)"
          >
            <span class="ol-errlink-icon" aria-hidden="true">⚠</span>
            <span class="ol-errlink-text">{{ truncate(row.last_error, 44) }}</span>
          </button>
          <span v-else class="ui-muted">—</span>
        </template>

        <!-- Tempo relativo (com timestamp absoluto no title) -->
        <template #cell-time="{ row }">
          <span class="ol-time" :title="absoluteTime(orderTime(row))">
            {{ relativeTime(orderTime(row)) }}
          </span>
        </template>

        <!-- Ações por linha -->
        <template #cell-actions="{ row }">
          <div class="ol-actions" @click.stop>
            <UiButton variant="ghost" size="sm" @click="peekOrder(row)">Resumo</UiButton>
            <UiButton variant="subtle" size="sm" :to="'/orders/' + row.id">Abrir</UiButton>
          </div>
        </template>

        <!-- Estado vazio contextual -->
        <template #empty-action>
          <UiButton v-if="hasActiveFilters" variant="ghost" @click="resetFilters">
            Limpar filtros
          </UiButton>
          <UiButton v-else variant="primary" to="/products">
            Ir para produtos
          </UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- Atalhos de domínio (só rotas reais do inventário) -->
    <UiCard title="Continuar pela operação" subtitle="De onde a fila de reposição se conecta ao resto do estoque.">
      <div class="ol-links" role="group" aria-label="Atalhos do domínio de estoque">
        <UiButton variant="ghost" to="/products">
          <template #icon-left><span aria-hidden="true">📦</span></template>
          Catálogo de produtos
        </UiButton>
        <UiButton variant="ghost" to="/alerts">
          <template #icon-left><span aria-hidden="true">🔔</span></template>
          Alertas de estoque
        </UiButton>
        <UiButton variant="ghost" to="/">
          <template #icon-left><span aria-hidden="true">📊</span></template>
          Painel geral
        </UiButton>
      </div>
    </UiCard>

    <template #footer>
      <span>
        Reposição idempotente (REQ-STOCKPILOT-0003 · REQ-STOCKPILOT-0005): existe no máximo um pedido
        aberto por produto. Repetir o disparo devolve o mesmo recurso — nunca duplica.
      </span>
    </template>

    <!-- Quick-peek: resumo do pedido + ciclo assíncrono + erro (DLQ) -->
    <UiModal v-model:open="peekOpen" :title="peekTitle" width="md">
      <div v-if="selected" class="ol-peek">
        <div class="ol-peek-head">
          <UiStatusBadge :status="selected.status" :label="statusText(selected.status)" size="lg" />
          <p class="ol-peek-narrative ui-muted">{{ statusNarrative(selected.status) }}</p>
        </div>

        <dl class="ol-peek-grid">
          <div class="ol-peek-item">
            <dt>Produto</dt>
            <dd>{{ selected.product_name || ('Produto #' + selected.product_id) }}</dd>
          </div>
          <div class="ol-peek-item">
            <dt>ID do produto</dt>
            <dd class="ui-mono">PROD-{{ selected.product_id }}</dd>
          </div>
          <div class="ol-peek-item">
            <dt>Ref. do fornecedor</dt>
            <dd>
              <span v-if="selected.external_ref" class="ui-mono">{{ selected.external_ref }}</span>
              <span v-else class="ui-muted">ainda não emitida</span>
            </dd>
          </div>
          <div class="ol-peek-item">
            <dt>Criado em</dt>
            <dd>{{ absoluteTime(selected.created_at) }}</dd>
          </div>
          <div class="ol-peek-item">
            <dt>Última tentativa</dt>
            <dd>{{ absoluteTime(selected.last_attempt_at) }}</dd>
          </div>
        </dl>

        <!-- Trilha do ciclo de vida assíncrono -->
        <div class="ol-flow" aria-label="Ciclo do pedido de reposição">
          <span
            v-for="(step, i) in lifecycle"
            :key="step.key"
            class="ol-flow-step"
            :data-state="stepState(selected.status, i)"
          >
            <span class="ol-flow-dot" aria-hidden="true" />
            {{ step.label }}
          </span>
        </div>

        <div v-if="selected.last_error" class="ol-error">
          <p class="ol-error-title">Último erro (DLQ)</p>
          <p class="ol-error-body ui-mono">{{ selected.last_error }}</p>
          <p class="ol-error-hint ui-muted">
            Mensagem redigida — segredos nunca são exibidos. A trilha completa de tentativas está na
            página do pedido.
          </p>
        </div>
      </div>

      <template #footer>
        <UiButton variant="ghost" @click="peekOpen = false">Fechar</UiButton>
        <UiButton v-if="selected" variant="primary" :to="'/orders/' + selected.id">
          Abrir pedido completo
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
  UiButton,
  UiStatusBadge,
  UiModal,
  useResource,
  useToast,
} from '../ui/index.js';
import { orders } from '../api.js';

const router = useRouter();
const toast = useToast();

// ---------------------------------------------------------------------------
// Recurso REAL: GET /v1/orders (api.orders.list). A rota devolve a fila aberta
// de uma vez (sem paginação/ordenação no servidor), então filtramos, ordenamos
// e paginamos no cliente para que filtro de status, busca e destaque de DLQ
// funcionem sem round-trip. Detalhe completo: rota de domínio /orders/:id.
// ---------------------------------------------------------------------------
const r = useResource(orders, { pageSize: 10 });

// Erro de página inteira só quando o recurso falha na primeira carga (sem dados).
// Passa a MENSAGEM (string), nunca o objeto Error — UiPageLayout espera texto.
const pageError = computed(() =>
  r.error.value && !r.items.value.length
    ? (r.error.value.message || 'Falha ao carregar a fila.')
    : null,
);
// Após já haver dados, um erro de recarregar aparece DENTRO da tabela com retry.
const tableError = computed(() =>
  r.error.value && r.items.value.length
    ? (r.error.value.message || 'Falha ao recarregar a fila.')
    : null,
);

// ---------------------------------------------------------------------------
// Filtros: status (chips/KPIs) + busca textual livre.
// ---------------------------------------------------------------------------
const filters = reactive({ status: '' });
const search = ref('');

const hasActiveFilters = computed(() => !!filters.status || !!search.value.trim());
function resetFilters() {
  filters.status = '';
  search.value = '';
  page.value = 1;
}
function setStatus(value) {
  filters.status = filters.status === value ? '' : value;
  page.value = 1;
}

// ---------------------------------------------------------------------------
// Status + ciclo de vida (rótulos pt-BR, sem mapa de domínio no kit).
// ---------------------------------------------------------------------------
const STATUS_LABELS = {
  pending: 'Pendente',
  processing: 'Processando',
  delivered: 'Entregue',
  failed: 'Falhou (DLQ)',
};
function statusText(s) {
  const k = String(s || '').toLowerCase();
  return STATUS_LABELS[k] || (s ? String(s) : '—');
}

const STATUS_NARRATIVE = {
  pending: 'Pedido criado e enfileirado, aguardando o worker assumir.',
  processing: 'O worker está submetendo o pedido ao fornecedor externo.',
  delivered: 'O fornecedor confirmou o pedido. Reposição concluída.',
  failed: 'A submissão falhou após esgotar as tentativas (DLQ).',
};
function statusNarrative(s) {
  return STATUS_NARRATIVE[String(s || '').toLowerCase()] || 'Status do pedido de reposição.';
}

const lifecycle = [
  { key: 'pending', label: 'Pendente' },
  { key: 'processing', label: 'Processando' },
  { key: 'delivered', label: 'Entregue' },
];
const ORDER_INDEX = { pending: 0, processing: 1, delivered: 2 };
function stepState(status, stepIndex) {
  const s = String(status || '').toLowerCase();
  if (s === 'failed') return stepIndex === 0 ? 'done' : 'failed';
  const cur = ORDER_INDEX[s] ?? 0;
  if (stepIndex < cur) return 'done';
  if (stepIndex === cur) return 'current';
  return 'todo';
}
function trackAria(status) {
  return 'Ciclo: ' + statusText(status);
}

// ---------------------------------------------------------------------------
// Métricas (sempre sobre o conjunto completo carregado).
// ---------------------------------------------------------------------------
const metrics = computed(() => {
  const all = r.items.value || [];
  const by = (s) => all.filter((o) => String(o.status || '').toLowerCase() === s).length;
  return {
    total: all.length,
    pending: by('pending'),
    processing: by('processing'),
    delivered: by('delivered'),
    failed: by('failed'),
  };
});

const statusOptions = computed(() => [
  { value: '', label: 'Todos', tone: 'neutral', count: metrics.value.total },
  { value: 'pending', label: 'Pendente', tone: 'warning', count: metrics.value.pending },
  { value: 'processing', label: 'Processando', tone: 'running', count: metrics.value.processing },
  { value: 'delivered', label: 'Entregue', tone: 'success', count: metrics.value.delivered },
  { value: 'failed', label: 'Falhou (DLQ)', tone: 'error', count: metrics.value.failed },
]);

// ---------------------------------------------------------------------------
// Tempo: usa a última tentativa quando há, senão a criação.
// ---------------------------------------------------------------------------
function orderTime(row) {
  return row.last_attempt_at || row.created_at || null;
}

// ---------------------------------------------------------------------------
// Filtro + ordenação + paginação (client-side).
// ---------------------------------------------------------------------------
const filteredRows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (r.items.value || []).filter((o) => {
    if (filters.status && String(o.status || '').toLowerCase() !== filters.status) return false;
    if (!q) return true;
    const hay = [
      o.product_name,
      'prod-' + o.product_id,
      o.external_ref,
      '#' + o.id,
      o.id,
    ]
      .filter((v) => v !== null && v !== undefined && v !== '')
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
});

const sort = ref({ key: 'time', dir: 'desc' });
function sortValue(row, key) {
  if (key === 'time') return new Date(orderTime(row) || 0).getTime() || 0;
  if (key === 'product') return String(row.product_name || row.product_id || '').toLowerCase();
  return row[key];
}
const sortedRows = computed(() => {
  const { key, dir } = sort.value || {};
  if (!key) return filteredRows.value;
  const mul = dir === 'desc' ? -1 : 1;
  return [...filteredRows.value].sort((a, b) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    if (x == null) return 1;
    if (y == null) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * mul;
  });
});

const page = ref(1);
const pageSize = ref(10);
const pageRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedRows.value.slice(start, start + pageSize.value);
});

function onSort(s) {
  sort.value = s;
  page.value = 1;
}
function onPage(p) {
  page.value = p;
}
function onPageSize(ps) {
  pageSize.value = ps;
  page.value = 1;
}

// ---------------------------------------------------------------------------
// Resumos de texto.
// ---------------------------------------------------------------------------
const tableSummary = computed(() => {
  if (r.loading.value) return 'Carregando…';
  const total = (r.items.value || []).length;
  if (!total) return 'Nenhum pedido na fila';
  const n = filteredRows.value.length;
  return hasActiveFilters.value
    ? n + ' de ' + total + ' pedido(s)'
    : total + (total === 1 ? ' pedido na fila' : ' pedidos na fila');
});
const resultSummary = computed(() => {
  const total = (r.items.value || []).length;
  const n = filteredRows.value.length;
  return 'Mostrando ' + n + ' de ' + total + ' pedido(s)';
});

const emptyState = computed(() => {
  if (hasActiveFilters.value) {
    return {
      title: 'Nenhum pedido com esse filtro',
      description: 'Ajuste o status ou a busca para ver outros pedidos da fila.',
      icon: 'search',
    };
  }
  return {
    title: 'Fila vazia',
    description:
      'Nenhum pedido de reposição em aberto. Pedidos surgem automaticamente quando um produto cai abaixo do estoque mínimo.',
    icon: 'box',
  };
});

// ---------------------------------------------------------------------------
// Colunas.
// ---------------------------------------------------------------------------
const columns = [
  { key: 'id', label: 'Pedido' },
  { key: 'product', label: 'Produto', sortable: true },
  { key: 'status', label: 'Status' },
  { key: 'external_ref', label: 'Ref. do fornecedor' },
  { key: 'last_error', label: 'Último erro' },
  { key: 'time', label: 'Tempo', sortable: true, align: 'right' },
  { key: 'actions', label: '', align: 'right' },
];

// ---------------------------------------------------------------------------
// Navegação / quick-peek.
// ---------------------------------------------------------------------------
const peekOpen = ref(false);
const selected = ref(null);
const peekTitle = computed(() => (selected.value ? 'Pedido #' + selected.value.id : 'Pedido'));

// Clique na linha → página completa do pedido (rota de domínio).
function openOrder(row) {
  if (!row) return;
  router.push('/orders/' + row.id);
}
// Botão "Resumo" → quick-peek em modal (não navega).
function peekOrder(row) {
  selected.value = row;
  peekOpen.value = true;
}

// ---------------------------------------------------------------------------
// Tempo relativo / absoluto (puros).
// ---------------------------------------------------------------------------
function relativeTime(value) {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (!then || isNaN(then)) return '—';
  const diff = Math.round((Date.now() - then) / 1000); // segundos
  const abs = Math.abs(diff);
  const fut = diff < 0 ? 'em ' : '';
  const ago = diff < 0 ? '' : ' atrás';
  if (abs < 45) return diff < 0 ? 'em instantes' : 'agora mesmo';
  const units = [
    [3600, 'min', 60],
    [86400, 'h', 3600],
    [604800, 'd', 86400],
    [2592000, 'sem', 604800],
    [Infinity, 'mês', 2592000],
  ];
  for (const [limit, label, div] of units) {
    if (abs < limit) {
      const n = Math.max(1, Math.round(abs / div));
      return fut + n + ' ' + label + ago;
    }
  }
  return '—';
}
function absoluteTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString();
  }
}
function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

// ---------------------------------------------------------------------------
// Exportar CSV (cliente, sobre o conjunto filtrado; CSP-safe via Blob).
// ---------------------------------------------------------------------------
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCsv() {
  const rows = filteredRows.value;
  if (!rows.length) {
    toast.warning('Nada para exportar com o filtro atual.');
    return;
  }
  const head = ['Pedido', 'Produto', 'ID do produto', 'Status', 'Ref. do fornecedor', 'Último erro', 'Última tentativa', 'Criado em'];
  const lines = [head.join(';')];
  for (const o of rows) {
    lines.push(
      [
        csvCell('#' + o.id),
        csvCell(o.product_name || ('Produto #' + o.product_id)),
        csvCell('PROD-' + o.product_id),
        csvCell(statusText(o.status)),
        csvCell(o.external_ref),
        csvCell(o.last_error),
        csvCell(o.last_attempt_at),
        csvCell(o.created_at),
      ].join(';'),
    );
  }
  try {
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pedidos-reposicao-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado (' + rows.length + ' pedido(s)).');
  } catch (e) {
    toast.error('Falha ao exportar CSV', { detail: e && e.message });
  }
}

// ---------------------------------------------------------------------------
// Carregamento.
// ---------------------------------------------------------------------------
async function reload() {
  await r.load();
}
async function manualRefresh() {
  await r.load();
  if (r.error.value) {
    toast.error('Falha ao atualizar a fila', { detail: r.error.value.message });
  } else {
    toast.success('Fila atualizada', {
      detail: metrics.value.total + ' pedido(s) · ' + metrics.value.failed + ' em DLQ.',
    });
  }
}

onMounted(reload);
</script>

<style scoped>
/* ---- KPIs ---- */
.ol-kpis {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--ui-space-4);
}

/* ---- Faixa de destaque (DLQ) ---- */
.ol-spotlight {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  margin-top: var(--ui-space-4);
  padding: var(--ui-space-4) var(--ui-space-5);
  border: 1px solid rgb(var(--ui-danger) / 0.4);
  border-left: 4px solid rgb(var(--ui-danger));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-danger) / 0.08);
}
.ol-spotlight-icon { font-size: 1.7rem; line-height: 1; }
.ol-spotlight-body { flex: 1 1 auto; min-width: 0; }
.ol-spotlight-title {
  margin: 0;
  font-weight: 700;
  font-family: var(--ui-font-display);
  color: rgb(var(--ui-fg));
}
.ol-spotlight-desc { margin: 2px 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }

/* ---- Toolbar: busca + chips ---- */
.ol-toolbar {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.ol-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 300px;
  min-width: 240px;
}
.ol-search-icon {
  position: absolute;
  left: var(--ui-space-3);
  color: rgb(var(--ui-muted));
  font-size: 1.05rem;
  pointer-events: none;
}
.ol-search-input {
  width: 100%;
  font: inherit;
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  padding: 9px 34px;
}
.ol-search-input::placeholder { color: rgb(var(--ui-faint)); }
.ol-search-input:focus { border-color: rgb(var(--ui-accent)); outline: none; }
.ol-search-clear {
  position: absolute;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  cursor: pointer;
  font-size: var(--ui-text-xs);
}
.ol-search-clear:hover { background: rgb(var(--ui-border)); color: rgb(var(--ui-fg)); }
.ol-search-clear:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }

/* ---- Chips de status ---- */
.ol-chips { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }
.ol-chip {
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
  padding: 5px var(--ui-space-3);
  cursor: pointer;
  transition: color .15s ease, border-color .15s ease, background .15s ease;
}
.ol-chip:hover { color: rgb(var(--ui-fg)); border-color: rgb(var(--ui-accent)); }
.ol-chip:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.ol-chip[data-active="true"] {
  color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.12);
  border-color: rgb(var(--ui-accent));
}
.ol-chip-dot { width: 7px; height: 7px; border-radius: 50%; background: rgb(var(--ui-faint)); }
.ol-chip[data-tone="warning"] .ol-chip-dot { background: rgb(var(--ui-warn)); }
.ol-chip[data-tone="running"] .ol-chip-dot { background: rgb(var(--ui-accent)); }
.ol-chip[data-tone="success"] .ol-chip-dot { background: rgb(var(--ui-ok)); }
.ol-chip[data-tone="error"] .ol-chip-dot { background: rgb(var(--ui-danger)); }
.ol-chip-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.ol-chip[data-active="true"] .ol-chip-count {
  background: rgb(var(--ui-accent) / 0.2);
  color: rgb(var(--ui-accent-strong));
}

.ol-active-filters {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-3);
  font-size: var(--ui-text-sm);
}

/* ---- Células ---- */
.ol-id { color: rgb(var(--ui-muted)); font-weight: 600; font-variant-numeric: tabular-nums; }
.ol-product { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ol-product-name { font-weight: 600; color: rgb(var(--ui-fg)); }
.ol-product-id { font-size: var(--ui-text-xs); color: rgb(var(--ui-faint)); }

.ol-status { display: flex; align-items: center; gap: var(--ui-space-2); }
.ol-track { display: inline-flex; align-items: center; gap: 3px; }
.ol-track-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(var(--ui-border-strong));
}
.ol-track-dot[data-state="done"] { background: rgb(var(--ui-ok)); }
.ol-track-dot[data-state="current"] { background: rgb(var(--ui-accent)); }
.ol-track-dot[data-state="failed"] { background: rgb(var(--ui-danger)); }

.ol-ref { color: rgb(var(--ui-fg)); }
.ol-pending-ref { color: rgb(var(--ui-faint)); font-size: var(--ui-text-sm); font-style: italic; }

.ol-errlink {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  font: inherit;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-danger));
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
}
.ol-errlink:hover .ol-errlink-text { text-decoration: underline; }
.ol-errlink:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; border-radius: var(--ui-radius-sm); }
.ol-errlink-icon { flex-shrink: 0; }
.ol-errlink-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ol-time { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); white-space: nowrap; }

.ol-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* ---- Atalhos de domínio ---- */
.ol-links { display: flex; flex-wrap: wrap; gap: var(--ui-space-3); }

/* ---- Quick-peek (modal) ---- */
.ol-peek { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.ol-peek-head { display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap; }
.ol-peek-narrative { margin: 0; font-size: var(--ui-text-sm); flex: 1 1 200px; min-width: 0; }
.ol-peek-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ui-space-3) var(--ui-space-4);
}
.ol-peek-item dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: .04em;
  margin-bottom: 2px;
}
.ol-peek-item dd { margin: 0; color: rgb(var(--ui-fg)); font-size: var(--ui-text-sm); word-break: break-word; }

/* Trilha do ciclo de vida */
.ol-flow {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}
.ol-flow-step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-faint));
}
.ol-flow-dot { width: 9px; height: 9px; border-radius: 50%; background: rgb(var(--ui-faint)); }
.ol-flow-step[data-state="done"] { color: rgb(var(--ui-ok)); }
.ol-flow-step[data-state="done"] .ol-flow-dot { background: rgb(var(--ui-ok)); }
.ol-flow-step[data-state="current"] { color: rgb(var(--ui-accent-strong)); }
.ol-flow-step[data-state="current"] .ol-flow-dot { background: rgb(var(--ui-accent)); }
.ol-flow-step[data-state="failed"] { color: rgb(var(--ui-danger)); }
.ol-flow-step[data-state="failed"] .ol-flow-dot { background: rgb(var(--ui-danger)); }

/* Bloco de erro / DLQ */
.ol-error {
  background: rgb(var(--ui-danger) / 0.08);
  border: 1px solid rgb(var(--ui-danger) / 0.3);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.ol-error-title { margin: 0 0 4px; font-weight: 700; font-size: var(--ui-text-sm); color: rgb(var(--ui-danger)); }
.ol-error-body { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); word-break: break-word; white-space: pre-wrap; }
.ol-error-hint { margin: 6px 0 0; font-size: var(--ui-text-xs); }

/* ---- Responsivo ---- */
@media (max-width: 1080px) {
  .ol-kpis { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 860px) {
  .ol-toolbar { flex-direction: column; align-items: stretch; }
  .ol-actions { justify-content: flex-start; }
  .ol-spotlight { flex-direction: column; align-items: flex-start; }
}
@media (max-width: 560px) {
  .ol-kpis { grid-template-columns: 1fr; }
  .ol-peek-grid { grid-template-columns: 1fr; }
}
</style>
