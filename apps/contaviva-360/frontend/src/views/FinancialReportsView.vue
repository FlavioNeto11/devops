<template>
  <UiPageLayout title="Relatórios Financeiros" subtitle="Análise por período, categoria e centro de custo." :loading="loading" :error="error" @retry="load">
    <template #actions>
      <div class="report-actions">
        <UiButton variant="ghost" :loading="exportingFmt === 'csv'" :disabled="!!exportingFmt" @click="exportFile('csv')">Exportar CSV</UiButton>
        <UiButton variant="ghost" :loading="exportingFmt === 'xlsx'" :disabled="!!exportingFmt" @click="exportFile('xlsx')">Exportar XLSX</UiButton>
        <UiButton @click="load">Gerar relatório</UiButton>
      </div>
    </template>

    <UiCard title="Filtros">
      <div class="filters">
        <UiFormField label="Período">
          <template #default>
            <select v-model="filters.period_type">
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
const exportingFmt = ref(''); // '' | 'csv' | 'xlsx' — trava o duplo-clique e sinaliza qual botão gera
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
  if (exportingFmt.value) return; // anti-duplo-submit
  exportingFmt.value = format;
  try {
    const res = await fetch(financialReportExport({ ...filters, format }));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    // Só baixa depois de confirmar que a resposta é o arquivo (não um JSON de erro).
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `relatorio-financeiro.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
    toast.success('Relatório exportado (' + format.toUpperCase() + ').');
  } catch (e) {
    toast.error('Não foi possível exportar: ' + (e.message || 'erro desconhecido') + '.');
  } finally {
    exportingFmt.value = '';
  }
}

onMounted(load);
</script>
<style scoped>
.report-actions { display: flex; gap: var(--ui-space-2); }
.filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--ui-space-3); }
/* O <select> de período é estilizado pelo UiFormField (borda/raio do kit); a antiga regra
   .filter-select referenciava tokens inexistentes (--ui-border cru, --ui-radius) — removida (UX-CV360-006). */
.report-layout { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.report-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--ui-space-4); }
.report-breakdown { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ui-space-4); }
@media (max-width: 768px) { .report-breakdown { grid-template-columns: 1fr; } }
</style>
