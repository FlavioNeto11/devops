<template>
  <UiPageLayout
    title="Relatórios Financeiros"
    eyebrow="Análise e exportação"
    subtitle="Receitas vs. despesas por período, categoria e centro de custo."
    width="wide"
    :loading="loading"
    :error="pageError"
    @retry="applyAndLoad"
  >
    <template #actions>
      <div class="fr-actions">
        <UiButton variant="ghost" size="sm" :disabled="loading" @click="exportFile('csv')">Exportar CSV</UiButton>
        <UiButton variant="ghost" size="sm" :disabled="loading" @click="exportFile('xlsx')">Exportar XLSX</UiButton>
        <UiButton variant="subtle" size="sm" :loading="generating" @click="handleGenerateAsync">Gerar Relatório Assíncrono</UiButton>
        <UiButton size="sm" :loading="loading" @click="applyAndLoad">Atualizar</UiButton>
      </div>
    </template>

    <!-- Painel de filtros de período -->
    <UiCard title="Período e Filtros" subtitle="Selecione o intervalo e os critérios do relatório.">
      <div class="fr-filters">
        <UiFormField label="Tipo de período">
          <template #default="{ id }">
            <UiSelect :id="id" v-model="filters.period_type" @change="onPeriodTypeChange">
              <option value="month">Mês atual</option>
              <option value="quarter">Trimestre atual</option>
              <option value="year">Ano atual</option>
              <option value="custom">Intervalo personalizado</option>
            </UiSelect>
          </template>
        </UiFormField>

        <UiFormField v-if="filters.period_type === 'custom'" label="Data inicial">
          <template #default="{ id }">
            <UiInput :id="id" v-model="filters.period_start" type="date" />
          </template>
        </UiFormField>

        <UiFormField v-if="filters.period_type === 'custom'" label="Data final">
          <template #default="{ id }">
            <UiInput :id="id" v-model="filters.period_end" type="date" />
          </template>
        </UiFormField>

        <UiFormField label="Categoria">
          <template #default="{ id }">
            <UiInput :id="id" v-model="filters.categoria" type="text" placeholder="Todas as categorias" />
          </template>
        </UiFormField>

        <UiFormField label="Centro de custo">
          <template #default="{ id }">
            <UiInput :id="id" v-model="filters.centro_custo" type="text" placeholder="Todos os centros" />
          </template>
        </UiFormField>

        <div class="fr-filter-apply">
          <UiButton size="sm" @click="applyAndLoad">Aplicar</UiButton>
        </div>
      </div>
    </UiCard>

    <!-- Estado vazio inicial (antes de carregar) -->
    <template v-if="!data && !loading && !pageError">
      <UiEmptyState
        title="Nenhum relatório gerado"
        description="Selecione o período e clique em Atualizar para gerar o relatório financeiro."
        icon="chart"
      >
        <template #action>
          <UiButton @click="applyAndLoad">Gerar relatório</UiButton>
        </template>
      </UiEmptyState>
    </template>

    <!-- Conteúdo do relatório -->
    <template v-if="data">
      <!-- Banner de período -->
      <div class="fr-period-banner" role="status" aria-live="polite">
        <span class="fr-period-label">Período analisado:</span>
        <span class="fr-period-range">{{ formatDate(data.periodo?.start) }} — {{ formatDate(data.periodo?.end) }}</span>
        <span v-if="data.periodo?.label" class="fr-period-tag">{{ data.periodo.label }}</span>
      </div>

      <!-- KPI Cards: resumo receitas vs despesas -->
      <div class="fr-kpi-grid" role="region" aria-label="Resumo financeiro do período">
        <UiMetricCard
          label="Total de Receitas"
          :value="fmtCurrency(data.resumo?.total_receitas)"
          tone="success"
          :trend="data.resumo?.variacao_receitas ?? null"
          hint="Entradas confirmadas no período"
        />
        <UiMetricCard
          label="Total de Despesas"
          :value="fmtCurrency(data.resumo?.total_despesas)"
          tone="error"
          :trend="data.resumo?.variacao_despesas ?? null"
          hint="Saídas confirmadas no período"
        />
        <UiMetricCard
          label="Saldo Líquido"
          :value="fmtCurrency(data.resumo?.saldo_liquido)"
          :tone="(data.resumo?.saldo_liquido ?? 0) >= 0 ? 'success' : 'error'"
          hint="Receitas menos despesas"
        />
        <UiMetricCard
          label="Margem Operacional"
          :value="fmtPercent(data.resumo?.margem_operacional)"
          :tone="(data.resumo?.margem_operacional ?? 0) >= 0 ? 'primary' : 'warning'"
          hint="Saldo / total de receitas"
        />
      </div>

      <!-- Gráfico de barras: despesas por categoria (CSS nativo, CSP-safe) -->
      <UiCard title="Despesas por Categoria" subtitle="Distribuição proporcional das saídas no período.">
        <template #actions>
          <UiStatusBadge
            :label="catRows.length + ' categorias'"
            tone="neutral"
          />
        </template>

        <div v-if="catRows.length === 0" class="fr-chart-empty">
          <UiEmptyState title="Sem despesas no período" description="Nenhuma saída registrada para os filtros selecionados." />
        </div>
        <div v-else class="fr-bar-chart" role="img" aria-label="Gráfico de barras de despesas por categoria">
          <div
            v-for="item in catRows"
            :key="item.categoria"
            class="fr-bar-row"
          >
            <span class="fr-bar-label" :title="item.categoria">{{ item.categoria }}</span>
            <div
              class="fr-bar-track"
              role="presentation"
              :aria-label="item.categoria + ': ' + fmtCurrency(item.total) + ' (' + fmtPercent(item.pct) + ')'"
            >
              <div
                class="fr-bar-fill"
                :data-pct="clampPct(item.pct)"
                :data-tone="barTone(item.pct)"
              />
            </div>
            <span class="fr-bar-value">{{ fmtCurrency(item.total) }}</span>
            <span class="fr-bar-pct">{{ fmtPercent(item.pct) }}</span>
            <span class="sr-only">{{ item.categoria }}: {{ fmtCurrency(item.total) }} ({{ fmtPercent(item.pct) }})</span>
          </div>
        </div>
      </UiCard>

      <!-- Grid: categoria + centro de custo -->
      <div class="fr-breakdown-grid">
        <!-- Despesas por categoria (tabela) -->
        <UiCard title="Detalhamento por Categoria">
          <UiDataTable
            :columns="catCols"
            :rows="catRows"
            row-key="categoria"
            density="compact"
            :empty="{ title: 'Sem categorias', description: 'Nenhuma despesa no período.' }"
          >
            <template #cell-total="{ value }">
              <span class="fr-money">{{ fmtCurrency(value) }}</span>
            </template>
            <template #cell-pct="{ value }">
              <span class="fr-pct-badge">{{ fmtPercent(value) }}</span>
            </template>
          </UiDataTable>
        </UiCard>

        <!-- Despesas por centro de custo (tabela) -->
        <UiCard title="Detalhamento por Centro de Custo">
          <UiDataTable
            :columns="ccCols"
            :rows="ccRows"
            row-key="centro_custo"
            density="compact"
            :empty="{ title: 'Sem centros de custo', description: 'Nenhum lançamento por centro de custo.' }"
          >
            <template #cell-total="{ value }">
              <span class="fr-money">{{ fmtCurrency(value) }}</span>
            </template>
            <template #cell-pct="{ value }">
              <span class="fr-pct-badge">{{ fmtPercent(value) }}</span>
            </template>
          </UiDataTable>
        </UiCard>
      </div>

      <!-- Tabela detalhada de linhas -->
      <UiCard :title="'Linhas do Período — ' + (data.linhas?.length ?? 0) + ' registros'" subtitle="Lançamentos individuais de receitas e despesas.">
        <template #actions>
          <div class="fr-table-actions">
            <UiFormField label="Filtrar linhas">
              <template #default="{ id }">
                <UiInput
                  :id="id"
                  v-model="linhasSearch"
                  type="search"
                  placeholder="Filtrar linhas..."
                  class="fr-search-input"
                />
              </template>
            </UiFormField>
          </div>
        </template>
        <UiDataTable
          :columns="linhasCols"
          :rows="filteredLinhas"
          row-key="_idx"
          density="compact"
          :sort="linhasSort"
          :empty="{ title: 'Nenhuma linha', description: 'Ajuste os filtros ou selecione outro período.' }"
          @update:sort="linhasSort = $event"
        >
          <template #cell-tipo="{ value }">
            <UiStatusBadge :status="value" :label="value === 'receita' ? 'Receita' : 'Despesa'" />
          </template>
          <template #cell-status="{ value }">
            <UiStatusBadge :status="value" />
          </template>
          <template #cell-total="{ value }">
            <span class="fr-money">{{ fmtCurrency(value) }}</span>
          </template>
          <template #empty-action>
            <UiButton variant="ghost" size="sm" @click="applyAndLoad">Recarregar</UiButton>
          </template>
        </UiDataTable>
      </UiCard>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import {
  UiPageLayout, UiCard, UiMetricCard, UiDataTable, UiFormField,
  UiButton, UiEmptyState, UiStatusBadge, UiInput, UiSelect, useToast,
  format,
} from '../ui/index.js';
import { financialReport, financialReportExport, financialReportGenerate } from '../api.js';

