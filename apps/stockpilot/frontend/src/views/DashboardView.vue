<!--
  DashboardView — Painel de controle do StockPilot
  Ref: REQ-STOCKPILOT-0005 (visão executiva do estoque), REQ-STOCKPILOT-0001 (observabilidade)

  Visão executiva: KPIs (produtos OK/ALERTA/RUPTURA, pedidos abertos, alertas ativos),
  gráfico de status do estoque (StatusDonut), profundidade da fila de jobs (QueueDepthGauge)
  e o fluxo dos últimos pedidos/alertas (RecentActivityList). Atalhos rápidos para repor
  produtos em RUPTURA e ver a fila assíncrona.

  Componentes da REF → kit ui-vue:
    KpiCard            → UiMetricCard (produtos OK/ALERTA/RUPTURA, pedidos, alertas)
    StatusDonut        → donut SVG CSS-safe do mix OK/ALERTA/RUPTURA
    QueueDepthGauge    → barras proporcionais por status (queued/running/done/dlq), bucket 0..10
    RecentActivityList → UiDataTable (últimos pedidos) + lista de alertas ativos
    AlertBanner        → faixa agregada de saúde (rupturas / DLQ / API offline)

  Contrato de UI: usa SÓ o kit ui-vue, SÓ tokens --ui-*; sem style inline / :style / v-html;
  renderiza TODOS os estados (loading/empty/error/normal); chama SÓ endpoints REAIS via ../api.js:
    dashboard.summary -> GET /v1/dashboard/summary (REF-STOCKPILOT-0001: KPIs + donut em uma chamada)
    orders.list       -> GET /v1/orders            (pedidos abertos pending/processing)
    alerts.list       -> GET /v1/alerts            (RUPTURA + falhas de envio ao fornecedor)
    jobs.list         -> GET /v1/health/jobs       (profundidade da fila por status)
    health()          -> GET /health               (readiness da API/worker)
    products.reorder  -> POST /v1/products/:id/reorder  (reposição assíncrona idempotente)
  Ação efetiva (repor produto em ruptura) via useConfirm + toast (sucesso/erro).

  Cada fonte é carregada isolada: a falha de uma não derruba o painel inteiro (degradação graciosa).
  Roteamento de DOMÍNIO apenas: TODO card/atalho/link aponta para /products, /orders ou /alerts.
