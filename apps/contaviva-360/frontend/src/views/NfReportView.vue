<template>
  <UiPageLayout
    title="Relatório de Notas Fiscais"
    eyebrow="Fiscal · REQ-CONTAVIVA360-0006"
    subtitle="Resumo e detalhamento de NFs emitidas por período, série, cliente e status."
    width="wide"
    :loading="loading && !data"
    :error="pageError"
    @retry="applyAndLoad"
  >
    <template #actions>
      <div class="nfr-actions">
        <UiButton variant="ghost" size="sm" :disabled="loading" @click="exportReport">
          Exportar CSV
        </UiButton>
        <UiButton size="sm" :loading="loading" @click="applyAndLoad">
          Atualizar
        </UiButton>
      </div>
    </template>

    <!-- ── Painel de período e filtros ─────────────────────────────────────────── -->
    <UiCard title="Período e Filtros" subtitle="Defina o intervalo e os critérios do relatório de NFs.">
      <div class="nfr-filters-grid">
        <UiFormField label="Tipo de período">
          <template #default="{ id }">
            <select :id="id" v-model="filters.period_type" class="nfr-select" @change="onPeriodTypeChange">
              <option value="month">Mês atual</option>
              <option value="quarter">Trimestre atual</option>
              <option value="year">Ano atual</option>
              <option value="custom">Intervalo personalizado</option>
            </select>
          </template>
        </UiFormField>

        <UiFormField v-if="filters.period_type === 'custom'" label="Data inicial">
          <template #default="{ id }">
            <input :id="id" v-model="filters.period_start" type="date" class="nfr-input" />
          </template>
        </UiFormField>

        <UiFormField v-if="filters.period_type === 'custom'" label="Data final">
          <template #default="{ id }">
            <input :id="id" v-model="filters.period_end" type="date" class="nfr-input" />
          </template>
        </UiFormField>

        <UiFormField label="Série">
          <template #default="{ id }">
            <input :id="id" v-model="filters.serie" type="text" class="nfr-input" placeholder="Todas as séries" />
          </template>
        </UiFormField>

        <UiFormField label="Cliente NF">
          <template #default="{ id }">
            <input :id="id" v-model="filters.cliente" type="text" class="nfr-input" placeholder="Nome ou ID do cliente" />
          </template>
        </UiFormField>

        <UiFormField label="Status">
          <template #default="{ id }">
            <select :id="id" v-model="filters.status" class="nfr-select">
              <option value="">Todos</option>
              <option value="emitida">Emitida</option>
              <option value="cancelada">Cancelada</option>
              <option value="processando">Em processamento</option>
              <option value="rejeitada">Rejeitada</option>
              <option value="denegada">Denegada</option>
            </select>
          </template>
        </UiFormField>

        <div class="nfr-filter-apply">
          <UiButton size="sm" :loading="loading" @click="applyAndLoad">Aplicar</UiButton>
        </div>
      </div>
    </UiCard>

    <!-- ── Estado vazio antes do primeiro load ─────────────────────────────────── -->
    <template v-if="!data && !loading && !pageError">
      <UiEmptyState
        title="Nenhum relatório gerado"
        description="Selecione o período e clique em Atualizar para gerar o relatório de Notas Fiscais."
        icon="chart"
      >
        <template #action>
          <UiButton @click="applyAndLoad">Gerar relatório</UiButton>
        </template>
      </UiEmptyState>
    </template>

    <!-- ── Conteúdo do relatório ─────────────────────────────────────────────── -->
    <template v-if="data">
      <!-- Banner de período ─────────────────────────────────────────────────── -->
      <div class="nfr-period-banner" role="status" aria-live="polite">
        <span class="nfr-period-label">Período analisado:</span>
        <span class="nfr-period-range">{{ fmtDate(data.periodo?.start) }} — {{ fmtDate(data.periodo?.end) }}</span>
        <span v-if="data.periodo?.label" class="nfr-period-tag">{{ data.periodo.label }}</span>
        <span v-if="loading" class="nfr-period-refreshing" aria-label="Atualizando...">Atualizando…</span>
      </div>

      <!-- KPI Cards ─────────────────────────────────────────────────────────── -->
      <div class="nfr-kpi-grid" role="region" aria-label="Resumo do período de NFs">
        <UiMetricCard
          label="Total Emitido"
          :value="fmtCurrency(data.resumo?.total_emitido)"
          tone="primary"
          :hint="(data.resumo?.qtd_emitidas ?? 0) + ' notas emitidas'"
          :trend="data.resumo?.variacao_emitido ?? null"
        />
        <UiMetricCard
          label="Total de Impostos"
          :value="fmtCurrency(data.resumo?.total_impostos)"
          tone="warning"
          hint="Impostos acumulados no período"
          :trend="data.resumo?.variacao_impostos ?? null"
        />
        <UiMetricCard
          label="Canceladas"
          :value="String(data.resumo?.qtd_canceladas ?? 0)"
          tone="error"
          :hint="fmtCurrency(data.resumo?.total_canceladas)"
        />
        <UiMetricCard
          label="Em Processamento"
          :value="String(data.resumo?.qtd_processando ?? 0)"
          tone="running"
          :hint="fmtCurrency(data.resumo?.total_processando)"
        />
      </div>

      <!-- Gráfico de barras por mês ──────────────────────────────────────────── -->
      <UiCard
        title="NFs por Mês"
        subtitle="Total faturado (emitido) mês a mês no período selecionado."
      >
        <template #actions>
          <UiStatusBadge :label="monthRows.length + ' meses'" tone="neutral" />
        </template>

        <div v-if="monthRows.length === 0" class="nfr-chart-empty">
          <UiEmptyState
            title="Sem dados por mês"
            description="Nenhuma NF encontrada para o período e filtros selecionados."
          />
        </div>
        <div v-else class="nfr-bar-chart" role="img" aria-label="Gráfico de barras: NFs emitidas por mês">
          <div v-for="item in monthRows" :key="item.mes" class="nfr-bar-row">
            <span class="nfr-bar-label" :title="item.mes">{{ item.mes }}</span>
            <div class="nfr-bar-track" role="presentation">
              <div
                class="nfr-bar-fill"
                :style="{ '--bar-w': item.pct + '%' }"
                :data-tone="item.pct >= 75 ? 'high' : item.pct >= 40 ? 'mid' : 'low'"
              />
            </div>
            <span class="nfr-bar-value">{{ fmtCurrency(item.total) }}</span>
            <span class="nfr-bar-count">{{ item.qtd }} NFs</span>
          </div>
        </div>
      </UiCard>

      <!-- Tabela detalhada ───────────────────────────────────────────────────── -->
      <UiCard
        :title="'Notas Fiscais — ' + (filteredRows.length) + ' registros'"
        subtitle="Detalhamento individual por NF. Filtre por série, cliente ou status."
      >
        <template #actions>
          <div class="nfr-table-actions">
            <input
              v-model="tableSearch"
              type="search"
              class="nfr-input nfr-input-sm"
              placeholder="Buscar por NF, chave, cliente…"
              aria-label="Filtrar linhas da tabela de NFs"
            />
          </div>
        </template>

        <UiDataTable
          :columns="nfCols"
          :rows="filteredRows"
          row-key="_idx"
          density="compact"
          :sort="tableSort"
          :empty="{ title: 'Nenhuma NF encontrada', description: 'Ajuste os filtros ou selecione outro período.' }"
          @update:sort="tableSort = $event"
        >
          <template #cell-status="{ value }">
            <UiStatusBadge :status="value" />
          </template>
          <template #cell-total_nf="{ value }">
            <span class="nfr-money">{{ fmtCurrency(value) }}</span>
          </template>
          <template #cell-total_impostos="{ value }">
            <span class="nfr-money">{{ fmtCurrency(value) }}</span>
          </template>
          <template #cell-chave_acesso="{ value }">
            <span class="nfr-chave" :title="value">{{ value ? value.slice(0, 12) + '…' : '—' }}</span>
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
import { ref, reactive, computed } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiFormField,
  UiButton,
  UiEmptyState,
  UiStatusBadge,
  useToast,
  format,
} from '../ui/index.js';
import { getNfReport, getNfReportExportUrl } from '../api.js';

