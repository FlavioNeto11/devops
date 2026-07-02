<template>
  <UiPageLayout title="Relatórios Financeiros" subtitle="Análise por período, categoria e centro de custo." :loading="loading" :error="error" @retry="load">
    <template #actions>
      <div class="report-actions">
        <UiButton variant="ghost" @click="exportFile('csv')">Exportar CSV</UiButton>
        <UiButton variant="ghost" @click="exportFile('xlsx')">Exportar XLSX</UiButton>
        <UiButton @click="load">Gerar relatório</UiButton>
      </div>
    </template>

    <UiCard title="Filtros">
      <div class="filters">
        <UiFormField label="Período">
          <template #default>
            <select v-model="filters.period_type" class="filter-select">
              <option value="month">Mês atual</option>
              <option value="quarter">Trimestre atual</option>
              <option value="year">Ano atual</option>
              <option value="custom">Personalizado</option>
            </select>
          </template>
        </UiFormField>
        <template v-if="filters.period_type === 'custom'">
          <UiFormField label="De">
            <template #default="{ id }">
              <input :id="id" v-model="filters.period_start" type="date" />
            </template>
          </UiFormField>
          <UiFormField label="Até">
            <template #default="{ id }">
              <input :id="id" v-model="filters.period_end" type="date" />
            </template>
          </UiFormField>
        </template>
        <UiFormField label="Categoria">
          <template #default="{ id }">
            <input :id="id" v-model="filters.categoria" placeholder="Filtrar categoria" />
          </template>
        </UiFormField>
        <UiFormField label="Centro de Custo">
          <template #default="{ id }">
            <input :id="id" v-model="filters.centro_custo" placeholder="Centro de custo" />
          </template>
        </UiFormField>
      </div>
    </UiCard>

    <div v-if="data" class="report-layout">
      <div class="report-metrics">
        <UiMetricCard label="Total Receitas" :value="fmt(data.resumo.total_receitas)" tone="success" />
        <UiMetricCard label="Total Despesas" :value="fmt(data.resumo.total_despesas)" tone="error" />
        <UiMetricCard label="Saldo Líquido" :value="fmt(data.resumo.saldo_liquido)" :tone="data.resumo.saldo_liquido >= 0 ? 'primary' : 'error'" />
      </div>

      <div class="report-breakdown">
        <UiCard title="Despesas por Categoria">
          <UiDataTable :columns="catCols" :rows="catRows" row-key="categoria"
            :empty="{ title: 'Sem despesas no período' }" />
        </UiCard>
        <UiCard title="Despesas por Centro de Custo">
          <UiDataTable :columns="ccCols" :rows="ccRows" row-key="centro_custo"
            :empty="{ title: 'Sem dados de centro de custo' }" />
        </UiCard>
      </div>

      <UiCard :title="`Linhas — ${data.periodo.start} a ${data.periodo.end}`">
        <UiDataTable :columns="linhasCols" :rows="data.linhas" row-key="_idx"
          :empty="{ title: 'Nenhuma linha no período' }" />
      </UiCard>
    </div>
  </UiPageLayout>
</template>
<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { UiPageLayout, UiCard, UiMetricCard, UiDataTable, UiFormField, UiButton, useToast } from '../ui/index.js';
import { financialReport, financialReportExport } from '../api.js';

const toast = useToast();
const loading = ref(false), error = ref(null), data = ref(null);
const filters = reactive({ period_type: 'month', period_start: '', period_end: '', categoria: '', centro_custo: '' });

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);

const catRows = computed(() =>
  Object.entries(data.value?.despesas_por_categoria || {}).map(([categoria, total]) => ({ categoria, total }))
);
const ccRows = computed(() =>
  Object.entries(data.value?.despesas_por_centro_custo || {}).map(([centro_custo, total]) => ({ centro_custo, total }))
);

const catCols = [{ key: 'categoria', label: 'Categoria' }, { key: 'total', label: 'Total', format: 'currency' }];
const ccCols = [{ key: 'centro_custo', label: 'Centro de Custo' }, { key: 'total', label: 'Total', format: 'currency' }];
const linhasCols = [
  { key: 'tipo', label: 'Tipo', format: 'badge' },
  { key: 'categoria', label: 'Categoria' },
  { key: 'centro_custo', label: 'Centro Custo' },
  { key: 'status', label: 'Status', format: 'badge' },
  { key: 'total', label: 'Total', format: 'currency' },
  { key: 'count', label: 'Qtd' },
];

async function load() {
  loading.value = true; error.value = null;
  try {
    data.value = await financialReport(filters);
    if (data.value?.linhas) data.value.linhas = data.value.linhas.map((l, i) => ({ ...l, _idx: i }));
  } catch (e) { error.value = e; }
  finally { loading.value = false; }
}

async function exportFile(format) {
  try {
    const url = financialReportExport({ ...filters, format });
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-financeiro.${format}`;
    a.click();
  } catch (e) { toast.error(e.message); }
}

onMounted(load);
</script>
<style scoped>
.report-actions { display: flex; gap: var(--ui-space-2); }
.filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--ui-space-3); }
.filter-select { width: 100%; padding: var(--ui-space-1) var(--ui-space-2); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); }
.report-layout { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.report-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--ui-space-4); }
.report-breakdown { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ui-space-4); }
@media (max-width: 768px) { .report-breakdown { grid-template-columns: 1fr; } }
</style>