-->
<template>
  <UiPageLayout
    eyebrow="StockPilot — Reposição de Estoque"
    title="Painel de controle"
    subtitle="O pulso do seu estoque: produtos, pedidos, alertas e a fila assíncrona em um só lugar."
    width="wide"
    :loading="firstLoad"
    loading-message="Carregando o painel de estoque…"
    :error="fatalError"
    @retry="() => loadAll(false)"
  >
    <!-- ===================== Ações de cabeçalho ===================== -->
    <template #actions>
      <span v-if="lastUpdatedLabel" class="sd-updated ui-muted">Atualizado {{ lastUpdatedLabel }}</span>
      <UiButton variant="ghost" size="sm" :loading="refreshing" @click="loadAll(true)">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton to="/products" size="sm">Ver produtos</UiButton>
    </template>

    <!-- ===================== AlertBanner: saúde agregada ===================== -->
    <!-- Só após o 1º carregamento: não afirmar "Estoque sob controle" com contagens=0 antes dos dados. -->
    <template v-if="!firstLoad" #banner>
      <div class="sd-banner" :data-tone="bannerTone" role="status" aria-live="polite">
        <span class="sd-banner-orb" :data-tone="bannerTone" aria-hidden="true" />
        <div class="sd-banner-copy">
          <strong class="sd-banner-head">{{ bannerHead }}</strong>
          <span class="sd-banner-sub">{{ bannerSub }}</span>
        </div>
        <div class="sd-banner-cta">
          <UiButton v-if="ruptureCount > 0" to="/alerts" variant="subtle" size="sm">
            Ver {{ ruptureCount }} {{ ruptureCount === 1 ? 'ruptura' : 'rupturas' }}
          </UiButton>
          <UiButton v-else-if="dlqCount > 0" to="/orders" variant="subtle" size="sm">
            Ver pedidos
          </UiButton>
        </div>
      </div>
    </template>

    <!-- ===================== KPIs (KpiCard) ===================== -->
    <section class="sd-kpis" aria-label="Indicadores do estoque">
      <UiMetricCard
        label="Produtos no catálogo"
        :value="kpi.total"
        :loading="summaryLoading"
        tone="primary"
        clickable
        :hint="summaryError ? 'Catálogo indisponível' : 'Ver catálogo completo'"
        @click="go('/products')"
      />
      <UiMetricCard
        label="Estoque saudável (OK)"
        :value="kpi.ok"
        :loading="summaryLoading"
        :tone="okCount > 0 ? 'success' : 'neutral'"
        :hint="summaryError ? '—' : okPctLabel"
      />
      <UiMetricCard
        label="Em alerta"
        :value="kpi.alerta"
        :loading="summaryLoading"
        :tone="alertaCount > 0 ? 'warning' : 'neutral'"
        clickable
        :hint="summaryError ? '—' : 'Perto do mínimo · com pedido aberto'"
        @click="go('/products')"
      />
      <UiMetricCard
        label="Em ruptura"
        :value="kpi.ruptura"
        :loading="summaryLoading"
        :tone="ruptureCount > 0 ? 'error' : 'neutral'"
        clickable
        :hint="summaryError ? '—' : 'Abaixo do mínimo · repor agora'"
        @click="go('/alerts')"
      />
      <UiMetricCard
        label="Pedidos abertos"
        :value="kpi.orders"
        :loading="ordersLoading"
        :tone="openOrdersCount > 0 ? 'running' : 'neutral'"
        clickable
        :hint="ordersError ? 'Pedidos indisponíveis' : 'Pending / processing'"
        @click="go('/orders')"
      />
      <UiMetricCard
        label="Alertas ativos"
        :value="kpi.alerts"
        :loading="alertsLoading"
        :tone="activeAlertsCount > 0 ? 'warning' : 'neutral'"
        clickable
        :hint="alertsError ? 'Alertas indisponíveis' : 'Rupturas + falhas de envio'"
        @click="go('/alerts')"
      />
    </section>

    <!-- ===================== StatusDonut + QueueDepthGauge ===================== -->
    <section class="sd-split">
      <!-- StatusDonut: mix do estoque por status derivado -->
      <UiCard title="Status do estoque" subtitle="Distribuição dos produtos por status derivado (OK / ALERTA / RUPTURA)">
        <template #actions>
          <UiStatusBadge
            v-if="!summaryLoading && !summaryError && productsTotal > 0"
            :tone="stockTone"
            :label="stockHealthLabel"
          />
        </template>

        <UiLoadingState v-if="summaryLoading" variant="skeleton" :skeleton-lines="4" />
        <UiErrorState v-else-if="summaryError" :message="summaryError" retryable @retry="loadSummary" />
        <UiEmptyState
          v-else-if="productsTotal === 0"
          icon="box"
          title="Nenhum produto cadastrado"
          description="Cadastre produtos para acompanhar o status do estoque e disparar reposições."
        >
          <template #action><UiButton to="/products" size="sm">Ir para produtos</UiButton></template>
        </UiEmptyState>

        <div v-else class="sd-donut-wrap">
          <!-- Donut SVG: cor SÓ via atributo `stroke` (CSP-safe; sem CSS fill dinâmico) -->
          <div class="sd-donut" role="img" :aria-label="donutAriaLabel">
            <svg class="sd-donut-svg" viewBox="0 0 42 42" focusable="false" aria-hidden="true">
              <circle class="sd-donut-base" cx="21" cy="21" r="15.915" />
              <circle
                v-for="seg in donutSegments"
                :key="seg.key"
                class="sd-donut-seg"
                :data-tone="seg.tone"
                cx="21"
                cy="21"
                r="15.915"
                :stroke-dasharray="seg.dash"
                :stroke-dashoffset="seg.offset"
              />
            </svg>
            <div class="sd-donut-center">
              <span class="sd-donut-num">{{ format.formatNumber(productsTotal) }}</span>
              <span class="sd-donut-cap ui-muted">{{ productsTotal === 1 ? 'produto' : 'produtos' }}</span>
            </div>
          </div>

          <ul class="sd-legend">
            <li v-for="seg in donutSegments" :key="seg.key" class="sd-legend-row">
              <span class="sd-legend-dot" :data-tone="seg.tone" aria-hidden="true" />
              <span class="sd-legend-label">{{ seg.label }}</span>
              <span class="sd-legend-num" :data-tone="seg.tone">{{ format.formatNumber(seg.count) }}</span>
              <span class="sd-legend-pct ui-muted">{{ seg.pct }}%</span>
            </li>
          </ul>
        </div>
      </UiCard>

      <!-- QueueDepthGauge: profundidade da fila assíncrona -->
      <UiCard title="Fila assíncrona" subtitle="Profundidade dos jobs de reposição por status (queued / running / done / dlq)">
        <template #actions>
          <UiStatusBadge
            v-if="!jobsLoading && !jobsError"
            :tone="queueTone"
            :label="queueLabel"
          />
        </template>

        <UiLoadingState v-if="jobsLoading" variant="skeleton" :skeleton-lines="4" />
        <UiErrorState v-else-if="jobsError" :message="jobsError" retryable @retry="loadJobs" />
        <UiEmptyState
          v-else-if="!hasAnyJob"
          icon="check"
          title="Fila vazia"
          description="Nenhum job na fila de reposição agora. O worker está ocioso e em dia."
        />
        <div v-else class="sd-gauge">
          <div v-for="g in gaugeRows" :key="g.key" class="sd-gauge-row">
            <span class="sd-gauge-label">
              <span class="sd-gauge-dot" :data-tone="g.tone" aria-hidden="true" />
              {{ g.label }}
            </span>
            <div
              class="sd-gauge-track"
              role="img"
              :aria-label="g.label + ': ' + g.count + ' jobs (' + g.pct + '% do total)'"
            >
              <span class="sd-gauge-fill" :data-tone="g.tone" :data-w="g.bucket" />
            </div>
            <span class="sd-gauge-num" :data-tone="g.tone">{{ format.formatNumber(g.count) }}</span>
          </div>
          <p class="sd-gauge-foot ui-muted">
            {{ format.formatNumber(jobsTotal) }} {{ jobsTotal === 1 ? 'job no total' : 'jobs no total' }}
            <span v-if="dlqCount > 0"> · {{ dlqCount }} em DLQ exigem atenção</span>
            <span v-else-if="backlog > 0"> · {{ backlog }} no backlog ativo</span>
          </p>
        </div>

        <template #footer>
          <div class="sd-card-foot">
            <span class="sd-foot-health" :data-online="apiOnline ? 'true' : 'false'">
              <span class="sd-foot-orb" :data-online="apiOnline ? 'true' : 'false'" aria-hidden="true" />
              <span class="ui-muted">{{ apiOnline ? 'Worker no ar' : 'Readiness indisponível' }}</span>
            </span>
            <UiButton to="/orders" variant="ghost" size="sm">Ver pedidos</UiButton>
          </div>
        </template>
      </UiCard>
    </section>

    <!-- ===================== RecentActivityList: pedidos + alertas ===================== -->
    <section class="sd-activity">
      <!-- Últimos pedidos -->
      <UiCard title="Últimos pedidos" subtitle="Pedidos de reposição abertos (mais recentes primeiro)">
        <template #actions>
          <UiStatusBadge
            v-if="!ordersLoading && !ordersError"
            :tone="openOrdersCount > 0 ? 'running' : 'success'"
            :label="openOrdersCount > 0 ? openOrdersCount + ' aberto(s)' : 'Nenhum aberto'"
          />
          <UiButton to="/orders" variant="ghost" size="sm">Ver todos</UiButton>
        </template>

        <UiDataTable
          :columns="orderColumns"
          :rows="recentOrders"
          :loading="ordersLoading"
          :error="ordersError"
          row-key="id"
          density="comfortable"
          clickable-rows
          :empty="{
            title: 'Nenhum pedido aberto',
            description: 'Sem pedidos de reposição pendentes. Dispare uma reposição a partir de produtos em ruptura.',
            icon: 'check',
          }"
          @retry="loadOrders"
          @row-click="go('/orders')"
        >
          <template #cell-product_name="{ row }">
            <span class="sd-cell-strong">{{ row.product_name || ('Produto ' + row.product_id) }}</span>
          </template>
          <template #cell-status="{ value }">
            <UiStatusBadge :status="value" :label="orderStatusLabel(value)" />
          </template>
          <template #cell-created_at="{ value }">
            <span class="sd-cell-time">{{ format.formatDateTime(value) }}</span>
          </template>
          <template #empty-action><UiButton to="/alerts" size="sm">Ver produtos em ruptura</UiButton></template>
        </UiDataTable>
      </UiCard>

      <!-- Alertas ativos (com ação rápida de reposição) -->
      <UiCard title="Alertas ativos" subtitle="Produtos em ruptura e falhas de envio ao fornecedor">
        <template #actions>
          <UiStatusBadge
            v-if="!alertsLoading && !alertsError"
            :tone="activeAlertsCount > 0 ? 'error' : 'success'"
            :label="activeAlertsCount > 0 ? activeAlertsCount + ' ativo(s)' : 'Tudo certo'"
          />
          <UiButton to="/alerts" variant="ghost" size="sm">Ver todos</UiButton>
        </template>

        <UiLoadingState v-if="alertsLoading" variant="skeleton" :skeleton-lines="5" />
        <UiErrorState v-else-if="alertsError" :message="alertsError" retryable @retry="loadAlerts" />
        <UiEmptyState
          v-else-if="recentAlerts.length === 0"
          icon="check"
          title="Sem alertas ativos"
          description="Nenhum produto em ruptura nem falha de envio ao fornecedor. Estoque sob controle."
        >
          <template #action><UiButton to="/products" size="sm">Ver produtos</UiButton></template>
        </UiEmptyState>
        <ul v-else class="sd-alerts">
          <li v-for="a in recentAlerts" :key="a.id" class="sd-alert-row">
            <span class="sd-alert-dot" :data-tone="alertTone(a)" aria-hidden="true" />
            <div class="sd-alert-main">
              <RouterLink class="sd-alert-name" to="/alerts">{{ a.name || ('Produto ' + a.id) }}</RouterLink>
              <span class="sd-alert-meta ui-muted">
                <template v-if="isErrorAlert(a)">{{ a.last_error || 'Falha ao enviar ao fornecedor' }}</template>
                <template v-else>
                  Estoque {{ format.formatNumber(a.current_stock) }} / mín. {{ format.formatNumber(a.min_stock) }}
                </template>
              </span>
            </div>
            <UiStatusBadge :tone="alertTone(a)" :label="alertLabel(a)" size="sm" />
            <UiButton
              v-if="!isErrorAlert(a)"
              size="sm"
              variant="subtle"
              :loading="reorderingId === a.id"
              :disabled="reorderingId !== null && reorderingId !== a.id"
              :aria-label="'Repor ' + (a.name || ('produto ' + a.id))"
              @click="reorder(a)"
            >Repor</UiButton>
            <UiButton
              v-else
              size="sm"
              variant="ghost"
              :loading="reorderingId === a.id"
              :disabled="reorderingId !== null && reorderingId !== a.id"
              :aria-label="'Reabrir reposição de ' + (a.name || ('produto ' + a.id))"
              @click="reorder(a)"
            >Reabrir</UiButton>
          </li>
        </ul>

        <template v-if="recentAlerts.length && activeAlertsCount > recentAlerts.length" #footer>
          <div class="sd-card-foot">
            <span class="ui-muted">
              Mostrando {{ recentAlerts.length }} de {{ activeAlertsCount }} alertas ativos.
            </span>
            <UiButton to="/alerts" variant="ghost" size="sm">Ver todos</UiButton>
          </div>
        </template>
      </UiCard>
    </section>

    <!-- ===================== Atalhos rápidos ===================== -->
    <UiCard title="Atalhos rápidos" subtitle="Vá direto ao ponto da operação do dia">
      <div class="sd-quick">
        <RouterLink class="sd-quick-card" to="/alerts">
          <span class="sd-quick-ic" data-tone="error" aria-hidden="true">!</span>
          <span class="sd-quick-copy">
            <span class="sd-quick-h">Repor rupturas</span>
            <span class="sd-quick-d ui-muted">{{ ruptureCount }} {{ ruptureCount === 1 ? 'produto abaixo do mínimo' : 'produtos abaixo do mínimo' }}</span>
          </span>
          <span class="sd-quick-arrow" aria-hidden="true">→</span>
        </RouterLink>
        <RouterLink class="sd-quick-card" to="/orders">
          <span class="sd-quick-ic" data-tone="running" aria-hidden="true">↻</span>
          <span class="sd-quick-copy">
            <span class="sd-quick-h">Pedidos em curso</span>
            <span class="sd-quick-d ui-muted">{{ openOrdersCount }} {{ openOrdersCount === 1 ? 'pedido aberto' : 'pedidos abertos' }}</span>
          </span>
          <span class="sd-quick-arrow" aria-hidden="true">→</span>
        </RouterLink>
        <RouterLink class="sd-quick-card" to="/products">
          <span class="sd-quick-ic" data-tone="primary" aria-hidden="true">▤</span>
          <span class="sd-quick-copy">
            <span class="sd-quick-h">Catálogo de produtos</span>
            <span class="sd-quick-d ui-muted">{{ format.formatNumber(productsTotal) }} {{ productsTotal === 1 ? 'produto cadastrado' : 'produtos cadastrados' }}</span>
          </span>
          <span class="sd-quick-arrow" aria-hidden="true">→</span>
        </RouterLink>
      </div>
    </UiCard>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { products, orders, alerts, dashboard, resourceFactory, health } from '../api.js';