// ─── estado ───────────────────────────────────────────────────────────────────
const toast = useToast();
const loading = ref(false);
const generating = ref(false);
const pageError = ref(null);
const data = ref(null);
const linhasSearch = ref('');
const linhasSort = ref(null);

// ─── filtros ──────────────────────────────────────────────────────────────────
const filters = reactive({
  period_type: 'month',
  period_start: '',
  period_end: '',
  categoria: '',
  centro_custo: '',
});

function onPeriodTypeChange() {
  if (filters.period_type !== 'custom') {
    filters.period_start = '';
    filters.period_end = '';
  }
}

// ─── formatadores ─────────────────────────────────────────────────────────────
function fmtCurrency(v) {
  return format.formatCurrency(v);
}

function fmtPercent(v) {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(n / 100);
}

function formatDate(v) {
  return format.formatDate(v);
}

// ─── colunas ──────────────────────────────────────────────────────────────────
const catCols = [
  { key: 'categoria', label: 'Categoria', sortable: true },
  { key: 'count', label: 'Qtd', align: 'right' },
  { key: 'total', label: 'Total', align: 'right', sortable: true },
  { key: 'pct', label: '%', align: 'right' },
];

const ccCols = [
  { key: 'centro_custo', label: 'Centro de Custo', sortable: true },
  { key: 'count', label: 'Qtd', align: 'right' },
  { key: 'total', label: 'Total', align: 'right', sortable: true },
  { key: 'pct', label: '%', align: 'right' },
];

