<!--
  DashboardView — Painel da loja (ShopDesk)
  Visão geral: receita (hoje/mês/ano), pedidos, ticket médio, estoque crítico e fila de NF-e.

  Contrato de UI: usa SÓ o kit ui-vue, SÓ tokens --ui-*; sem style inline / :style / v-html;
  todos os estados (loading/empty/error/normal); endpoints REAIS via ../api.js
  (orders -> /v1/orders, inventory -> /v1/inventory, reorders -> POST /v1/reorders,
   healthJobs -> GET /v1/health/jobs, health -> GET /health). Ações via useForm + useConfirm + toast.

  Honestidade dos números: o backend ainda não expõe agregação canônica (ex.: /v1/orders/summary),
  então a receita é computada no cliente sobre uma AMOSTRA dos pedidos mais recentes (SAMPLE_SIZE).
  Quando a amostra satura, sinalizamos "amostra" nos hints — nunca apresentamos um teto como total.
-->
<template>
  <UiPageLayout
    eyebrow="ShopDesk"
    title="Visão geral"
    subtitle="O pulso da sua loja: receita, pedidos, estoque e fila fiscal em um só lugar."
    width="wide"
    :loading="firstLoad"
    loading-message="Carregando o painel da loja…"
    :error="fatalError"
    @retry="loadAll"
  >
    <template #actions>
      <UiButton variant="ghost" size="sm" :loading="refreshing" @click="loadAll(true)">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton to="/records" size="sm">Ver registros</UiButton>
    </template>

    <!-- Banner de saúde da API / fila -->
    <template #banner>
      <div class="dash-banner" :data-tone="apiOnline ? 'ok' : 'error'" role="status">
        <span class="dash-banner-dot" aria-hidden="true" />
        <span class="dash-banner-text">
          <strong v-if="apiOnline">API no ar.</strong>
          <strong v-else>API indisponível.</strong>
          <span v-if="apiOnline && jobsTotal > 0"> {{ jobsTotal }} {{ jobsTotal === 1 ? 'tarefa' : 'tarefas' }} na fila de processamento.</span>
          <span v-else-if="apiOnline"> Nenhuma tarefa pendente na fila.</span>
          <span v-else> Não foi possível falar com o backend — tente novamente.</span>
        </span>
        <span class="dash-banner-updated ui-muted" v-if="lastUpdatedLabel">Atualizado {{ lastUpdatedLabel }}</span>
      </div>
    </template>

    <!-- ===================== KPIs ===================== -->
    <section class="dash-kpis" aria-label="Indicadores principais">
      <UiMetricCard
        label="Receita hoje"
        :value="kpis.revenueToday"
        :loading="ordersLoading"
        tone="primary"
        :hint="ordersError ? 'Pedidos indisponíveis' : revenueHint('Pedidos pagos lançados hoje')"
      />
      <UiMetricCard
        label="Receita no mês"
        :value="kpis.revenueMonth"
        :loading="ordersLoading"
        tone="success"
        :hint="ordersError ? 'Pedidos indisponíveis' : revenueHint(monthLabel)"
      />
      <UiMetricCard
        label="Receita no ano"
        :value="kpis.revenueYear"
        :loading="ordersLoading"
        :hint="ordersError ? 'Pedidos indisponíveis' : revenueHint(yearLabel)"
      />
      <UiMetricCard
        label="Pedidos"
        :value="kpis.orderCount"
        :loading="ordersLoading"
        clickable
        :hint="ordersError ? 'Pedidos indisponíveis' : (capped ? 'Amostra recente · clique para detalhar' : 'Total no período · clique para detalhar')"
        @click="goRecords"
      />
      <UiMetricCard
        label="Ticket médio"
        :value="kpis.avgTicket"
        :loading="ordersLoading"
        hint="Receita do mês ÷ pedidos pagos do mês"
      />
      <UiMetricCard
        label="Estoque crítico"
        :value="kpis.criticalStock"
        :loading="inventoryLoading"
        :tone="kpis.criticalStockRaw > 0 ? 'warning' : 'neutral'"
        :hint="inventoryError ? 'Estoque indisponível' : 'SKUs abaixo do ponto de reposição'"
      />
      <UiMetricCard
        label="Fila de NF-e"
        :value="kpis.invoiceQueue"
        :loading="jobsLoading"
        :tone="jobsDlq > 0 ? 'error' : (invoiceQueueRaw > 0 ? 'running' : 'neutral')"
        :hint="jobsDlq > 0 ? (jobsDlq + ' em erro (DLQ)') : 'Notas aguardando emissão'"
      />
      <UiMetricCard
        label="Saúde da API"
        :value="apiOnline ? 'No ar' : 'Fora'"
        :tone="apiOnline ? 'success' : 'error'"
        hint="Conexão com o backend"
      />
    </section>

    <!-- ============ Vendas (sparkline) + Estoque baixo ============ -->
    <section class="dash-split">
      <UiCard title="Vendas dos últimos 14 dias" subtitle="Receita diária de pedidos pagos">
        <template #actions>
          <UiStatusBadge
            v-if="!ordersLoading && !ordersError"
            :status="salesTrendTone"
            :label="salesTrendLabel"
          />
        </template>

        <UiLoadingState v-if="ordersLoading" variant="skeleton" :skeleton-lines="4" />
        <UiErrorState
          v-else-if="ordersError"
          :message="ordersError"
          retryable
          @retry="loadOrders"
        />
        <UiEmptyState
          v-else-if="!salesSeries.length || salesMax === 0"
          icon="📈"
          title="Sem vendas no período"
          description="Quando houver pedidos pagos, o gráfico de receita aparece aqui."
        >
          <template #action><UiButton to="/orders/new" size="sm">Registrar venda</UiButton></template>
        </UiEmptyState>

        <div v-else class="dash-spark">
          <svg
            class="dash-spark-svg"
            :viewBox="'0 0 ' + SPARK_W + ' ' + SPARK_H"
            preserveAspectRatio="none"
            role="img"
            :aria-label="sparkAriaLabel"
          >
            <polyline class="dash-spark-area" :points="sparkAreaPoints" />
            <polyline class="dash-spark-line" :points="sparkLinePoints" />
            <circle
              class="dash-spark-last"
              :cx="sparkLastPoint.x"
              :cy="sparkLastPoint.y"
              r="3.5"
            />
          </svg>
          <div class="dash-spark-meta">
            <div class="dash-spark-stat">
              <span class="dash-spark-k">Total 14 dias</span>
              <span class="dash-spark-v">{{ format.formatCurrency(salesTotal) }}</span>
            </div>
            <div class="dash-spark-stat">
              <span class="dash-spark-k">Melhor dia</span>
              <span class="dash-spark-v">{{ format.formatCurrency(salesMax) }}</span>
            </div>
            <div class="dash-spark-stat">
              <span class="dash-spark-k">Média/dia</span>
              <span class="dash-spark-v">{{ format.formatCurrency(salesAvg) }}</span>
            </div>
          </div>
        </div>
      </UiCard>

      <UiCard title="Estoque baixo" subtitle="Itens no ou abaixo do ponto de reposição">
        <template #actions>
          <UiStatusBadge
            v-if="!inventoryLoading && !inventoryError"
            :status="lowStock.length ? 'baixo' : 'ok'"
            :label="lowStock.length + ' em alerta'"
          />
        </template>

        <UiLoadingState v-if="inventoryLoading" variant="skeleton" :skeleton-lines="5" />
        <UiErrorState
          v-else-if="inventoryError"
          :message="inventoryError"
          retryable
          @retry="loadInventory"
        />
        <UiEmptyState
          v-else-if="!lowStock.length"
          icon="✓"
          title="Estoque saudável"
          description="Nenhum item abaixo do ponto de reposição. Bom trabalho!"
        />
        <ul v-else class="dash-lowstock">
          <li v-for="it in lowStock" :key="it.id" class="dash-lowstock-item">
            <div class="dash-lowstock-main">
              <span class="dash-lowstock-name">{{ it.product_name || it.sku }}</span>
              <span class="dash-lowstock-sku ui-mono ui-muted">{{ it.sku }}</span>
            </div>
            <div class="dash-lowstock-qty">
              <span class="dash-lowstock-num" :data-zero="Number(it.quantity) <= 0 ? 'true' : null">
                {{ format.formatNumber(it.quantity) }}
              </span>
              <span class="dash-lowstock-of ui-muted">/ {{ format.formatNumber(it.reorder_point) }}</span>
            </div>
            <UiStatusBadge
              :status="stockStatus(it)"
              :label="Number(it.quantity) <= 0 ? 'Esgotado' : 'Baixo'"
              size="sm"
            />
            <UiButton
              size="sm"
              variant="subtle"
              :aria-label="'Repor ' + (it.product_name || it.sku)"
              @click="openReorder(it)"
            >Repor</UiButton>
          </li>
        </ul>
      </UiCard>
    </section>

    <!-- ===================== Pedidos recentes ===================== -->
    <UiCard title="Pedidos recentes" subtitle="Últimas movimentações da loja">
      <template #actions>
        <UiButton to="/records" variant="ghost" size="sm">Ver tudo</UiButton>
      </template>
      <UiDataTable
        :columns="orderColumns"
        :rows="recentOrders"
        :loading="ordersLoading"
        :error="ordersError"
        row-key="id"
        density="comfortable"
        :empty="{
          title: 'Nenhum pedido ainda',
          description: 'Os pedidos da sua loja aparecerão aqui assim que chegarem.',
          icon: '🧾',
        }"
        @retry="loadOrders"
      >
        <template #cell-code="{ row }">
          <span class="dash-ordercode ui-mono">{{ row.code || ('#' + row.id) }}</span>
        </template>
        <template #cell-customer_name="{ row }">
          <div class="dash-customer">
            <span class="dash-customer-name">{{ row.customer_name || '—' }}</span>
            <span v-if="row.customer_email" class="dash-customer-email ui-muted">{{ row.customer_email }}</span>
          </div>
        </template>
        <template #cell-total="{ value }">{{ format.formatCurrency(value) }}</template>
        <template #cell-payment_status="{ value }">
          <UiStatusBadge :status="value" size="sm" />
        </template>
        <template #cell-status="{ value }"><UiStatusBadge :status="value" /></template>
        <template #cell-created_at="{ value }">{{ format.formatDateTime(value) }}</template>
        <template #empty-action><UiButton to="/orders/new" size="sm">Registrar venda</UiButton></template>
      </UiDataTable>
    </UiCard>

    <!-- ===================== Atalhos rápidos ===================== -->
    <section class="dash-quick" aria-label="Atalhos rápidos">
      <h2 class="dash-quick-title">Atalhos</h2>
      <div class="dash-quick-grid">
        <RouterLink class="dash-quick-card" to="/orders/new">
          <span class="dash-quick-ic" aria-hidden="true">🛒</span>
          <span class="dash-quick-h">Checkout</span>
          <span class="dash-quick-d ui-muted">Registrar uma venda e cobrar o pedido</span>
        </RouterLink>
        <RouterLink class="dash-quick-card" to="/records">
          <span class="dash-quick-ic" aria-hidden="true">📋</span>
          <span class="dash-quick-h">Registros</span>
          <span class="dash-quick-d ui-muted">Acompanhar e submeter registros</span>
        </RouterLink>
        <RouterLink class="dash-quick-card" to="/assistant">
          <span class="dash-quick-ic" aria-hidden="true">🤖</span>
          <span class="dash-quick-h">Assistente</span>
          <span class="dash-quick-d ui-muted">Pedir sugestões para a IA da loja</span>
        </RouterLink>
        <button class="dash-quick-card" type="button" @click="loadAll(true)">
          <span class="dash-quick-ic" aria-hidden="true">↻</span>
          <span class="dash-quick-h">Atualizar painel</span>
          <span class="dash-quick-d ui-muted">Recarregar os indicadores agora</span>
        </button>
      </div>
    </section>

    <!-- Modal de reposição (ação real via POST /v1/reorders quando disponível) -->
    <UiModal v-model:open="reorderOpen" title="Solicitar reposição" width="sm">
      <UiFormField label="Produto">
        <template #default="{ id }">
          <input :id="id" class="dash-input" type="text" :value="reorderItem.product_name || reorderItem.sku" readonly />
        </template>
      </UiFormField>
      <UiFormField
        label="Quantidade a repor"
        required
        hint="Sugerido pelo ponto de reposição"
        :error="reorderForm.errors.qty"
      >
        <template #default="{ id, describedBy }">
          <input
            :id="id"
            class="dash-input"
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            :value="reorderForm.values.qty"
            :aria-invalid="reorderForm.errors.qty ? 'true' : null"
            :aria-describedby="describedBy"
            @input="reorderForm.setField('qty', toQty($event.target.value))"
          />
        </template>
      </UiFormField>
      <template #footer>
        <UiButton variant="ghost" @click="reorderOpen = false">Cancelar</UiButton>
        <UiButton :loading="reorderBusy" @click="confirmReorder">Solicitar</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import * as api from '../api.js';
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
  UiModal,
  UiFormField,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';