// products.reorder(id) → POST /v1/products/:id/reorder (ação de domínio em api.js, não URL ad-hoc)
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiStatusBadge,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  UiButton,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';

const router = useRouter();
const toast = useToast();
const askConfirm = useConfirm();

// --- Recursos de DOMÍNIO (rotas REAIS sob /v1) -------------------------------
// dashboard.summary → GET /v1/dashboard/summary (KPIs: ok/alerta/ruptura/total/open_orders/active_alerts)
// orders            → GET /v1/orders            (pedidos abertos pending/processing)
// alerts            → GET /v1/alerts            (RUPTURA + falhas de envio)
// jobs              → GET /v1/health/jobs       (profundidade da fila por status)
// health            → GET /health               (readiness da API/worker)
// products.reorder  → POST /v1/products/:id/reorder (reposição assíncrona idempotente)
const jobsResource = resourceFactory('health/jobs');

const MAX_ROWS = 6;

function rowsOf(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  return [];
}
const num = (v) => Number(v) || 0;

// --- Estado (cada fonte isolada: falha de uma não derruba as demais) ---------
const firstLoad = ref(true);
const refreshing = ref(false);
const fatalError = ref(null);
const lastUpdated = ref(null);

// summary → GET /v1/dashboard/summary (REF-STOCKPILOT-0001): contagens agregadas.
// Substitui o antigo products.list() para KPIs e donut — sem baixar a lista completa.
const summaryData = ref({ ok: 0, alerta: 0, ruptura: 0, total: 0, open_orders: 0, active_alerts: 0 });
const summaryLoading = ref(false);
const summaryError = ref(null);