// ─── estado ───────────────────────────────────────────────────────────────────
const toast = useToast();
const loading = ref(false);
const pageError = ref(null);
const data = ref(null);
const tableSearch = ref('');
const tableSort = ref(null);

// ─── filtros ──────────────────────────────────────────────────────────────────
const filters = reactive({
  period_type: 'month',
  period_start: '',
  period_end: '',
  serie: '',
  cliente: '',
  status: '',
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

function fmtDate(v) {
  return format.formatDate(v);
}

// ─── colunas da tabela detalhada ──────────────────────────────────────────────
const nfCols = [
  { key: 'numero_nf', label: 'Número NF', sortable: true },
  { key: 'serie', label: 'Série' },
  { key: 'data_emissao', label: 'Emissão', sortable: true, format: 'date' },
  { key: 'cliente', label: 'Cliente', sortable: true },
  { key: 'status', label: 'Status' },
  { key: 'total_nf', label: 'Total NF', align: 'right', sortable: true },
  { key: 'total_impostos', label: 'Impostos', align: 'right', sortable: true },
  { key: 'chave_acesso', label: 'Chave SEFAZ' },
];

// ─── dados derivados: barras por mês ─────────────────────────────────────────
const monthRows = computed(() => {
  const raw = data.value?.por_mes;
  if (!raw || !Object.keys(raw).length) return [];
  const entries = Object.entries(raw).map(([mes, v]) => {
    const total = typeof v === 'object' ? (v.total ?? 0) : Number(v);
    const qtd = typeof v === 'object' ? (v.qtd ?? v.count ?? 0) : 0;
    return { mes, total, qtd };
  });
  entries.sort((a, b) => a.mes.localeCompare(b.mes));
  const maxTotal = Math.max(...entries.map((e) => e.total), 1);
  return entries.map((e) => ({
    ...e,
    pct: Math.max(1, Math.round((e.total / maxTotal) * 100)),
  }));
});

// ─── dados derivados: linhas filtradas da tabela ──────────────────────────────
const filteredRows = computed(() => {
  const linhas = (data.value?.linhas || []).map((l, i) => ({ ...l, _idx: i }));
  const q = tableSearch.value.trim().toLowerCase();
  if (!q) return linhas;
  return linhas.filter(
    (l) =>
      (l.numero_nf && String(l.numero_nf).toLowerCase().includes(q)) ||
      (l.serie && String(l.serie).toLowerCase().includes(q)) ||
      (l.cliente && String(l.cliente).toLowerCase().includes(q)) ||
      (l.chave_acesso && String(l.chave_acesso).toLowerCase().includes(q)) ||
      (l.status && String(l.status).toLowerCase().includes(q))
  );
});

// ─── load ─────────────────────────────────────────────────────────────────────
async function applyAndLoad() {
  loading.value = true;
  pageError.value = null;
  try {
    data.value = await getNfReport({ ...filters });
  } catch (e) {
    pageError.value = e.message || 'Erro ao carregar relatório de NFs';
    toast.error('Falha ao carregar relatório: ' + (e.message || 'Erro desconhecido'));
  } finally {
    loading.value = false;
  }
}

// ─── exportação ───────────────────────────────────────────────────────────────
function exportReport() {
  try {
    const url = getNfReportExportUrl({ ...filters });
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relatorio-nf.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Download iniciado — exportação de NFs');
  } catch (e) {
    toast.error('Falha ao exportar: ' + (e.message || 'Erro desconhecido'));
  }
}
</script>

<style scoped>
/* ── actions header ─────────────────────────────────────────────────────────── */
.nfr-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  align-items: center;
}

/* ── filtros ────────────────────────────────────────────────────────────────── */
.nfr-filters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-3);
  align-items: end;
}

