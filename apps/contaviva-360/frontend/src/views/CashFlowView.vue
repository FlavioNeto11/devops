<template>
  <UiPageLayout title="Fluxo de Caixa" subtitle="Previsão de entradas e saídas por período." :loading="loading" :error="error" @retry="load">
    <template #actions>
      <div class="horizon-selector">
        <button v-for="h in [30, 60, 90]" :key="h" :class="['horizon-btn', { active: horizon === h }]" @click="setHorizon(h)">
          {{ h }} dias
        </button>
      </div>
    </template>

    <div v-if="data" class="cf-layout">
      <div class="cf-metrics">
        <UiMetricCard label="Saldo Atual" :value="fmt(data.saldo_atual)" tone="primary" />
        <UiMetricCard label="Previsto em 30d" :value="fmt(data.resumo_saldo[30])" :tone="data.resumo_saldo[30] >= 0 ? 'success' : 'error'" />
        <UiMetricCard label="Previsto em 60d" :value="fmt(data.resumo_saldo[60])" :tone="data.resumo_saldo[60] >= 0 ? 'success' : 'error'" />
        <UiMetricCard label="Previsto em 90d" :value="fmt(data.resumo_saldo[90])" :tone="data.resumo_saldo[90] >= 0 ? 'success' : 'error'" />
      </div>

      <UiCard title="Projeção dia a dia">
        <UiDataTable :columns="diaCols" :rows="data.dias" row-key="dia"
          :empty="{ title: 'Sem lançamentos no período', description: 'Cadastre contas a pagar ou receber.' }" />
      </UiCard>
    </div>
  </UiPageLayout>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { UiPageLayout, UiCard, UiMetricCard, UiDataTable } from '../ui/index.js';
import { cashFlow } from '../api.js';

const loading = ref(true), error = ref(null), data = ref(null), horizon = ref(30);

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);

const diaCols = [
  { key: 'dia', label: 'Data', format: 'date' },
  { key: 'entradas', label: 'Entradas', format: 'currency' },
  { key: 'saidas', label: 'Saídas', format: 'currency' },
  { key: 'saldo_dia', label: 'Saldo do Dia', format: 'currency' },
  { key: 'saldo_acumulado', label: 'Saldo Acumulado', format: 'currency' },
];

async function load() {
  loading.value = true; error.value = null;
  try { data.value = await cashFlow(horizon.value); }
  catch (e) { error.value = e; }
  finally { loading.value = false; }
}

function setHorizon(h) { horizon.value = h; load(); }
onMounted(load);
</script>
<style scoped>
.horizon-selector { display: flex; gap: var(--ui-space-1); }
.horizon-btn { padding: var(--ui-space-1) var(--ui-space-3); border: 1px solid var(--ui-border); border-radius: var(--ui-radius); background: var(--ui-surface); cursor: pointer; font-size: var(--ui-text-sm); }
.horizon-btn.active { background: var(--ui-primary); color: var(--ui-on-primary); border-color: var(--ui-primary); }
.cf-layout { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.cf-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--ui-space-4); }
</style>