const ordersList = ref([]);
const ordersLoading = ref(false);
const ordersError = ref(null);

const alertsList = ref([]);
const alertsLoading = ref(false);
const alertsError = ref(null);

const jobs = ref({});
const jobsLoading = ref(false);
const jobsError = ref(null);

const apiOnline = ref(false);

const reorderingId = ref(null);

// --- Carregadores -----------------------------------------------------------
async function loadSummary() {
  summaryLoading.value = true; summaryError.value = null;
  try { summaryData.value = await dashboard.summary(); }
  catch (e) { summaryError.value = e.message || 'Falha ao carregar o resumo.'; summaryData.value = { ok: 0, alerta: 0, ruptura: 0, total: 0, open_orders: 0, active_alerts: 0 }; }
  finally { summaryLoading.value = false; }
}
async function loadOrders() {
  ordersLoading.value = true; ordersError.value = null;
  try { ordersList.value = rowsOf(await orders.list()); }
  catch (e) { ordersError.value = e.message || 'Falha ao carregar os pedidos.'; ordersList.value = []; }
  finally { ordersLoading.value = false; }
}
async function loadAlerts() {
  alertsLoading.value = true; alertsError.value = null;
  try { alertsList.value = rowsOf(await alerts.list()); }
  catch (e) { alertsError.value = e.message || 'Falha ao carregar os alertas.'; alertsList.value = []; }
  finally { alertsLoading.value = false; }
}
async function loadJobs() {
  jobsLoading.value = true; jobsError.value = null;
  try { const r = await jobsResource.list(); jobs.value = (r && r.jobs) || {}; }
  catch (e) { jobsError.value = e.message || 'Falha ao carregar a fila.'; jobs.value = {}; }
  finally { jobsLoading.value = false; }
}
async function loadHealth() {
  try { await health(); apiOnline.value = true; }
  catch { apiOnline.value = false; }
}