const linhasCols = [
  { key: 'tipo', label: 'Tipo' },
  { key: 'data', label: 'Data', sortable: true, format: 'date' },
  { key: 'descricao', label: 'Descrição', sortable: true },
  { key: 'categoria', label: 'Categoria', sortable: true },
  { key: 'centro_custo', label: 'Centro Custo' },
  { key: 'status', label: 'Status' },
  { key: 'total', label: 'Valor', align: 'right', sortable: true },
  { key: 'count', label: 'Qtd', align: 'right' },
];

// ─── linhas derivadas ─────────────────────────────────────────────────────────
const catRows = computed(() => {
  const raw = data.value?.despesas_por_categoria;
  if (!raw) return [];
  const totalDespesas = data.value?.resumo?.total_despesas || 1;
  return Object.entries(raw)
    .map(([categoria, valor]) => {
      const total = typeof valor === 'object' ? (valor.total ?? 0) : Number(valor);
      const count = typeof valor === 'object' ? (valor.count ?? 1) : 1;
      return { categoria, total, count, pct: (total / totalDespesas) * 100 };
    })
    .sort((a, b) => b.total - a.total);
});

const ccRows = computed(() => {
  const raw = data.value?.despesas_por_centro_custo;
  if (!raw) return [];
  const totalDespesas = data.value?.resumo?.total_despesas || 1;
  return Object.entries(raw)
    .map(([centro_custo, valor]) => {
      const total = typeof valor === 'object' ? (valor.total ?? 0) : Number(valor);
      const count = typeof valor === 'object' ? (valor.count ?? 1) : 1;
      return { centro_custo, total, count, pct: (total / totalDespesas) * 100 };
    })
    .sort((a, b) => b.total - a.total);
});

const filteredLinhas = computed(() => {
  const linhas = (data.value?.linhas || []).map((l, i) => ({ ...l, _idx: i }));
  const q = linhasSearch.value.trim().toLowerCase();
  if (!q) return linhas;
  return linhas.filter(
    (l) =>
      (l.descricao && l.descricao.toLowerCase().includes(q)) ||
      (l.categoria && l.categoria.toLowerCase().includes(q)) ||
      (l.centro_custo && l.centro_custo.toLowerCase().includes(q)) ||
      (l.tipo && l.tipo.toLowerCase().includes(q))
  );
});

