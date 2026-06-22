<!-- CartListView — REQ-SHOPDESK-0003: recuperação de vendas.
     Lista carrinhos abertos/abandonados/convertidos com subtotal e última atividade.
     Ação principal: levar um carrinho ao CHECKOUT (rota de domínio /checkout/:cartId).
     Contrato de UI: só componentes do kit (../ui/index.js), só tokens --ui-*, sem style inline / :style / v-html,
     todos os estados (loading/empty/error/normal), só endpoints reais (api.carts), ações destrutivas via useConfirm,
     toasts em sucesso/erro, responsivo + a11y. Só rotas de domínio. -->
<template>
  <UiPageLayout
    eyebrow="Recuperação de vendas"
    title="Carrinhos"
    subtitle="Carrinhos abertos e abandonados com subtotal e última atividade — recupere a venda levando o cliente ao checkout."
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

    <!-- Banner de oportunidade: só quando há valor abandonado a recuperar -->
    <template v-if="showRecoveryBanner" #banner>
      <div class="carts-banner" role="status">
        <span class="carts-banner-icon" aria-hidden="true">💸</span>
        <p class="carts-banner-text">
          <strong>{{ format.formatCurrency(kpis.abandonedValue) }}</strong>
          em {{ kpis.abandoned }} {{ kpis.abandoned === 1 ? 'carrinho abandonado' : 'carrinhos abandonados' }}
          esperando recuperação. Selecione um carrinho e siga para o checkout.
        </p>
      </div>
    </template>

    <!-- Filtros -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="onClear"
      />
    </template>

    <!-- KPIs derivados dos carrinhos reais carregados -->
    <div class="carts-kpis" role="group" aria-label="Indicadores de carrinhos">
      <UiMetricCard
        label="Carrinhos na página"
        :value="kpis.count"
        tone="primary"
        :hint="totalHint"
        :loading="r.loading.value"
      />
      <UiMetricCard
        label="Subtotal em jogo"
        :value="format.formatCurrency(kpis.subtotal)"
        tone="success"
        hint="Soma dos carrinhos exibidos"
        :loading="r.loading.value"
      />
      <UiMetricCard
        label="Abandonados"
        :value="kpis.abandoned"
        tone="warning"
        :hint="abandonedHint"
        :loading="r.loading.value"
      />
      <UiMetricCard
        label="Valor a recuperar"
        :value="format.formatCurrency(kpis.abandonedValue)"
        tone="error"
        hint="Subtotal dos abandonados"
        :loading="r.loading.value"
      />
    </div>

    <!-- Tabela de carrinhos -->
    <UiCard title="Lista de carrinhos" :subtitle="resultSummary">
      <template #actions>
        <UiStatusBadge
          v-if="hasLocalFilter"
          tone="running"
          status="Filtro local ativo"
          :with-dot="true"
          size="sm"
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
        :sort="tableSort"
        :page="r.page.value"
        :page-size="r.pageSize.value"
        :total="r.total.value"
        paginated
        :empty="emptyState"
        @row-click="openDetail"
        @update:sort="onSort"
        @update:page="r.setPage"
        @update:page-size="onPageSize"
      >
        <!-- Cliente -->
        <template #cell-customer="{ row }">
          <div class="carts-cust">
            <span class="carts-cust-name">{{ customerName(row) || 'Cliente anônimo' }}</span>
            <span class="carts-cust-id ui-mono">{{ identifier(row) }}</span>
          </div>
        </template>

        <!-- Itens -->
        <template #cell-items="{ row }">
          {{ itemsCount(row) != null ? format.formatNumber(itemsCount(row)) : '—' }}
        </template>

        <!-- Subtotal -->
        <template #cell-subtotal="{ row }">
          <span class="carts-subtotal">{{ format.formatCurrency(subtotalOf(row)) }}</span>
        </template>

        <!-- Situação -->
        <template #cell-status="{ row }">
          <UiStatusBadge :status="statusOf(row)" :tone="toneFor(row)" :label="labelFor(statusOf(row))" />
        </template>

        <!-- Última atualização -->
        <template #cell-updated="{ row }">
          <div class="carts-when">
            <span>{{ format.formatDateTime(updatedAt(row)) }}</span>
            <span class="carts-when-rel" :data-stale="isStale(row) ? 'true' : null">
              {{ relativeTime(updatedAt(row)) }}
            </span>
          </div>
        </template>

        <!-- Ações por linha -->
        <template #cell-actions="{ row }">
          <div class="carts-actions" @click.stop>
            <UiButton variant="ghost" size="sm" @click="openDetail(row)">Ver</UiButton>
            <UiButton
              variant="primary"
              size="sm"
              :disabled="!canCheckout(row)"
              :loading="busyId === row.id"
              @click="goToCheckout(row)"
            >
              Ir ao checkout
            </UiButton>
          </div>
        </template>

        <!-- Sem resultados após filtro -->
        <template #empty-action>
          <UiButton v-if="hasLocalFilter" variant="ghost" @click="onClear">Limpar filtros</UiButton>
          <UiButton v-else variant="ghost" to="/orders">Ver pedidos</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- Modal: detalhe do carrinho -->
    <UiModal v-model:open="detailOpen" :title="detailTitle" width="md">
      <UiLoadingState v-if="detailLoading" variant="spinner" />
      <UiErrorState
        v-else-if="detailError"
        :message="detailError"
        @retry="reloadDetail"
      />
      <dl v-else-if="detail" class="carts-detail">
        <div class="carts-detail-row">
          <dt>Identificação</dt>
          <dd class="ui-mono">{{ identifier(detail) }}</dd>
        </div>
        <div class="carts-detail-row">
          <dt>Cliente</dt>
          <dd>{{ customerName(detail) || '—' }}</dd>
        </div>
        <div class="carts-detail-row">
          <dt>Situação</dt>
          <dd>
            <UiStatusBadge :status="statusOf(detail)" :tone="toneFor(detail)" :label="labelFor(statusOf(detail))" />
          </dd>
        </div>
        <div class="carts-detail-row">
          <dt>Itens</dt>
          <dd>{{ itemsCount(detail) != null ? format.formatNumber(itemsCount(detail)) : '—' }}</dd>
        </div>
        <div class="carts-detail-row">
          <dt>Subtotal</dt>
          <dd class="carts-subtotal">{{ format.formatCurrency(subtotalOf(detail)) }}</dd>
        </div>
        <div class="carts-detail-row">
          <dt>Atualizado em</dt>
          <dd class="carts-detail-when">
            <span>{{ format.formatDateTime(updatedAt(detail)) }}</span>
            <span class="carts-when-rel">{{ relativeTime(updatedAt(detail)) }}</span>
          </dd>
        </div>
      </dl>
      <template #footer>
        <UiButton variant="ghost" @click="detailOpen = false">Fechar</UiButton>
        <UiButton
          v-if="detail"
          variant="subtle"
          :to="'/carrinhos/' + detail.id"
        >
          Abrir página
        </UiButton>
        <UiButton
          v-if="detail && canCheckout(detail)"
          variant="primary"
          :loading="busyId === detail.id"
          @click="goToCheckout(detail)"
        >
          Ir ao checkout
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
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiFiltersPanel,
  UiStatusBadge,
  UiButton,
  UiModal,
  UiLoadingState,
  UiErrorState,
  useResource,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// ---------------------------------------------------------------------------
