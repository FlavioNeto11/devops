<template>
  <UiPageLayout
    title="Fluxo de Caixa"
    eyebrow="Financeiro"
    subtitle="Projeção de entradas e saídas com saldo acumulado previsto vs. realizado."
    width="wide"
    :error="error ? error.message || String(error) : null"
    @retry="load"
  >
    <template #actions>
      <div class="horizon-selector" role="group" aria-label="Horizonte de visualização">
        <UiButton
          v-for="h in horizons"
          :key="h.value"
          :variant="horizon === h.value ? 'primary' : 'ghost'"
          size="sm"
          @click="setHorizon(h.value)"
        >{{ h.label }}</UiButton>
      </div>
    </template>

    <!-- Loading skeleton -->
    <div v-if="loading" class="cf-layout">
      <div class="cf-metrics">
        <div v-for="n in 4" :key="n" class="cf-metric-sk" aria-hidden="true">
          <span class="sk-line sk-label" />
          <span class="sk-line sk-value" />
          <span class="sk-line sk-hint" />
        </div>
      </div>
      <div class="cf-chart-sk" aria-hidden="true">
        <span class="sk-block" />
      </div>
      <div class="cf-table-sk" aria-hidden="true">
        <span class="sk-block sk-table" />
      </div>
    </div>

    <!-- Normal state -->
    <div v-else-if="data" class="cf-layout">

      <!-- SaldoSummaryCards -->
      <section class="cf-metrics" aria-label="Resumo de saldos">
        <UiMetricCard
          label="Saldo Atual"
          :value="fmt(data.saldo_atual)"
          tone="primary"
          :hint="todayLabel"
        />
        <UiMetricCard
          label="Saldo em 30 dias"
          :value="fmt(saldoAt(30))"
          :tone="saldoAt(30) >= 0 ? 'success' : 'error'"
          :hint="dateLabel(30)"
        />
        <UiMetricCard
          label="Saldo em 60 dias"
          :value="fmt(saldoAt(60))"
          :tone="saldoAt(60) >= 0 ? 'success' : 'error'"
          :hint="dateLabel(60)"
        />
        <UiMetricCard
          label="Saldo em 90 dias"
          :value="fmt(saldoAt(90))"
          :tone="saldoAt(90) >= 0 ? 'success' : 'error'"
          :hint="dateLabel(90)"
        />
      </section>

      <!-- CashFlowChart -->
      <UiCard title="Saldo Acumulado — Previsto vs. Realizado" :subtitle="chartSubtitle">
        <template #actions>
          <div class="chart-legend" aria-hidden="true">
            <span class="legend-dot" data-series="realizado" />
            <span class="legend-label">Realizado</span>
            <span class="legend-dot" data-series="previsto" />
            <span class="legend-label">Previsto</span>
          </div>
        </template>

        <div class="chart-wrap" role="img" :aria-label="'Gráfico de saldo acumulado para ' + horizon + ' dias'">
          <svg
            class="cf-chart"
            viewBox="0 0 800 260"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            focusable="false"
          >
            <!-- Grid lines -->
            <g class="chart-grid">
              <line v-for="tick in yTicks" :key="tick.y"
                x1="56" :y1="tick.py" x2="794" :y2="tick.py"
                class="grid-line"
              />
            </g>
            <!-- Y axis labels -->
            <g class="chart-y-labels">
              <text v-for="tick in yTicks" :key="'yl' + tick.y"
                x="52" :y="tick.py + 4"
                class="axis-label"
                text-anchor="end"
              >{{ fmtShort(tick.y) }}</text>
            </g>
            <!-- Zero baseline -->
            <line v-if="zeroY !== null"
              x1="56" :y1="zeroY" x2="794" :y2="zeroY"
              class="zero-line"
            />
            <!-- X axis labels (sampled) -->
            <g class="chart-x-labels">
              <text v-for="pt in xAxisLabels" :key="'xl' + pt.i"
                :x="pt.px" y="252"
                class="axis-label"
                text-anchor="middle"
              >{{ pt.label }}</text>
            </g>
            <!-- Area fills -->
            <path v-if="areaPathRealizado" :d="areaPathRealizado" class="area-path" data-series="realizado" />
            <path v-if="areaPathPrevisto" :d="areaPathPrevisto" class="area-path" data-series="previsto" />
            <!-- Lines -->
            <path v-if="linePathPrevisto" :d="linePathPrevisto" class="series-line" data-series="previsto" />
            <path v-if="linePathRealizado" :d="linePathRealizado" class="series-line" data-series="realizado" />
            <!-- Dots for realizado (actual data points) -->
            <g v-if="realizadoPts.length <= 60">
              <circle v-for="pt in realizadoPts" :key="'dr' + pt.i"
                :cx="pt.px" :cy="pt.py" r="3"
                class="series-dot" data-series="realizado"
              >
                <title>{{ pt.label }}: {{ fmt(pt.y) }}</title>
              </circle>
            </g>
          </svg>
        </div>
      </UiCard>

      <!-- DailyFlowTable -->
      <UiCard title="Lançamentos Diários" :subtitle="'Horizonte: ' + horizon + ' dias'">
        <UiDataTable
          :columns="diaCols"
          :rows="data.dias || []"
          row-key="dia"
          density="compact"
          :empty="{ title: 'Sem lançamentos no período', description: 'Cadastre contas a pagar ou a receber para ver o fluxo.' }"
        >
          <template #cell-entradas="{ value }">
            <span class="val-entrada">{{ fmt(value) }}</span>
          </template>
          <template #cell-saidas="{ value }">
            <span class="val-saida">{{ fmt(value) }}</span>
          </template>
          <template #cell-saldo_dia="{ value }">
            <span :data-neg="value < 0 ? 'true' : null" class="val-saldo-dia">{{ fmt(value) }}</span>
          </template>
          <template #cell-saldo_acumulado="{ value }">
            <span :data-neg="value < 0 ? 'true' : null" class="val-saldo-acum">{{ fmt(value) }}</span>
          </template>
          <template #cell-tipo="{ value }">
            <UiStatusBadge :status="value" />
          </template>
          <template #empty-action>
            <UiButton to="/accounts-receivable" variant="ghost">Ver Contas a Receber</UiButton>
          </template>
        </UiDataTable>
      </UiCard>
    </div>

    <!-- Empty state (data loaded but no days) -->
    <UiEmptyState
      v-else-if="!loading && !error"
      title="Nenhum dado para o período"
      description="Cadastre contas a pagar ou a receber para visualizar o fluxo de caixa."
    >
      <template #action>
        <UiButton to="/accounts-receivable">Cadastrar receita</UiButton>
      </template>
    </UiEmptyState>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiButton,
  UiStatusBadge,
  UiEmptyState,
} from '../ui/index.js';
import { cashFlow } from '../api.js';

