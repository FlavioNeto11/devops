<template>
  <UiPageLayout title="Dashboard Financeiro" subtitle="Visão consolidada do fluxo de caixa." :loading="loading" :error="error" @retry="load">
    <template #actions>
      <div class="period-filter">
        <input v-model="filters.period_start" type="date" @change="load" class="filter-input" placeholder="De" />
        <input v-model="filters.period_end" type="date" @change="load" class="filter-input" placeholder="Até" />
      </div>
    </template>

    <div v-if="data" class="fd-layout">
      <div class="fd-metrics">
        <UiMetricCard label="Total a Receber" :value="fmt(data.resumo.total_a_receber)" tone="success" />
        <UiMetricCard label="Total a Pagar" :value="fmt(data.resumo.total_a_pagar)" tone="error" />
        <UiMetricCard label="Saldo Líquido" :value="fmt(data.resumo.saldo_liquido)" :tone="data.resumo.saldo_liquido >= 0 ? 'primary' : 'error'" />
      </div>

      <div class="fd-tables">
        <UiCard title="Fluxo Mensal">
          <UiDataTable :columns="fluxoCols" :rows="data.fluxo_mensal" row-key="mes"
            :empty="{ title: 'Sem dados de fluxo', description: 'Cadastre contas a pagar/receber.' }" />
        </UiCard>

        <div class="fd-tops">
          <UiCard title="Top 5 Fornecedores (a pagar)">
            <UiDataTable :columns="topCols" :rows="data.top5_fornecedores" row-key="contraparte"
              :empty="{ title: 'Nenhum fornecedor', description: 'Sem contas a pagar pendentes.' }" />
          </UiCard>
          <UiCard title="Top 5 Clientes (a receber)">
            <UiDataTable :columns="topCols" :rows="data.top5_clientes" row-key="contraparte"
              :empty="{ title: 'Nenhum cliente', description: 'Sem contas a receber pendentes.' }" />
          </UiCard>
        </div>
      </div>
    </div>
  </UiPageLayout>
</template>
<script setup>
import { ref, reactive, onMounted } from 'vue';
import { UiPageLayout, UiCard, UiMetricCard, UiDataTable } from '../ui/index.js';
import { financialDashboard } from '../api.js';

const loading = ref(true), error = ref(null), data = ref(null);
const filters = reactive({ period_start: '', period_end: '' });

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);

const fluxoCols = [
  { key: 'mes', label: 'Mês', format: 'date' },
  { key: 'entradas', label: 'Entradas', format: 'currency' },
  { key: 'saidas', label: 'Saídas', format: 'currency' },
  { key: 'saldo', label: 'Saldo', format: 'currency' },
];

const topCols = [
  { key: 'contraparte', label: 'Nome', sortable: true },
  { key: 'total', label: 'Valor', format: 'currency' },
];

async function load() {
  loading.value = true; error.value = null;
  try { data.value = await financialDashboard(filters); }
  catch (e) { error.value = e; }
  finally { loading.value = false; }
}

onMounted(load);
</script>
<style scoped>
.period-filter { display: flex; gap: var(--ui-space-2); }
.filter-input { padding: var(--ui-space-1) var(--ui-space-2); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); font-size: var(--ui-text-sm); }
.fd-layout { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.fd-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--ui-space-4); }
.fd-tables { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.fd-tops { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ui-space-4); }
@media (max-width: 768px) { .fd-tops { grid-template-columns: 1fr; } }
</style>