const router = useRouter();
const toast = useToast();
const askConfirm = useConfirm();

// --- Resolução dos recursos REAIS expostos por api.js -----------------------
// api.js (gerado/integrado) expõe orders/inventory (/v1/<name>), reorders (POST /v1/reorders),
// healthJobs (GET /v1/health/jobs) e health (GET /health). Quando um recurso NÃO existir, marcamos
// como AUSENTE (≠ falhou): preferimos falhar VISÍVEL a mascarar um painel quebrado com "tudo zero".
function listFn(name) {
  const r = api[name];
  if (r && typeof r.list === 'function') return r.list;
  if (typeof r === 'function') return r;
  return null;
}
const ordersList = listFn('orders');
const inventoryList = listFn('inventory');
const jobsHealthFn =
  typeof api.healthJobs === 'function'
    ? api.healthJobs
    : api.health && typeof api.health.jobs === 'function'
      ? api.health.jobs
      : null;
const healthFn = typeof api.health === 'function' ? api.health : null;
const reorderCreate =
  api.reorders && typeof api.reorders.create === 'function' ? api.reorders.create : null;

const MISSING_ORDERS = 'Recurso de pedidos indisponível nesta instalação.';
const MISSING_INVENTORY = 'Recurso de estoque indisponível nesta instalação.';