// ─── Estado ───────────────────────────────────────────────────────────────────
const loading = ref(true);
const error = ref(null);
const data = ref(null);
const horizon = ref(30);

const horizons = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 60, label: '60 dias' },
  { value: 90, label: '90 dias' },
];

// ─── Formatadores ─────────────────────────────────────────────────────────────
const fmt = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);

const fmtShort = (v) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return sign + 'R$' + (abs / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return sign + 'R$' + (abs / 1_000).toFixed(0) + 'k';
  return sign + 'R$' + abs.toFixed(0);
};

const todayLabel = computed(() => {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date());
});

const dateLabel = (daysAhead) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(d);
};

const chartSubtitle = computed(() => `Últimos / próximos ${horizon.value} dias`);

// ─── Colunas da tabela ────────────────────────────────────────────────────────
const diaCols = [
  { key: 'dia', label: 'Data', format: 'date', sortable: true },
  { key: 'entradas', label: 'Entradas', align: 'right' },
  { key: 'saidas', label: 'Saídas', align: 'right' },
  { key: 'saldo_dia', label: 'Saldo do Dia', align: 'right', sortable: true },
  { key: 'saldo_acumulado', label: 'Saldo Acumulado', align: 'right', sortable: true },
];

// ─── Cálculo de saldo nos horizontes ─────────────────────────────────────────
function saldoAt(days) {
  if (!data.value) return 0;
  if (data.value.resumo_saldo && data.value.resumo_saldo[days] !== undefined) {
    return data.value.resumo_saldo[days];
  }
  // Fallback: último saldo acumulado dos dias no horizonte
  const dias = (data.value.dias || []).slice(0, days);
  if (!dias.length) return data.value.saldo_atual ?? 0;
  return dias[dias.length - 1]?.saldo_acumulado ?? data.value.saldo_atual ?? 0;
}

// ─── Construção do gráfico SVG ────────────────────────────────────────────────
const CHART_X0 = 56, CHART_X1 = 794, CHART_Y0 = 12, CHART_Y1 = 238;
const CW = CHART_X1 - CHART_X0;
const CH = CHART_Y1 - CHART_Y0;