// ─── tom das barras ───────────────────────────────────────────────────────────
function barTone(pct) {
  if (pct >= 50) return 'high';
  if (pct >= 25) return 'mid';
  return 'low';
}

// Garante que data-pct seja sempre inteiro no intervalo [0, 100]
function clampPct(pct) {
  return Math.min(100, Math.max(0, Math.round(pct)));
}

// ─── load ─────────────────────────────────────────────────────────────────────
async function applyAndLoad() {
  loading.value = true;
  pageError.value = null;
  try {
    data.value = await financialReport(filters);
  } catch (e) {
    pageError.value = e;
    toast.error('Falha ao carregar relatório: ' + (e.message || 'Erro desconhecido'));
  } finally {
    loading.value = false;
  }
}

// ─── exportação ───────────────────────────────────────────────────────────────
function exportFile(fmt) {
  try {
    const url = financialReportExport({ ...filters, format: fmt });
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relatorio-financeiro.' + fmt;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Download iniciado — ' + fmt.toUpperCase());
  } catch (e) {
    toast.error('Falha ao exportar: ' + (e.message || 'Erro desconhecido'));
  }
}

// ─── geração assíncrona (POST /v1/reports/financial/generate) ─────────────────
async function handleGenerateAsync() {
  generating.value = true;
  try {
    const payload = await financialReportGenerate({ ...filters });
    const jobId = payload.job_id || payload.id || payload.jobId || '';
    toast.success(
      jobId
        ? 'Relatório enfileirado (job ' + jobId + '). Você receberá uma notificação quando estiver pronto.'
        : 'Relatório enfileirado. Você receberá uma notificação quando estiver pronto.'
    );
  } catch (e) {
    toast.error('Falha ao enfileirar relatório: ' + (e.message || 'Erro desconhecido'));
  } finally {
    generating.value = false;
  }
}

// ─── init ─────────────────────────────────────────────────────────────────────
onMounted(applyAndLoad);
</script>

<style scoped>
/* ── sr-only (a11y) ─────────────────────────────────────────────────────────── */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ── actions header ─────────────────────────────────────────────────────────── */
.fr-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  align-items: center;
}

/* ── filtros ────────────────────────────────────────────────────────────────── */
.fr-filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-3);
  align-items: end;
}

.fr-filter-apply {
  display: flex;
  align-items: flex-end;
  padding-bottom: 1px;
}

/* ── banner de período ──────────────────────────────────────────────────────── */
.fr-period-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-4);
  background: rgb(var(--ui-accent) / 0.07);
  border-left: 3px solid rgb(var(--ui-accent));
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  flex-wrap: wrap;
}

.fr-period-label {
  color: rgb(var(--ui-muted));
  font-weight: var(--ui-font-weight-semibold, 600);
}

.fr-period-range {
  color: rgb(var(--ui-fg));
  font-weight: var(--ui-font-weight-medium, 500);
}

.fr-period-tag {
  padding: var(--ui-space-1) var(--ui-space-2);
  background: rgb(var(--ui-accent));
  color: rgb(var(--ui-on-primary));
  border-radius: var(--ui-radius-sm);
  font-size: var(--ui-text-xs);
  font-weight: var(--ui-font-weight-semibold, 600);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ── KPI grid ───────────────────────────────────────────────────────────────── */
.fr-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: var(--ui-space-4);
}

/* ── gráfico de barras ──────────────────────────────────────────────────────── */
.fr-chart-empty {
  padding: var(--ui-space-4) 0;
}

.fr-bar-chart {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) 0;
}

.fr-bar-row {
  display: grid;
  grid-template-columns: minmax(120px, 18ch) 1fr minmax(100px, 14ch) minmax(50px, 8ch);
  align-items: center;
  gap: var(--ui-space-3);
}

.fr-bar-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: var(--ui-font-weight-medium, 500);
}

.fr-bar-track {
  height: var(--ui-space-3);
  background: rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  overflow: hidden;
}

.fr-bar-fill {
  height: 100%;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-accent));
  transition: width 0.4s ease;
}