function rowsOf(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  if (res && Array.isArray(res.items)) return res.items;
  return [];
}

// --- Estado --------------------------------------------------------------
const SAMPLE_SIZE = 200; // teto da amostra de pedidos (sem endpoint de agregação canônico).
const firstLoad = ref(true);
const refreshing = ref(false);
const fatalError = ref(null);
const lastUpdated = ref(null);

const orders = ref([]);
const ordersLoading = ref(false);
const ordersError = ref(null);

const inventory = ref([]);
const inventoryLoading = ref(false);
const inventoryError = ref(null);

const jobs = ref({});
const jobsLoading = ref(false);
const apiOnline = ref(false);

// --- Carregadores (cada um isolado: falha de um não derruba os outros) ----
// Recurso AUSENTE → erro VISÍVEL (não "sem vendas" silencioso). Recurso presente que FALHA → erro.
async function loadOrders() {
  if (!ordersList) { orders.value = []; ordersError.value = MISSING_ORDERS; return; }
  ordersLoading.value = true; ordersError.value = null;
  try { orders.value = rowsOf(await ordersList({ pageSize: SAMPLE_SIZE })); }
  catch (e) { ordersError.value = e.message || 'Falha ao carregar pedidos.'; orders.value = []; }
  finally { ordersLoading.value = false; }
}