function buildPoints(dias, key) {
  if (!dias || !dias.length) return [];
  return dias.map((d, i) => ({
    i,
    y: d[key] ?? 0,
    label: d.dia,
    px: CHART_X0 + (dias.length === 1 ? CW / 2 : (i / (dias.length - 1)) * CW),
    py: 0, // set below
  }));
}

function scaleY(pts, yMin, yRange) {
  return pts.map((p) => ({
    ...p,
    py: yRange === 0 ? CHART_Y0 + CH / 2 : CHART_Y0 + CH - ((p.y - yMin) / yRange) * CH,
  }));
}

function polylinePath(pts) {
  if (!pts.length) return '';
  return pts.map((p, i) => (i === 0 ? `M${p.px},${p.py}` : `L${p.px},${p.py}`)).join(' ');
}

function areaPath(pts, yBottom) {
  if (!pts.length) return '';
  const line = polylinePath(pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  return `${line} L${last.px},${yBottom} L${first.px},${yBottom} Z`;
}

const realizadoPts = computed(() => {
  if (!data.value?.dias?.length) return [];
  const dias = data.value.dias.filter((d) => d.tipo === 'realizado' || d.realizado === true || d.saldo_acumulado_realizado !== undefined);
  // Fallback: use all rows as realizado when no tipo field
  const source = dias.length ? dias : data.value.dias;
  return buildPoints(source, 'saldo_acumulado');
});

const previstoRaw = computed(() => {
  if (!data.value?.dias?.length) return [];
  // Se há campo saldo_acumulado_previsto, usa; senão, usa os dias marcados como previsto
  const dias = data.value.dias;
  if (dias[0]?.saldo_acumulado_previsto !== undefined) {
    return buildPoints(dias, 'saldo_acumulado_previsto');
  }
  const prev = dias.filter((d) => d.tipo === 'previsto');
  return prev.length ? buildPoints(prev, 'saldo_acumulado') : buildPoints(dias, 'saldo_acumulado');
});

const chartBounds = computed(() => {
  const allPts = [...realizadoPts.value, ...previstoRaw.value];
  if (!allPts.length) return { yMin: 0, yMax: 100, yRange: 100 };
  const ys = allPts.map((p) => p.y);
  const rawMin = Math.min(...ys);
  const rawMax = Math.max(...ys);
  const pad = Math.max(Math.abs(rawMax - rawMin) * 0.1, 100);
  return { yMin: rawMin - pad, yMax: rawMax + pad, yRange: rawMax - rawMin + 2 * pad };
});

const yTicks = computed(() => {
  const { yMin, yMax } = chartBounds.value;
  const range = yMax - yMin;
  const step = Math.pow(10, Math.floor(Math.log10(range / 4)));
  const niceStep = step * Math.round(range / (4 * step)) || step;
  const ticks = [];
  const start = Math.ceil(yMin / niceStep) * niceStep;
  for (let v = start; v <= yMax + niceStep * 0.01; v += niceStep) {
    const py = CHART_Y0 + CH - ((v - yMin) / (chartBounds.value.yRange)) * CH;
    if (py >= CHART_Y0 - 2 && py <= CHART_Y1 + 2) ticks.push({ y: v, py: Math.round(py) });
    if (ticks.length >= 6) break;
  }
  return ticks;
});

const zeroY = computed(() => {
  const { yMin, yRange } = chartBounds.value;
  if (yMin > 0 || yMin + yRange < 0) return null;
  return CHART_Y0 + CH - ((0 - yMin) / yRange) * CH;
});

const scaledRealizado = computed(() => {
  const { yMin, yRange } = chartBounds.value;
  return scaleY(realizadoPts.value, yMin, yRange);
});

const scaledPrevisto = computed(() => {
  const { yMin, yRange } = chartBounds.value;
  return scaleY(previstoRaw.value, yMin, yRange);
});

const linePathRealizado = computed(() => polylinePath(scaledRealizado.value));
const linePathPrevisto = computed(() => polylinePath(scaledPrevisto.value));

const areaPathRealizado = computed(() => areaPath(scaledRealizado.value, CHART_Y1));
const areaPathPrevisto = computed(() => areaPath(scaledPrevisto.value, CHART_Y1));

const xAxisLabels = computed(() => {
  const all = scaledRealizado.value.length ? scaledRealizado.value : scaledPrevisto.value;
  if (!all.length) return [];
  const n = all.length;
  const step = Math.max(1, Math.floor(n / 6));
  const result = [];
  for (let i = 0; i < n; i += step) {
    const pt = all[i];
    const d = new Date(pt.label);
    const label = isNaN(d.getTime())
      ? pt.label
      : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(d);
    result.push({ i, px: pt.px, label });
  }
  // always include last
  const last = all[n - 1];
  if (result[result.length - 1]?.i !== n - 1) {
    const d = new Date(last.label);
    result.push({
      i: n - 1,
      px: last.px,
      label: isNaN(d.getTime())
        ? last.label
        : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(d),
    });
  }
  return result;
});

// ─── Carga de dados ───────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await cashFlow(horizon.value);
  } catch (e) {
    error.value = e;
    data.value = null;
  } finally {
    loading.value = false;
  }
}