.fr-bar-fill[data-pct="0"]   { width: 1%; }
.fr-bar-fill[data-pct="1"]   { width: 1%; }
.fr-bar-fill[data-pct="2"]   { width: 2%; }
.fr-bar-fill[data-pct="3"]   { width: 3%; }
.fr-bar-fill[data-pct="4"]   { width: 4%; }
.fr-bar-fill[data-pct="5"]   { width: 5%; }
.fr-bar-fill[data-pct="6"]   { width: 6%; }
.fr-bar-fill[data-pct="7"]   { width: 7%; }
.fr-bar-fill[data-pct="8"]   { width: 8%; }
.fr-bar-fill[data-pct="9"]   { width: 9%; }
.fr-bar-fill[data-pct="10"]  { width: 10%; }
.fr-bar-fill[data-pct="11"]  { width: 11%; }
.fr-bar-fill[data-pct="12"]  { width: 12%; }
.fr-bar-fill[data-pct="13"]  { width: 13%; }
.fr-bar-fill[data-pct="14"]  { width: 14%; }
.fr-bar-fill[data-pct="15"]  { width: 15%; }
.fr-bar-fill[data-pct="16"]  { width: 16%; }
.fr-bar-fill[data-pct="17"]  { width: 17%; }
.fr-bar-fill[data-pct="18"]  { width: 18%; }
.fr-bar-fill[data-pct="19"]  { width: 19%; }
.fr-bar-fill[data-pct="20"]  { width: 20%; }
.fr-bar-fill[data-pct="21"]  { width: 21%; }
.fr-bar-fill[data-pct="22"]  { width: 22%; }
.fr-bar-fill[data-pct="23"]  { width: 23%; }
.fr-bar-fill[data-pct="24"]  { width: 24%; }
.fr-bar-fill[data-pct="25"]  { width: 25%; }
.fr-bar-fill[data-pct="26"]  { width: 26%; }
.fr-bar-fill[data-pct="27"]  { width: 27%; }
.fr-bar-fill[data-pct="28"]  { width: 28%; }
.fr-bar-fill[data-pct="29"]  { width: 29%; }
.fr-bar-fill[data-pct="30"]  { width: 30%; }
.fr-bar-fill[data-pct="31"]  { width: 31%; }
.fr-bar-fill[data-pct="32"]  { width: 32%; }
.fr-bar-fill[data-pct="33"]  { width: 33%; }
.fr-bar-fill[data-pct="34"]  { width: 34%; }
.fr-bar-fill[data-pct="35"]  { width: 35%; }
.fr-bar-fill[data-pct="36"]  { width: 36%; }
.fr-bar-fill[data-pct="37"]  { width: 37%; }
.fr-bar-fill[data-pct="38"]  { width: 38%; }
.fr-bar-fill[data-pct="39"]  { width: 39%; }
.fr-bar-fill[data-pct="40"]  { width: 40%; }
.fr-bar-fill[data-pct="41"]  { width: 41%; }
.fr-bar-fill[data-pct="42"]  { width: 42%; }
.fr-bar-fill[data-pct="43"]  { width: 43%; }
.fr-bar-fill[data-pct="44"]  { width: 44%; }
.fr-bar-fill[data-pct="45"]  { width: 45%; }
.fr-bar-fill[data-pct="46"]  { width: 46%; }
.fr-bar-fill[data-pct="47"]  { width: 47%; }
.fr-bar-fill[data-pct="48"]  { width: 48%; }
.fr-bar-fill[data-pct="49"]  { width: 49%; }
.fr-bar-fill[data-pct="50"]  { width: 50%; }
.fr-bar-fill[data-pct="51"]  { width: 51%; }
.fr-bar-fill[data-pct="52"]  { width: 52%; }
.fr-bar-fill[data-pct="53"]  { width: 53%; }
.fr-bar-fill[data-pct="54"]  { width: 54%; }
.fr-bar-fill[data-pct="55"]  { width: 55%; }
.fr-bar-fill[data-pct="56"]  { width: 56%; }
.fr-bar-fill[data-pct="57"]  { width: 57%; }
.fr-bar-fill[data-pct="58"]  { width: 58%; }
.fr-bar-fill[data-pct="59"]  { width: 59%; }
.fr-bar-fill[data-pct="60"]  { width: 60%; }
.fr-bar-fill[data-pct="61"]  { width: 61%; }
.fr-bar-fill[data-pct="62"]  { width: 62%; }
.fr-bar-fill[data-pct="63"]  { width: 63%; }
.fr-bar-fill[data-pct="64"]  { width: 64%; }
.fr-bar-fill[data-pct="65"]  { width: 65%; }
.fr-bar-fill[data-pct="66"]  { width: 66%; }
.fr-bar-fill[data-pct="67"]  { width: 67%; }
.fr-bar-fill[data-pct="68"]  { width: 68%; }
.fr-bar-fill[data-pct="69"]  { width: 69%; }
.fr-bar-fill[data-pct="70"]  { width: 70%; }
.fr-bar-fill[data-pct="71"]  { width: 71%; }
.fr-bar-fill[data-pct="72"]  { width: 72%; }
.fr-bar-fill[data-pct="73"]  { width: 73%; }
.fr-bar-fill[data-pct="74"]  { width: 74%; }
.fr-bar-fill[data-pct="75"]  { width: 75%; }
.fr-bar-fill[data-pct="76"]  { width: 76%; }
.fr-bar-fill[data-pct="77"]  { width: 77%; }
.fr-bar-fill[data-pct="78"]  { width: 78%; }
.fr-bar-fill[data-pct="79"]  { width: 79%; }
.fr-bar-fill[data-pct="80"]  { width: 80%; }
.fr-bar-fill[data-pct="81"]  { width: 81%; }
.fr-bar-fill[data-pct="82"]  { width: 82%; }
.fr-bar-fill[data-pct="83"]  { width: 83%; }
.fr-bar-fill[data-pct="84"]  { width: 84%; }
.fr-bar-fill[data-pct="85"]  { width: 85%; }
.fr-bar-fill[data-pct="86"]  { width: 86%; }
.fr-bar-fill[data-pct="87"]  { width: 87%; }
.fr-bar-fill[data-pct="88"]  { width: 88%; }
.fr-bar-fill[data-pct="89"]  { width: 89%; }
.fr-bar-fill[data-pct="90"]  { width: 90%; }
.fr-bar-fill[data-pct="91"]  { width: 91%; }
.fr-bar-fill[data-pct="92"]  { width: 92%; }
.fr-bar-fill[data-pct="93"]  { width: 93%; }
.fr-bar-fill[data-pct="94"]  { width: 94%; }
.fr-bar-fill[data-pct="95"]  { width: 95%; }
.fr-bar-fill[data-pct="96"]  { width: 96%; }
.fr-bar-fill[data-pct="97"]  { width: 97%; }
.fr-bar-fill[data-pct="98"]  { width: 98%; }
.fr-bar-fill[data-pct="99"]  { width: 99%; }
.fr-bar-fill[data-pct="100"] { width: 100%; }