// Recurso REAL: GET/GET:id /v1/carts (api.carts em api.js).
// useResource trata o envelope { data, total, page, pageSize } e os estados de lista.
// Cinto de segurança: se o integrador não injetar api.carts, caímos num stub que
// rejeita de forma controlada (a tela vai ao estado de erro em vez de TypeError).
// ---------------------------------------------------------------------------
const CARTS_UNAVAILABLE = 'Recurso de carrinhos indisponível.';
const carts = api.carts || {
  list: () => Promise.reject(new Error(CARTS_UNAVAILABLE)),
};
const router = useRouter();
const r = useResource(carts, { pageSize: 25, sort: { key: 'updatedAt', dir: 'desc' } });
const toast = useToast();
const confirm = useConfirm();

// ---------------------------------------------------------------------------
// Leitores tolerantes: o backend pode serializar camelCase OU snake_case.
// Lemos ambos para a tela funcionar com qualquer convenção real.
// ---------------------------------------------------------------------------
const customerName = (row) => (row ? (row.customerName ?? row.customer_name ?? '') : '');
const itemsCount = (row) => {
  if (!row) return null;
  const v = row.itemsCount ?? row.items_count;
  return v == null ? null : v;
};
const subtotalOf = (row) => (row ? Number(row.subtotal ?? 0) : 0);
const statusOf = (row) => (row ? (row.status ?? '') : '');
const updatedAt = (row) => (row ? (row.updatedAt ?? row.updated_at ?? null) : null);
const identifier = (row) => (row ? (row.code || ('#' + row.id)) : '—');