async function loadInventory() {
  if (!inventoryList) { inventory.value = []; inventoryError.value = MISSING_INVENTORY; return; }
  inventoryLoading.value = true; inventoryError.value = null;
  try { inventory.value = rowsOf(await inventoryList({ pageSize: SAMPLE_SIZE })); }
  catch (e) { inventoryError.value = e.message || 'Falha ao carregar estoque.'; inventory.value = []; }
  finally { inventoryLoading.value = false; }
}

async function loadJobs() {
  if (!jobsHealthFn) { jobs.value = {}; return; }
  jobsLoading.value = true;
  try { const r = await jobsHealthFn(); jobs.value = (r && r.jobs) || {}; }
  catch { jobs.value = {}; }
  finally { jobsLoading.value = false; }
}

async function loadHealth() {
  if (!healthFn) { apiOnline.value = false; return; }
  try { await healthFn(); apiOnline.value = true; }
  catch { apiOnline.value = false; }
}

async function loadAll(isRefresh = false) {
  if (isRefresh) refreshing.value = true;
  fatalError.value = null;
  try {
    await Promise.allSettled([loadHealth(), loadOrders(), loadInventory(), loadJobs()]);
    lastUpdated.value = new Date();
    // Erro fatal: nada dos dois domínios pôde ser carregado — seja por AUSÊNCIA do recurso,
    // seja por FALHA. (Não exigimos apiOnline=false: um recurso ausente já é estado fatal do painel.)
    if (ordersError.value && inventoryError.value) {
      fatalError.value = 'Não foi possível carregar o painel. Verifique a conexão com a API.';
    }
    if (isRefresh && !fatalError.value) toast.success('Painel atualizado.');
  } catch (e) {
    fatalError.value = e.message || 'Erro inesperado ao carregar o painel.';
    if (isRefresh) toast.error('Falha ao atualizar o painel.');
  } finally {
    firstLoad.value = false;
    refreshing.value = false;
  }
}