/* tons de barra */
.fr-bar-fill[data-tone="high"] { background: rgb(var(--ui-danger)); }
.fr-bar-fill[data-tone="mid"]  { background: rgb(var(--ui-warn)); }
.fr-bar-fill[data-tone="low"]  { background: rgb(var(--ui-ok)); }

.fr-bar-value {
  font-size: var(--ui-text-sm);
  font-weight: var(--ui-font-weight-semibold, 600);
  color: rgb(var(--ui-fg));
  text-align: right;
}

.fr-bar-pct {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  text-align: right;
}

/* ── grid breakdown (cat + cc) ──────────────────────────────────────────────── */
.fr-breakdown-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-4);
}

/* ── table actions (search inline) ─────────────────────────────────────────── */
.fr-table-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.fr-search-input {
  max-width: 220px;
}

/* ── células especiais ──────────────────────────────────────────────────────── */
.fr-money {
  font-family: var(--ui-font-display, monospace);
  font-variant-numeric: tabular-nums;
  font-size: var(--ui-text-sm);
}

.fr-pct-badge {
  display: inline-block;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface-2));
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-weight: var(--ui-font-weight-semibold, 600);
}

/* ── responsivo ─────────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .fr-breakdown-grid {
    grid-template-columns: 1fr;
  }

  .fr-bar-row {
    grid-template-columns: minmax(90px, 14ch) 1fr minmax(80px, 12ch) minmax(44px, 7ch);
  }

  .fr-kpi-grid {
    grid-template-columns: 1fr 1fr;
  }

  .fr-filters {
    grid-template-columns: 1fr 1fr;
  }

  .fr-actions {
    gap: var(--ui-space-1);
  }
}

@media (max-width: 480px) {
  .fr-kpi-grid {
    grid-template-columns: 1fr;
  }

  .fr-bar-row {
    grid-template-columns: minmax(70px, 10ch) 1fr minmax(70px, 10ch);
  }

  .fr-bar-pct {
    display: none;
  }

  .fr-filters {
    grid-template-columns: 1fr;
  }
}
</style>