.nfr-filter-apply {
  display: flex;
  align-items: flex-end;
}

.nfr-select,
.nfr-input {
  width: 100%;
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  font: inherit;
  font-size: var(--ui-text-sm);
}

.nfr-select:focus,
.nfr-input:focus {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 1px;
}

.nfr-input-sm {
  font-size: var(--ui-text-xs);
  padding: var(--ui-space-1-5) var(--ui-space-2);
  max-width: 260px;
}

/* ── banner de período ──────────────────────────────────────────────────────── */
.nfr-period-banner {
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

.nfr-period-label {
  color: rgb(var(--ui-muted));
  font-weight: 600;
}

.nfr-period-range {
  color: rgb(var(--ui-fg));
  font-weight: 500;
}

.nfr-period-tag {
  padding: var(--ui-space-0-5) var(--ui-space-2);
  background: rgb(var(--ui-accent));
  color: rgb(var(--ui-on-primary));
  border-radius: var(--ui-radius-sm);
  font-size: var(--ui-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.nfr-period-refreshing {
  margin-left: auto;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  font-style: italic;
}

/* ── KPI grid ───────────────────────────────────────────────────────────────── */
.nfr-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: var(--ui-space-4);
}

/* ── gráfico de barras ──────────────────────────────────────────────────────── */
.nfr-chart-empty {
  padding: var(--ui-space-4) 0;
}

.nfr-bar-chart {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) 0;
}

.nfr-bar-row {
  display: grid;
  grid-template-columns: 80px 1fr 130px 70px;
  align-items: center;
  gap: var(--ui-space-3);
}

.nfr-bar-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.nfr-bar-track {
  height: 10px;
  background: rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  overflow: hidden;
}

.nfr-bar-fill {
  height: 100%;
  width: var(--bar-w, 0%);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-accent));
  transition: width 0.4s ease;
}