// --- Derivações de KPI ---------------------------------------------------
const PAID = new Set(['pago', 'aprovado', 'paid', 'approved', 'concluido', 'concluído']);
const isPaid = (o) => {
  const s = String(o.payment_status || o.status || '').toLowerCase();
  return PAID.has(s) || s.includes('pag') || s.includes('aprov');
};
// Data do pedido: SÓ created_at/updated_at reais. Sem data → null (pedido é IGNORADO nos filtros
// temporais), nunca assumimos "agora" (isso inflaria a receita do dia).
const orderDate = (o) => {
  const raw = o.created_at || o.updated_at;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};
const orderTotal = (o) => Number(o.total) || 0;

const now = new Date();
const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

// pedidos pagos COM data válida (base de toda agregação temporal).
const paidOrders = computed(() =>
  orders.value.filter((o) => isPaid(o) && orderDate(o) !== null));

// a amostra saturou? então os totais de receita são parciais (rotulados como "amostra").
const capped = computed(() => orders.value.length >= SAMPLE_SIZE);

const revenueToday = computed(() =>
  paidOrders.value.filter((o) => orderDate(o).getTime() >= startOfDay).reduce((s, o) => s + orderTotal(o), 0));
const monthPaid = computed(() =>
  paidOrders.value.filter((o) => orderDate(o).getTime() >= startOfMonth));
const revenueMonth = computed(() => monthPaid.value.reduce((s, o) => s + orderTotal(o), 0));
const revenueYear = computed(() =>
  paidOrders.value.filter((o) => orderDate(o).getTime() >= startOfYear).reduce((s, o) => s + orderTotal(o), 0));

// Ticket médio: MESMA janela (receita do mês ÷ pedidos pagos do mês) — não mistura janelas.
const avgTicketRaw = computed(() => (monthPaid.value.length ? revenueMonth.value / monthPaid.value.length : 0));