// ---------------------------------------------------------------------------
// Enum de domínio (aberto | abandonado | convertido). Tom é declarado aqui
// porque essas palavras não estão no resolvedor genérico do kit; o rótulo
// legível acompanha sempre (a cor nunca é o único sinal).
// ---------------------------------------------------------------------------
const STATUS_LABELS = {
  aberto: 'Aberto',
  abandonado: 'Abandonado',
  convertido: 'Convertido',
};
const STATUS_TONES = {
  aberto: 'running',
  abandonado: 'warning',
  convertido: 'success',
};
const labelFor = (v) => STATUS_LABELS[v] || format.humanize(v);
const toneFor = (row) => STATUS_TONES[statusOf(row)] || 'neutral';

// ---------------------------------------------------------------------------
// Colunas (chaves lógicas; o conteúdo real vem dos slots cell-*).
// ---------------------------------------------------------------------------
const columns = [
  { key: 'customer', label: 'Cliente', sortable: true },
  { key: 'items', label: 'Itens', align: 'right' },
  { key: 'subtotal', label: 'Subtotal', align: 'right', sortable: true },
  { key: 'status', label: 'Situação', sortable: true },
  { key: 'updated', label: 'Atualizado em', sortable: true },
  { key: 'actions', label: 'Ações', align: 'right' },
];

// As colunas lógicas (chaves da tabela) mapeiam para os campos reais ao ordenar
// no servidor. `tableSort` guarda a chave LÓGICA para a tabela desenhar a seta na
// coluna certa; o recurso recebe o campo REAL (camelCase → api.js converte p/ snake).
const SORT_FIELD = {
  customer: 'customerName',
  subtotal: 'subtotal',
  status: 'status',
  updated: 'updatedAt',
};
const tableSort = ref({ key: 'updated', dir: 'desc' });
function onSort(s) {
  if (!s || !s.key) {
    tableSort.value = null;
    r.setSort(null);
    return;
  }
  tableSort.value = { key: s.key, dir: s.dir };
  r.setSort({ key: SORT_FIELD[s.key] || s.key, dir: s.dir });
}

// ---------------------------------------------------------------------------
// Filtros. `q`/`status` vão ao servidor (ignorados com segurança se não
// suportados); o período de atualização é refinado no cliente sobre as linhas
// REAIS carregadas, com aviso visível de "filtro local".
// ---------------------------------------------------------------------------
const filterFields = [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'nome do cliente' },
  {
    key: 'status',
    label: 'Situação',
    type: 'select',
    options: [
      { value: 'aberto', label: 'Aberto' },
      { value: 'abandonado', label: 'Abandonado' },
      { value: 'convertido', label: 'Convertido' },
    ],
  },
  { key: 'from', label: 'Atualizado de', type: 'date' },
  { key: 'to', label: 'Atualizado até', type: 'date' },
];
const blankFilters = () => ({ q: '', status: '', from: '', to: '' });
const filters = ref(blankFilters());

function applyFilters() {
  r.setFilters({
    q: filters.value.q || undefined,
    status: filters.value.status || undefined,
  });
}
function onClear() {
  filters.value = blankFilters();
  r.setFilters({ q: undefined, status: undefined });
}
function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}