/* tons de barra */
.nfr-bar-fill[data-tone="high"] { background: rgb(var(--ui-accent-strong)); }
.nfr-bar-fill[data-tone="mid"]  { background: rgb(var(--ui-accent)); }
.nfr-bar-fill[data-tone="low"]  { background: rgb(var(--ui-ok)); }

.nfr-bar-value {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.nfr-bar-count {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  text-align: right;
}

/* ── table actions ──────────────────────────────────────────────────────────── */
.nfr-table-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

/* ── células especiais ──────────────────────────────────────────────────────── */
.nfr-money {
  font-family: var(--ui-font-display, monospace);
  font-variant-numeric: tabular-nums;
  font-size: var(--ui-text-sm);
}

.nfr-chave {
  font-family: var(--ui-font-display, monospace);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  letter-spacing: 0.02em;
}

/* ── responsivo ─────────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .nfr-kpi-grid {
    grid-template-columns: 1fr 1fr;
  }

  .nfr-filters-grid {
    grid-template-columns: 1fr 1fr;
  }

  .nfr-bar-row {
    grid-template-columns: 60px 1fr 100px 60px;
  }

  .nfr-actions {
    gap: var(--ui-space-1);
  }
}

@media (max-width: 480px) {
  .nfr-kpi-grid {
    grid-template-columns: 1fr;
  }

  .nfr-filters-grid {
    grid-template-columns: 1fr;
  }

  .nfr-bar-row {
    grid-template-columns: 50px 1fr 90px;
  }

  .nfr-bar-count {
    display: none;
  }
}
</style>