function setHorizon(h) {
  horizon.value = h;
  load();
}

onMounted(load);
</script>

<style scoped>
/* ── Layout principal ─────────────────────────────────────────────────────── */
.cf-layout {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}

/* ── HorizonSelector ──────────────────────────────────────────────────────── */
.horizon-selector {
  display: flex;
  gap: var(--ui-space-1);
  flex-wrap: wrap;
}

/* ── Metric cards ─────────────────────────────────────────────────────────── */
.cf-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

@media (max-width: 900px) {
  .cf-metrics { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 520px) {
  .cf-metrics { grid-template-columns: 1fr; }
}

/* ── Skeleton ─────────────────────────────────────────────────────────────── */
.cf-metric-sk {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-4) var(--ui-space-5);
}

.sk-line {
  display: block;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface-2));
  animation: cf-pulse 1.4s ease-in-out infinite;
}

.sk-label { height: 10px; width: 55%; }
.sk-value { height: 28px; width: 80%; }
.sk-hint  { height: 9px;  width: 40%; }

.cf-chart-sk,
.cf-table-sk {
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  overflow: hidden;
}

.sk-block {
  display: block;
  height: 280px;
  background: rgb(var(--ui-surface-2));
  animation: cf-pulse 1.4s ease-in-out infinite;
}

.sk-table { height: 220px; }

@keyframes cf-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.45; }
}

/* ── Legenda do gráfico ───────────────────────────────────────────────────── */
.chart-legend {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

.legend-label {
  margin-right: var(--ui-space-2);
}

.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.legend-dot[data-series="realizado"] {
  background: rgb(var(--ui-accent));
}

.legend-dot[data-series="previsto"] {
  background: rgb(var(--ui-ok));
}

/* ── Chart wrapper ────────────────────────────────────────────────────────── */
.chart-wrap {
  width: 100%;
  overflow-x: auto;
}

.cf-chart {
  width: 100%;
  min-width: 420px;
  height: 260px;
  display: block;
}

/* ── SVG grid e eixos ─────────────────────────────────────────────────────── */
.grid-line {
  stroke: rgb(var(--ui-border));
  stroke-width: 1;
}

.zero-line {
  stroke: rgb(var(--ui-muted));
  stroke-width: 1.5;
  stroke-dasharray: 4 4;
  opacity: 0.5;
}

.axis-label {
  fill: rgb(var(--ui-muted));
  font-size: 10px;
  font-family: var(--ui-font-body, sans-serif);
}

/* ── Series: previsto ─────────────────────────────────────────────────────── */
.series-line[data-series="previsto"] {
  fill: none;
  stroke: rgb(var(--ui-ok));
  stroke-width: 2;
  stroke-dasharray: 6 3;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.area-path[data-series="previsto"] {
  fill: rgb(var(--ui-ok) / 0.07);
  stroke: none;
}

/* ── Series: realizado ────────────────────────────────────────────────────── */
.series-line[data-series="realizado"] {
  fill: none;
  stroke: rgb(var(--ui-accent));
  stroke-width: 2.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.area-path[data-series="realizado"] {
  fill: rgb(var(--ui-accent) / 0.09);
  stroke: none;
}

.series-dot[data-series="realizado"] {
  fill: rgb(var(--ui-accent));
  stroke: rgb(var(--ui-surface));
  stroke-width: 2;
}

/* ── Células coloridas na tabela ──────────────────────────────────────────── */
.val-entrada {
  color: rgb(var(--ui-ok));
  font-weight: 600;
}

.val-saida {
  color: rgb(var(--ui-danger));
  font-weight: 600;
}

.val-saldo-dia {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

.val-saldo-dia[data-neg="true"] {
  color: rgb(var(--ui-danger));
}

.val-saldo-acum {
  font-weight: 700;
  font-family: var(--ui-font-display, monospace);
}

.val-saldo-acum[data-neg="true"] {
  color: rgb(var(--ui-danger));
}
</style>