// Refino local (período de atualização) sobre a página carregada.
const hasLocalFilter = computed(() => !!(filters.value.from || filters.value.to));
const filteredRows = computed(() => {
  const f = filters.value;
  const fromTs = f.from ? new Date(f.from + 'T00:00:00').getTime() : null;
  const toTs = f.to ? new Date(f.to + 'T23:59:59').getTime() : null;
  if (fromTs == null && toTs == null) return r.items.value;
  return r.items.value.filter((row) => {
    const raw = updatedAt(row);
    const ts = raw ? new Date(raw).getTime() : NaN;
    if (isNaN(ts)) return false;
    if (fromTs != null && ts < fromTs) return false;
    if (toTs != null && ts > toTs) return false;
    return true;
  });
});

// ---------------------------------------------------------------------------
// KPIs derivados das linhas reais exibidas.
// ---------------------------------------------------------------------------
const kpis = computed(() => {
  const rows = filteredRows.value;
  const abandoned = rows.filter((c) => statusOf(c) === 'abandonado');
  const converted = rows.filter((c) => statusOf(c) === 'convertido').length;
  return {
    count: rows.length,
    subtotal: rows.reduce((s, c) => s + subtotalOf(c), 0),
    abandoned: abandoned.length,
    abandonedValue: abandoned.reduce((s, c) => s + subtotalOf(c), 0),
    converted,
  };
});
const totalHint = computed(() => (r.total.value ? r.total.value + ' no total' : 'Sem carrinhos'));
const abandonedHint = computed(() => {
  const k = kpis.value;
  if (!k.count) return 'Oportunidades de recuperação';
  const pct = Math.round((k.abandoned / k.count) * 100);
  return pct + '% dos carrinhos exibidos';
});
const showRecoveryBanner = computed(
  () => !r.loading.value && !r.error.value && kpis.value.abandoned > 0 && kpis.value.abandonedValue > 0,
);
const resultSummary = computed(() => {
  if (r.loading.value) return 'Carregando…';
  const shown = filteredRows.value.length;
  if (!r.total.value) return 'Nenhum carrinho registrado';
  if (hasLocalFilter.value) return shown + ' de ' + r.items.value.length + ' nesta página (filtro local)';
  return shown + ' nesta página · ' + r.total.value + ' no total';
});
const emptyState = computed(() =>
  hasLocalFilter.value
    ? { title: 'Nenhum carrinho no período', description: 'Ajuste as datas de atualização.', icon: '🔍' }
    : {
        title: 'Nenhum carrinho ainda',
        description: 'Carrinhos abertos e abandonados aparecerão aqui para você recuperar a venda.',
        icon: '🛒',
      },
);

// ---------------------------------------------------------------------------
// Tempo relativo (puro, sem dependências; CSP-safe). Um carrinho "parado" há
// mais de 24h é destacado como oportunidade fria de recuperação.
// ---------------------------------------------------------------------------
function relativeTime(value) {
  if (!value) return '';
  const ts = new Date(value).getTime();
  if (isNaN(ts)) return '';
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return 'há ' + min + ' min';
  const h = Math.round(min / 60);
  if (h < 24) return 'há ' + h + ' h';
  const d = Math.round(h / 24);
  if (d < 30) return 'há ' + d + ' d';
  const mo = Math.round(d / 30);
  return 'há ' + mo + ' mês' + (mo > 1 ? 'es' : '');
}
const STALE_MS = 24 * 60 * 60 * 1000;
function isStale(row) {
  if (statusOf(row) === 'convertido') return false;
  const raw = updatedAt(row);
  const ts = raw ? new Date(raw).getTime() : NaN;
  return !isNaN(ts) && Date.now() - ts > STALE_MS;
}

// ---------------------------------------------------------------------------
// Regra da ação principal: ir ao checkout só faz sentido com itens e sem ter
// convertido. (REQ-SHOPDESK-0003 — recuperar vendas.)
// ---------------------------------------------------------------------------
const canCheckout = (row) => {
  if (!row) return false;
  if (statusOf(row) === 'convertido') return false;
  const n = itemsCount(row);
  return n == null || n > 0;
};