const invoiceQueueRaw = computed(() => (Number(jobs.value.queued) || 0) + (Number(jobs.value.running) || 0));
const jobsDlq = computed(() => Number(jobs.value.dlq) || 0);
const jobsTotal = computed(() => Object.values(jobs.value || {}).reduce((s, n) => s + (Number(n) || 0), 0));

const lowStock = computed(() =>
  inventory.value
    .filter((it) => {
      const q = Number(it.quantity);
      const rp = Number(it.reorder_point);
      if (!isFinite(q)) return false;
      if (isFinite(rp) && rp > 0) return q <= rp;
      return q <= 0;
    })
    .sort((a, b) => Number(a.quantity) - Number(b.quantity)));

const kpis = computed(() => ({
  revenueToday: format.formatCurrency(revenueToday.value),
  revenueMonth: format.formatCurrency(revenueMonth.value),
  revenueYear: format.formatCurrency(revenueYear.value),
  orderCount: format.formatNumber(orders.value.length),
  avgTicket: format.formatCurrency(avgTicketRaw.value),
  criticalStock: format.formatNumber(lowStock.value.length),
  criticalStockRaw: lowStock.value.length,
  invoiceQueue: format.formatNumber(invoiceQueueRaw.value),
}));

// hint honesto: quando a amostra satura, sinalizamos que o número é parcial.
function revenueHint(base) {
  return capped.value ? base + ' · amostra' : base;
}

const monthLabel = computed(() =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(now).replace(/^./, (c) => c.toUpperCase()));
const yearLabel = computed(() => 'Ano de ' + now.getFullYear());

const lastUpdatedLabel = computed(() =>
  lastUpdated.value ? new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(lastUpdated.value) : '');

// --- Sparkline (SVG puro, sem style inline) ------------------------------
const SPARK_W = 600;
const SPARK_H = 120;
const SPARK_DAYS = 14;

const salesSeries = computed(() => {
  const buckets = [];
  for (let i = SPARK_DAYS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    buckets.push({ start: d.getTime(), end: d.getTime() + 86400000, value: 0 });
  }
  for (const o of paidOrders.value) {
    const t = orderDate(o).getTime();
    const b = buckets.find((x) => t >= x.start && t < x.end);
    if (b) b.value += orderTotal(o);
  }
  return buckets.map((b) => b.value);
});

const salesMax = computed(() => Math.max(0, ...salesSeries.value));
const salesTotal = computed(() => salesSeries.value.reduce((s, v) => s + v, 0));
const salesAvg = computed(() => (salesSeries.value.length ? salesTotal.value / salesSeries.value.length : 0));

function pointsFor(series) {
  const n = series.length;
  if (n === 0) return [];
  const max = Math.max(1, salesMax.value);
  const stepX = n > 1 ? SPARK_W / (n - 1) : 0;
  const pad = 8;
  const usableH = SPARK_H - pad * 2;
  return series.map((v, i) => ({
    x: Math.round(i * stepX * 100) / 100,
    y: Math.round((SPARK_H - pad - (v / max) * usableH) * 100) / 100,
  }));
}
const sparkPoints = computed(() => pointsFor(salesSeries.value));
const sparkLinePoints = computed(() => sparkPoints.value.map((p) => p.x + ',' + p.y).join(' '));
const sparkAreaPoints = computed(() => {
  const pts = sparkPoints.value;
  if (!pts.length) return '';
  return '0,' + SPARK_H + ' ' + pts.map((p) => p.x + ',' + p.y).join(' ') + ' ' + SPARK_W + ',' + SPARK_H;
});
const sparkLastPoint = computed(() => sparkPoints.value[sparkPoints.value.length - 1] || { x: 0, y: SPARK_H });