async function loadAll(isRefresh = false) {
  if (isRefresh) refreshing.value = true;
  fatalError.value = null;
  try {
    await Promise.allSettled([loadSummary(), loadOrders(), loadAlerts(), loadJobs(), loadHealth()]);
    lastUpdated.value = new Date();
    // Fatal só quando NADA carregou — falha visível em vez de painel "tudo zero".
    if (summaryError.value && ordersError.value && alertsError.value && jobsError.value) {
      fatalError.value = 'Não foi possível carregar o painel. Verifique a conexão com a API.';
    }
    if (isRefresh && !fatalError.value) toast.success('Painel atualizado.');
  } catch (e) {
    fatalError.value = e.message || 'Erro inesperado ao carregar o painel.';
    if (isRefresh) toast.error('Falha ao atualizar.');
  } finally {
    firstLoad.value = false;
    refreshing.value = false;
  }
}

// --- Derivações: produtos por status (StatusDonut + KpiCard) — de summary, não da lista completa.
const productsTotal = computed(() => Number(summaryData.value.total) || 0);
const okCount = computed(() => Number(summaryData.value.ok) || 0);
const alertaCount = computed(() => Number(summaryData.value.alerta) || 0);
const ruptureCount = computed(() => Number(summaryData.value.ruptura) || 0);

const okPctLabel = computed(() => {
  if (productsTotal.value === 0) return 'Sem produtos';
  return Math.round((okCount.value / productsTotal.value) * 100) + '% do catálogo';
});

// Pedidos ABERTOS = só pending/processing. Sem fallback "|| total": 0 aberto é um valor
// legítimo (catálogo só com delivered/failed não pode parecer "todos abertos").
const openOrdersCount = computed(() =>
  ordersList.value.filter((o) => ['pending', 'processing'].includes(String(o.status || '').toLowerCase())).length);

const activeAlertsCount = computed(() => alertsList.value.length);

const kpi = computed(() => ({
  total: format.formatNumber(productsTotal.value),
  ok: format.formatNumber(okCount.value),
  alerta: format.formatNumber(alertaCount.value),
  ruptura: format.formatNumber(ruptureCount.value),
  orders: format.formatNumber(openOrdersCount.value),
  alerts: format.formatNumber(activeAlertsCount.value),
}));

// --- StatusDonut: segmentos do anel (circunferência 100 em r=15.915) ---------
const DONUT_DEFS = [
  { key: 'ok', label: 'OK', tone: 'success' },
  { key: 'alerta', label: 'Em alerta', tone: 'warning' },
  { key: 'ruptura', label: 'Em ruptura', tone: 'error' },
];
const donutSegments = computed(() => {
  const counts = { ok: okCount.value, alerta: alertaCount.value, ruptura: ruptureCount.value };
  const total = productsTotal.value || 1;
  let acc = 0;
  return DONUT_DEFS.map((d) => {
    const count = counts[d.key];
    const len = (count / total) * 100;
    // offset de stroke-dasharray (gira 25 para iniciar no topo)
    const seg = {
      ...d,
      count,
      pct: Math.round((count / total) * 100),
      dash: len.toFixed(3) + ' ' + (100 - len).toFixed(3),
      offset: (25 - acc).toFixed(3),
    };
    acc += len;
    return seg;
  });
});
const donutAriaLabel = computed(() =>
  'Status do estoque: ' + donutSegments.value.map((s) => s.count + ' ' + s.label + ' (' + s.pct + '%)').join(', '));

const stockTone = computed(() => {
  if (ruptureCount.value > 0) return 'error';
  if (alertaCount.value > 0) return 'warning';
  return 'success';
});
const stockHealthLabel = computed(() => {
  if (ruptureCount.value > 0) return ruptureCount.value + ' em ruptura';
  if (alertaCount.value > 0) return alertaCount.value + ' em alerta';
  return 'Tudo saudável';
});

// --- QueueDepthGauge: contagens da fila --------------------------------------
const queuedCount = computed(() => num(jobs.value.queued));
const runningCount = computed(() => num(jobs.value.running));
const doneCount = computed(() => num(jobs.value.done));
const dlqCount = computed(() => num(jobs.value.dlq));
const jobsTotal = computed(() => queuedCount.value + runningCount.value + doneCount.value + dlqCount.value);
const backlog = computed(() => queuedCount.value + runningCount.value);
const hasAnyJob = computed(() => jobsTotal.value > 0);

const GAUGE_DEFS = [
  { key: 'queued', label: 'Na fila', tone: 'warning' },
  { key: 'running', label: 'Processando', tone: 'running' },
  { key: 'done', label: 'Concluídos', tone: 'success' },
  { key: 'dlq', label: 'Falha (DLQ)', tone: 'error' },
];
const gaugeRows = computed(() => {
  const total = jobsTotal.value || 1;
  const max = Math.max(1, queuedCount.value, runningCount.value, doneCount.value, dlqCount.value);
  return GAUGE_DEFS.map((d) => {
    const count = num(jobs.value[d.key]);
    return {
      ...d,
      count,
      pct: Math.round((count / total) * 100),
      bucket: count === 0 ? 0 : Math.max(1, Math.round((count / max) * 10)),
    };
  });
});
const queueTone = computed(() => {
  if (dlqCount.value > 0) return 'error';
  if (backlog.value > 0) return 'running';
  return 'success';
});
const queueLabel = computed(() => {
  if (dlqCount.value > 0) return dlqCount.value + ' em DLQ';
  if (backlog.value > 0) return backlog.value + ' ativo(s)';
  return 'Em dia';
});