// ---------------------------------------------------------------------------
// Detalhe (GET /v1/carts/:id, refinando o que já temos).
// ---------------------------------------------------------------------------
const detailOpen = ref(false);
const detail = ref(null);
const detailLoading = ref(false);
const detailError = ref('');
let lastDetailId = null;
const detailTitle = computed(() =>
  detail.value ? 'Carrinho ' + identifier(detail.value) : 'Carrinho',
);

async function openDetail(row) {
  detailOpen.value = true;
  lastDetailId = row.id;
  detail.value = row; // mostra o que já temos; refina com o get se houver
  detailError.value = '';
  if (typeof carts.get !== 'function') return;
  detailLoading.value = true;
  try {
    detail.value = await carts.get(row.id);
  } catch (e) {
    detailError.value = e.message || 'Não foi possível carregar o carrinho.';
  } finally {
    detailLoading.value = false;
  }
}
function reloadDetail() {
  if (lastDetailId != null) openDetail({ id: lastDetailId });
}

// ---------------------------------------------------------------------------
// Ação principal: levar o carrinho ao CHECKOUT (rota de domínio /checkout/:cartId).
// Confirmação antes de navegar (passo de efeito colateral comercial).
// ---------------------------------------------------------------------------
const busyId = ref(null);
async function goToCheckout(row) {
  if (!canCheckout(row)) {
    toast.warning('Este carrinho não pode seguir para o checkout.');
    return;
  }
  const who = customerName(row) || identifier(row);
  const ok = await confirm({
    title: 'Ir ao checkout',
    message:
      'Iniciar o checkout do carrinho de ' +
      who +
      ' (' +
      format.formatCurrency(subtotalOf(row)) +
      ')? Você será levado ao fluxo de pagamento para recuperar esta venda.',
    confirmLabel: 'Ir ao checkout',
  });
  if (!ok) return;
  busyId.value = row.id;
  try {
    await router.push({ path: '/checkout/' + row.id });
    toast.success('Checkout iniciado para ' + who + '.');
    detailOpen.value = false;
  } catch (e) {
    toast.error('Não foi possível abrir o checkout', { detail: e && e.message });
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
  const head = ['Identificação', 'Cliente', 'Itens', 'Subtotal', 'Situação', 'Atualizado em'];
  const lines = [head.join(';')];
  for (const c of rows) {
    lines.push(
      [
        csvCell(identifier(c)),
        csvCell(customerName(c)),
        csvCell(itemsCount(c)),
        csvCell(subtotalOf(c)),
        csvCell(labelFor(statusOf(c))),
        csvCell(updatedAt(c)),
      ].join(';'),
    );
  }
  try {
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'carrinhos-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado (' + rows.length + ' carrinhos).');
  } catch (e) {
    toast.error('Falha ao exportar CSV', { detail: e.message });
  }
}

onMounted(r.load);
</script>

<style scoped>
.carts-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

.carts-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-warn));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-warn) / 0.1);
  color: rgb(var(--ui-fg));
}
.carts-banner-icon {
  font-size: var(--ui-text-lg);
  line-height: 1;
}
.carts-banner-text {
  margin: 0;
  font-size: var(--ui-text-sm);
}

.carts-cust {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.carts-cust-name {
  font-weight: 600;
}
.carts-cust-id {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

.carts-subtotal {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.carts-when {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.carts-when-rel {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.carts-when-rel[data-stale="true"] {
  color: rgb(var(--ui-warn));
  font-weight: 600;
}

.carts-actions {
  display: inline-flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  flex-wrap: wrap;
}

.carts-detail {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
}
.carts-detail-row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: var(--ui-space-3);
  align-items: center;
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.carts-detail-row:last-child {
  border-bottom: none;
}
.carts-detail dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.carts-detail dd {
  margin: 0;
}
.carts-detail-when {
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

@media (max-width: 980px) {
  .carts-kpis {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 560px) {
  .carts-kpis {
    grid-template-columns: 1fr;
  }
  .carts-detail-row {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>