const salesTrendTone = computed(() => {
  const s = salesSeries.value;
  if (s.length < 2) return 'neutral';
  const half = Math.floor(s.length / 2);
  const a = s.slice(0, half).reduce((x, y) => x + y, 0);
  const b = s.slice(half).reduce((x, y) => x + y, 0);
  if (b > a) return 'success';
  if (b < a) return 'warning';
  return 'neutral';
});
const salesTrendLabel = computed(() => {
  if (salesTrendTone.value === 'success') return 'Em alta';
  if (salesTrendTone.value === 'warning') return 'Em queda';
  return 'Estável';
});
// aria-label completo: total + melhor dia + média + tendência (não só o total).
const sparkAriaLabel = computed(() =>
  'Receita diária dos últimos ' + SPARK_DAYS + ' dias. '
  + 'Total ' + format.formatCurrency(salesTotal.value) + '. '
  + 'Melhor dia ' + format.formatCurrency(salesMax.value) + '. '
  + 'Média por dia ' + format.formatCurrency(salesAvg.value) + '. '
  + 'Tendência: ' + salesTrendLabel.value + '.');

// --- Tabela de pedidos recentes -----------------------------------------
const orderColumns = [
  { key: 'code', label: 'Pedido' },
  { key: 'customer_name', label: 'Cliente' },
  { key: 'total', label: 'Total', align: 'right' },
  { key: 'payment_status', label: 'Pagamento' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Criado em' },
];
// ordena por data desc; pedidos sem data válida vão para o fim (não desaparecem da lista recente).
const recentOrders = computed(() =>
  [...orders.value]
    .sort((a, b) => {
      const da = orderDate(a);
      const db = orderDate(b);
      return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    })
    .slice(0, 8));

function stockStatus(it) {
  return Number(it.quantity) <= 0 ? 'esgotado' : 'baixo';
}

// --- Navegação / ações ---------------------------------------------------
function goRecords() { router.push('/records'); }

// --- Reposição: formulário validado (useForm) + ação real via POST /v1/reorders ----
function toQty(v) {
  const n = Number(v);
  return isFinite(n) ? n : '';
}
const reorderOpen = ref(false);
const reorderBusy = ref(false);
const reorderItem = reactive({});
const reorderForm = useForm({
  initial: { qty: 1 },
  rules: {
    qty: [validators.required('Informe a quantidade'), validators.numeric(), validators.min(1, 'Mínimo de 1 unidade')],
  },
});

function openReorder(it) {
  Object.keys(reorderItem).forEach((k) => delete reorderItem[k]);
  Object.assign(reorderItem, it);
  const rp = Number(it.reorder_point);
  reorderForm.reset();
  reorderForm.setField('qty', isFinite(rp) && rp > 0 ? rp : 10);
  reorderOpen.value = true;
}

async function confirmReorder() {
  if (!reorderForm.validate()) return;
  const qty = Number(reorderForm.values.qty);
  if (!reorderCreate) {
    toast.warning('Recurso de reposição ainda não disponível nesta loja.');
    reorderOpen.value = false;
    return;
  }
  const ok = await askConfirm({
    title: 'Confirmar reposição',
    message: 'Solicitar ' + qty + ' unidade(s) de ' + (reorderItem.product_name || reorderItem.sku) + '?',
  });
  if (!ok) return;
  reorderBusy.value = true;
  try {
    await reorderCreate({
      sku: reorderItem.sku,
      product_name: reorderItem.product_name,
      quantity: qty,
      status: 'solicitada',
    });
    toast.success('Reposição solicitada para ' + reorderItem.sku + '.');
    reorderOpen.value = false;
    await loadInventory();
  } catch (e) {
    toast.error(e.message || 'Falha ao solicitar reposição.');
  } finally {
    reorderBusy.value = false;
  }
}

onMounted(() => loadAll(false));
</script>

<style scoped>
/* ---- Banner de saúde ---- */
.dash-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  font-size: var(--ui-text-sm);
}
.dash-banner[data-tone="ok"] { border-left-color: rgb(var(--ui-ok)); }
.dash-banner[data-tone="error"] { border-left-color: rgb(var(--ui-danger)); }
.dash-banner-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; background: rgb(var(--ui-faint)); }
.dash-banner[data-tone="ok"] .dash-banner-dot { background: rgb(var(--ui-ok)); }
.dash-banner[data-tone="error"] .dash-banner-dot { background: rgb(var(--ui-danger)); }
.dash-banner-text { color: rgb(var(--ui-fg)); }
.dash-banner-updated { margin-left: auto; font-size: var(--ui-text-xs); }