// --- AlertBanner: tom + mensagem agregada ------------------------------------
const bannerTone = computed(() => {
  if (!apiOnline.value && jobsError.value) return 'error';
  if (ruptureCount.value > 0 || dlqCount.value > 0) return 'error';
  if (alertaCount.value > 0 || backlog.value > 0 || activeAlertsCount.value > 0) return 'warn';
  return 'ok';
});
const bannerHead = computed(() => {
  if (!apiOnline.value && jobsError.value) return 'API / worker indisponível.';
  if (ruptureCount.value > 0) return ruptureCount.value + (ruptureCount.value === 1 ? ' produto em ruptura.' : ' produtos em ruptura.');
  if (dlqCount.value > 0) return dlqCount.value + (dlqCount.value === 1 ? ' reposição falhou (DLQ).' : ' reposições falharam (DLQ).');
  if (alertaCount.value > 0) return alertaCount.value + (alertaCount.value === 1 ? ' produto em alerta.' : ' produtos em alerta.');
  if (backlog.value > 0) return backlog.value + (backlog.value === 1 ? ' job na fila.' : ' jobs na fila.');
  return 'Estoque sob controle.';
});
const bannerSub = computed(() => {
  if (!apiOnline.value && jobsError.value) return 'Não foi possível confirmar o readiness — verifique o pod do worker.';
  if (ruptureCount.value > 0) return 'Produtos abaixo do mínimo sem pedido aberto — reponha para evitar parada.';
  if (dlqCount.value > 0) return 'Reposições que esgotaram tentativas ao fornecedor precisam de atenção.';
  if (alertaCount.value > 0) return 'Produtos perto do mínimo já têm pedido aberto e estão sendo repostos.';
  if (backlog.value > 0) return 'Jobs de reposição aguardando o worker — o processamento está em curso.';
  return 'Sem rupturas, sem falhas na fila e nenhum alerta ativo no momento.';
});

// --- RecentActivityList: últimos pedidos -------------------------------------
const recentOrders = computed(() => {
  const ts = (o) => { const d = o && o.created_at ? new Date(o.created_at) : null; return d && !isNaN(d.getTime()) ? d.getTime() : 0; };
  return [...ordersList.value]
    .sort((a, b) => (ts(b) - ts(a)) || (num(b.id) - num(a.id)))
    .slice(0, MAX_ROWS);
});
const orderColumns = [
  { key: 'product_name', label: 'Produto' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Criado', align: 'right' },
];
const ORDER_LABELS = { pending: 'Pendente', processing: 'Processando', delivered: 'Entregue', failed: 'Falhou' };
const orderStatusLabel = (s) => ORDER_LABELS[String(s || '').toLowerCase()] || format.humanize(s);

// --- RecentActivityList: alertas ativos --------------------------------------
const isErrorAlert = (a) => String(a && a.alert_type ? a.alert_type : '').toUpperCase() === 'ERROR';
const recentAlerts = computed(() => {
  const rank = (a) => (isErrorAlert(a) ? 0 : 1); // falhas de envio primeiro, depois rupturas
  return [...alertsList.value]
    .sort((a, b) => rank(a) - rank(b) || num(a.current_stock) - num(b.current_stock))
    .slice(0, MAX_ROWS);
});
const alertTone = (a) => (isErrorAlert(a) ? 'error' : 'warning');
const alertLabel = (a) => (isErrorAlert(a) ? 'Falha envio' : 'Ruptura');

// --- Navegação (SOMENTE rotas de DOMÍNIO) ------------------------------------
function go(to) { router.push(to); }

// --- Ação: repor / reabrir reposição (efetiva, idempotente) ------------------
async function reorder(a) {
  if (reorderingId.value !== null) return;
  const label = a.name || ('produto ' + a.id);
  const isError = isErrorAlert(a);
  const ok = await askConfirm({
    title: isError ? 'Reabrir reposição' : 'Repor produto',
    message: isError
      ? 'Reabrir a reposição de "' + label + '"? Um pedido será reenfileirado ao fornecedor (idempotente — '
        + 'se já houver um pedido aberto, ele é mantido).'
      : 'Disparar a reposição de "' + label + '"? Um pedido será criado e enviado ao fornecedor de forma assíncrona '
        + '(idempotente — se já houver um pedido aberto, ele é mantido).',
    confirmLabel: isError ? 'Reabrir agora' : 'Repor agora',
  });
  if (!ok) return;
  reorderingId.value = a.id;
  try {
    const res = await products.reorder(a.id);
    if (res && res.deduped) {
      toast.info('Já existe um pedido aberto para "' + label + '". Reposição mantida.');
    } else {
      toast.success('Reposição de "' + label + '" enfileirada com sucesso.');
    }
    // Recarrega o que muda com a reposição: summary (KPIs), pedidos, alertas e a fila.
    await Promise.allSettled([loadSummary(), loadOrders(), loadAlerts(), loadJobs()]);
    lastUpdated.value = new Date();
  } catch (e) {
    toast.error(e.message || 'Falha ao disparar a reposição.');
  } finally {
    reorderingId.value = null;
  }
}

// --- Rótulo "atualizado HH:MM" ----------------------------------------------
const lastUpdatedLabel = computed(() =>
  lastUpdated.value ? new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(lastUpdated.value) : '');

onMounted(() => loadAll(false));
</script>

<style scoped>
/* ---- Cabeçalho ---- */
.sd-updated { font-size: var(--ui-text-xs); align-self: center; font-variant-numeric: tabular-nums; }

/* ---- AlertBanner ---- */
.sd-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding: var(--ui-space-4) var(--ui-space-5);
  border: 1px solid rgb(var(--ui-border));
  border-left: 4px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
}
.sd-banner[data-tone="ok"] { border-left-color: rgb(var(--ui-ok)); }
.sd-banner[data-tone="warn"] { border-left-color: rgb(var(--ui-warn)); }
.sd-banner[data-tone="error"] { border-left-color: rgb(var(--ui-danger)); }
.sd-banner-orb {
  width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0;
  background: rgb(var(--ui-faint));
}
.sd-banner-orb[data-tone="ok"] { background: rgb(var(--ui-ok)); animation: sd-pulse 2.4s ease-in-out infinite; }
.sd-banner-orb[data-tone="warn"] { background: rgb(var(--ui-warn)); }
.sd-banner-orb[data-tone="error"] { background: rgb(var(--ui-danger)); animation: sd-pulse 2.4s ease-in-out infinite; }
@keyframes sd-pulse {
  0%, 100% { box-shadow: 0 0 0 0 currentColor; }
  50% { box-shadow: 0 0 0 6px rgb(var(--ui-bg) / 0); }
}
.sd-banner-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 280px; }
.sd-banner-head { font-size: var(--ui-text-md); }
.sd-banner-sub { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.sd-banner-cta { display: flex; gap: var(--ui-space-2); flex-shrink: 0; }

/* ---- KPIs (KpiCard) ---- */
.sd-kpis {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* ---- Split: StatusDonut + QueueDepthGauge ---- */
.sd-split {
  display: grid;
  grid-template-columns: 1fr 1.1fr;
  gap: var(--ui-space-4);
  align-items: start;
}

/* ---- StatusDonut ---- */
.sd-donut-wrap {
  display: flex;
  align-items: center;
  gap: var(--ui-space-6);
  flex-wrap: wrap;
}
.sd-donut {
  position: relative;
  width: 168px;
  height: 168px;
  flex-shrink: 0;
}
.sd-donut-svg { width: 100%; height: 100%; transform: rotate(0deg); }
.sd-donut-base {
  fill: none;
  stroke: rgb(var(--ui-surface-2));
  stroke-width: 4;
}
.sd-donut-seg {
  fill: none;
  stroke-width: 4;
  stroke-linecap: butt;
  transition: stroke-dasharray .5s ease;
}
/* Cor do segmento via data-tone → stroke token (CSP-safe; geometria via atributos stroke-dasharray/offset). */
.sd-donut-seg[data-tone="success"] { stroke: rgb(var(--ui-ok)); }
.sd-donut-seg[data-tone="warning"] { stroke: rgb(var(--ui-warn)); }
.sd-donut-seg[data-tone="error"] { stroke: rgb(var(--ui-danger)); }
.sd-donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  pointer-events: none;
}
.sd-donut-num { font-family: var(--ui-font-display); font-size: 2rem; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
.sd-donut-cap { font-size: var(--ui-text-xs); }

.sd-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); flex: 1 1 180px; min-width: 160px; }
.sd-legend-row { display: grid; grid-template-columns: 14px 1fr auto auto; align-items: center; gap: var(--ui-space-2); }
.sd-legend-dot { width: 11px; height: 11px; border-radius: 3px; background: rgb(var(--ui-faint)); }
.sd-legend-dot[data-tone="success"] { background: rgb(var(--ui-ok)); }
.sd-legend-dot[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.sd-legend-dot[data-tone="error"] { background: rgb(var(--ui-danger)); }
.sd-legend-label { font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }
.sd-legend-num { font-family: var(--ui-font-display); font-weight: 700; font-variant-numeric: tabular-nums; min-width: 32px; text-align: right; }
.sd-legend-num[data-tone="error"] { color: rgb(var(--ui-danger)); }
.sd-legend-num[data-tone="warning"] { color: rgb(var(--ui-warn)); }
.sd-legend-pct { font-size: var(--ui-text-xs); min-width: 40px; text-align: right; font-variant-numeric: tabular-nums; }

/* ---- QueueDepthGauge ---- */
.sd-gauge { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.sd-gauge-row { display: grid; grid-template-columns: 128px 1fr auto; align-items: center; gap: var(--ui-space-3); }
.sd-gauge-label { display: inline-flex; align-items: center; gap: var(--ui-space-2); font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }
.sd-gauge-dot { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; background: rgb(var(--ui-faint)); }
.sd-gauge-dot[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.sd-gauge-dot[data-tone="running"] { background: rgb(var(--ui-accent)); }
.sd-gauge-dot[data-tone="success"] { background: rgb(var(--ui-ok)); }
.sd-gauge-dot[data-tone="error"] { background: rgb(var(--ui-danger)); }
.sd-gauge-track { height: 12px; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-surface-2)); overflow: hidden; }
.sd-gauge-fill { display: block; height: 100%; border-radius: var(--ui-radius-pill); width: 4px; transition: width .4s ease; }
.sd-gauge-fill[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.sd-gauge-fill[data-tone="running"] { background: rgb(var(--ui-accent)); }
.sd-gauge-fill[data-tone="success"] { background: rgb(var(--ui-ok)); }
.sd-gauge-fill[data-tone="error"] { background: rgb(var(--ui-danger)); }
.sd-gauge-fill[data-w="0"] { width: 4px; opacity: .4; }
.sd-gauge-fill[data-w="1"] { width: 10%; }
.sd-gauge-fill[data-w="2"] { width: 20%; }
.sd-gauge-fill[data-w="3"] { width: 30%; }
.sd-gauge-fill[data-w="4"] { width: 40%; }
.sd-gauge-fill[data-w="5"] { width: 50%; }
.sd-gauge-fill[data-w="6"] { width: 60%; }
.sd-gauge-fill[data-w="7"] { width: 70%; }
.sd-gauge-fill[data-w="8"] { width: 80%; }
.sd-gauge-fill[data-w="9"] { width: 90%; }
.sd-gauge-fill[data-w="10"] { width: 100%; }
.sd-gauge-num { font-family: var(--ui-font-display); font-weight: 700; min-width: 40px; text-align: right; font-variant-numeric: tabular-nums; }
.sd-gauge-num[data-tone="error"] { color: rgb(var(--ui-danger)); }
.sd-gauge-num[data-tone="warning"] { color: rgb(var(--ui-warn)); }
.sd-gauge-foot { font-size: var(--ui-text-xs); margin: var(--ui-space-1) 0 0; border-top: 1px solid rgb(var(--ui-border)); padding-top: var(--ui-space-3); }

/* ---- Rodapé de card ---- */
.sd-card-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); flex-wrap: wrap; }
.sd-foot-health { display: inline-flex; align-items: center; gap: var(--ui-space-2); font-size: var(--ui-text-sm); }
.sd-foot-orb { width: 9px; height: 9px; border-radius: 50%; background: rgb(var(--ui-muted) / 0.5); }
.sd-foot-orb[data-online="true"] { background: rgb(var(--ui-ok)); }
.sd-foot-orb[data-online="false"] { background: rgb(var(--ui-danger)); }