/* ---- KPIs ---- */
.dash-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* ---- Split: vendas + estoque ---- */
.dash-split {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: var(--ui-space-4);
  align-items: start;
}

/* ---- Sparkline ---- */
.dash-spark { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.dash-spark-svg {
  width: 100%;
  height: 140px;
  display: block;
  overflow: visible;
}
.dash-spark-area {
  fill: rgb(var(--ui-accent) / 0.12);
  stroke: none;
}
.dash-spark-line {
  fill: none;
  stroke: rgb(var(--ui-accent));
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}
.dash-spark-last {
  fill: rgb(var(--ui-accent));
  stroke: rgb(var(--ui-surface));
  stroke-width: 2;
}
.dash-spark-meta {
  display: flex;
  gap: var(--ui-space-5);
  flex-wrap: wrap;
  border-top: 1px solid rgb(var(--ui-border));
  padding-top: var(--ui-space-3);
}
.dash-spark-stat { display: flex; flex-direction: column; gap: 2px; }
.dash-spark-k { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); text-transform: uppercase; letter-spacing: .04em; }
.dash-spark-v { font-family: var(--ui-font-display); font-weight: 700; font-size: var(--ui-text-lg); }

/* ---- Lista de estoque baixo ---- */
.dash-lowstock { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.dash-lowstock-item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.dash-lowstock-item:last-child { border-bottom: none; }
.dash-lowstock-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.dash-lowstock-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dash-lowstock-sku { font-size: var(--ui-text-xs); }
.dash-lowstock-qty { display: flex; align-items: baseline; gap: 3px; flex-shrink: 0; }
.dash-lowstock-num { font-family: var(--ui-font-display); font-weight: 700; color: rgb(var(--ui-warn)); }
.dash-lowstock-num[data-zero="true"] { color: rgb(var(--ui-danger)); }
.dash-lowstock-of { font-size: var(--ui-text-xs); }

/* ---- Tabela de pedidos ---- */
.dash-ordercode { font-weight: 600; }
.dash-customer { display: flex; flex-direction: column; gap: 1px; }
.dash-customer-name { font-weight: 600; }
.dash-customer-email { font-size: var(--ui-text-xs); }

/* ---- Atalhos ---- */
.dash-quick-title { font-size: var(--ui-text-lg); margin-bottom: var(--ui-space-3); }
.dash-quick-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-4);
}
.dash-quick-card {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  text-align: left;
  padding: var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
  color: rgb(var(--ui-fg));
  cursor: pointer;
  font: inherit;
  text-decoration: none;
  transition: border-color .15s ease, transform .15s ease, box-shadow .15s ease;
}
.dash-quick-card:hover {
  border-color: rgb(var(--ui-accent));
  transform: translateY(-2px);
  box-shadow: var(--ui-shadow-md);
  text-decoration: none;
}
.dash-quick-ic { font-size: 1.5rem; }
.dash-quick-h { font-family: var(--ui-font-display); font-weight: 700; }
.dash-quick-d { font-size: var(--ui-text-sm); }

/* ---- Form do modal ---- */
.dash-input {
  width: 100%;
  font: inherit;
  padding: 8px 11px;
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
}
.dash-input:read-only { background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-muted)); }
.dash-input[aria-invalid="true"] { border-color: rgb(var(--ui-danger)); }

/* ---- Responsivo ---- */
@media (max-width: 1080px) {
  .dash-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dash-split { grid-template-columns: 1fr; }
  .dash-quick-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .dash-kpis { grid-template-columns: 1fr; }
  .dash-quick-grid { grid-template-columns: 1fr; }
  .dash-banner-updated { margin-left: 0; }
}
</style>