/* ---- RecentActivityList ---- */
.sd-activity {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: var(--ui-space-4);
  align-items: start;
}
.sd-cell-strong { font-weight: 600; }
.sd-cell-time { font-variant-numeric: tabular-nums; white-space: nowrap; }

.sd-alerts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.sd-alert-row {
  display: grid;
  grid-template-columns: 12px 1fr auto auto;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.sd-alert-row:last-child { border-bottom: none; }
.sd-alert-dot { width: 10px; height: 10px; border-radius: 50%; background: rgb(var(--ui-faint)); }
.sd-alert-dot[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.sd-alert-dot[data-tone="error"] { background: rgb(var(--ui-danger)); }
.sd-alert-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.sd-alert-name { font-weight: 600; color: rgb(var(--ui-fg)); }
.sd-alert-name:hover { color: rgb(var(--ui-accent-strong)); }
.sd-alert-meta { font-size: var(--ui-text-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 38ch; }

/* ---- Atalhos rápidos ---- */
.sd-quick { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--ui-space-4); }
.sd-quick-card {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-fg));
  text-decoration: none;
  transition: border-color .15s ease, background .15s ease, transform .15s ease;
}
.sd-quick-card:hover {
  text-decoration: none;
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06);
  transform: translateY(-1px);
}
.sd-quick-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px; height: 38px;
  border-radius: var(--ui-radius-md);
  font-weight: 700;
  flex-shrink: 0;
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-muted));
}
.sd-quick-ic[data-tone="primary"] { background: rgb(var(--ui-accent) / 0.16); color: rgb(var(--ui-accent-strong)); }
.sd-quick-ic[data-tone="running"] { background: rgb(var(--ui-accent) / 0.16); color: rgb(var(--ui-accent-strong)); }
.sd-quick-ic[data-tone="error"] { background: rgb(var(--ui-danger) / 0.16); color: rgb(var(--ui-danger)); }
.sd-quick-copy { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1 1 auto; }
.sd-quick-h { font-weight: 600; }
.sd-quick-d { font-size: var(--ui-text-xs); }
.sd-quick-arrow { color: rgb(var(--ui-muted)); font-size: var(--ui-text-lg); flex-shrink: 0; transition: transform .15s ease; }
.sd-quick-card:hover .sd-quick-arrow { transform: translateX(2px); color: rgb(var(--ui-accent-strong)); }

/* ---- Responsivo ---- */
@media (max-width: 1180px) {
  .sd-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .sd-split { grid-template-columns: 1fr; }
  .sd-activity { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .sd-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sd-quick { grid-template-columns: 1fr; }
  .sd-donut-wrap { flex-direction: column; align-items: stretch; gap: var(--ui-space-4); }
  .sd-donut { align-self: center; }
}
@media (max-width: 480px) {
  .sd-kpis { grid-template-columns: 1fr; }
  .sd-gauge-row { grid-template-columns: 104px 1fr auto; }
  .sd-alert-row { grid-template-columns: 12px 1fr auto; }
  .sd-banner-cta { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .sd-donut-seg, .sd-gauge-fill, .sd-quick-card, .sd-quick-arrow { transition: none; }
  .sd-banner-orb { animation: none; }
}
</style>
