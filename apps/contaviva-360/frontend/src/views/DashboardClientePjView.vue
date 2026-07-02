<template>
  <UiPageLayout title="Painel Empresarial" eyebrow="Cliente PJ" subtitle="Visão operacional e financeira da empresa." :loading="loading" :error="error" @retry="load">
    <div class="role-metrics">
      <UiMetricCard label="Receitas" :value="fmt(data?.receitas_despesas?.receitas)" tone="success" />
      <UiMetricCard label="Despesas" :value="fmt(data?.receitas_despesas?.despesas)" tone="error" />
      <UiMetricCard label="Saldo" :value="fmt(data?.receitas_despesas?.saldo)" :tone="(data?.receitas_despesas?.saldo ?? 0) >= 0 ? 'primary' : 'error'" />
      <UiMetricCard label="Empresas" :value="data?.pj_count ?? 0" tone="neutral" />
    </div>

    <div class="role-grid-3">
      <UiMetricCard label="Contas a Pagar" :value="fmt(data?.contas_pagar?.total)" tone="error" :hint="`${data?.contas_pagar?.count ?? 0} pendente(s)`" />
      <UiMetricCard label="Contas a Receber" :value="fmt(data?.contas_receber?.total)" tone="success" :hint="`${data?.contas_receber?.count ?? 0} pendente(s)`" />
      <UiMetricCard label="NFs emitidas (mês)" :value="data?.notas_fiscais_mes?.count ?? 0" tone="primary" :hint="fmt(data?.notas_fiscais_mes?.total)" />
    </div>

    <div class="role-grid-2">
      <!-- Impostos estimado vs realizado -->
      <UiCard title="Impostos">
        <div class="imposto-row">
          <div class="imposto-item">
            <span class="imposto-label">Estimado</span>
            <span class="imposto-value">{{ fmt(data?.impostos?.estimado) }}</span>
          </div>
          <div class="imposto-item">
            <span class="imposto-label">Realizado</span>
            <span class="imposto-value ok">{{ fmt(data?.impostos?.realizado) }}</span>
          </div>
        </div>
        <div class="imposto-bar-wrap">
          <div class="imposto-bar" :style="{ width: impostoPercent + '%' }"></div>
        </div>
        <p class="imposto-hint">{{ impostoPercent }}% do estimado recolhido</p>
      </UiCard>

      <!-- Folha de pagamento -->
      <UiCard title="Folha de Pagamento (mês)">
        <div class="folha-total">{{ fmt(data?.folha_pagamento?.total) }}</div>
        <p class="folha-hint">Total de encargos do mês corrente</p>
      </UiCard>
    </div>

    <!-- Fluxo de caixa 90 dias -->
    <UiCard title="Fluxo de Caixa (próximos 90 dias)">
      <UiDataTable :columns="fluxoCols" :rows="data?.fluxo_caixa_90d || []" row-key="semana"
        :empty="{ title: 'Sem projeção disponível', description: 'Cadastre receitas e despesas futuras.' }" />
    </UiCard>

    <!-- Obrigações vencidas (interativo: AC5) -->
    <UiCard title="Obrigações Vencidas" :subtitle="`${data?.obrigacoes_vencidas?.length ?? 0} em atraso`">
      <UiDataTable :columns="obrigCols" :rows="data?.obrigacoes_vencidas || []" row-key="id"
        :empty="{ title: 'Nenhuma obrigação em atraso', description: 'Todas as obrigações estão em dia.' }"
        clickable-rows @row-click="openObrigacao" />
    </UiCard>

    <!-- Obrigações próximas -->
    <UiCard title="Obrigações Próximas (30 dias)">
      <UiDataTable :columns="obrigCols" :rows="data?.obrigacoes_proximas || []" row-key="id"
        :empty="{ title: 'Nenhuma obrigação nos próximos 30 dias', description: '' }"
        clickable-rows @row-click="openObrigacao" />
    </UiCard>

    <!-- Tarefas para contador -->
    <UiCard title="Tarefas para o Contador">
      <UiDataTable :columns="taskCols" :rows="data?.tarefas_para_contador || []" row-key="id"
        :empty="{ title: 'Nenhuma tarefa para o contador', description: '' }" />
    </UiCard>

    <!-- Modal: detalhe de obrigação + concluir (AC5) -->
    <UiModal :open="!!selectedObrigacao" title="Obrigação Fiscal" @update:open="v => { if (!v) selectedObrigacao = null; }">
      <div v-if="selectedObrigacao" class="obrig-detail">
        <div class="obrig-row"><span class="obrig-label">Tipo</span><span>{{ selectedObrigacao.tipo }}</span></div>
        <div class="obrig-row"><span class="obrig-label">Vencimento</span><span>{{ fmtDate(selectedObrigacao.data_vencimento) }}</span></div>
        <div class="obrig-row"><span class="obrig-label">Status</span><span>{{ selectedObrigacao.status }}</span></div>
        <div class="obrig-row"><span class="obrig-label">Entidade</span><span>{{ selectedObrigacao.entidade_tipo }}</span></div>
        <div v-if="selectedObrigacao.valor_estimado" class="obrig-row">
          <span class="obrig-label">Valor est.</span><span>{{ fmt(selectedObrigacao.valor_estimado) }}</span>
        </div>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="selectedObrigacao = null">Fechar</UiButton>
        <UiButton v-if="selectedObrigacao?.status !== 'pago'" tone="success" :loading="concluding" @click="concludeObrig">
          Marcar como concluído
        </UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { UiPageLayout, UiCard, UiMetricCard, UiDataTable, UiButton, UiModal } from '../ui/index.js';
import { dashboardRolePj, concludeObligation, dashboardEvents } from '../api.js';

const loading = ref(true), error = ref(null), data = ref(null);
const selectedObrigacao = ref(null), concluding = ref(false);

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

const impostoPercent = computed(() => {
  const est = data.value?.impostos?.estimado || 0;
  const real = data.value?.impostos?.realizado || 0;
  if (!est) return 0;
  return Math.min(100, Math.round((real / est) * 100));
});

const fluxoCols = [
  { key: 'semana', label: 'Semana' },
  { key: 'entradas', label: 'Entradas', format: 'currency' },
  { key: 'saidas', label: 'Saídas', format: 'currency' },
  { key: 'saldo', label: 'Saldo', format: 'currency' },
];
const obrigCols = [
  { key: 'tipo', label: 'Obrigação' },
  { key: 'data_vencimento', label: 'Vencimento', format: 'date' },
  { key: 'status', label: 'Status', format: 'badge' },
  { key: 'entidade_tipo', label: 'Entidade' },
  { key: 'valor_estimado', label: 'Valor est.', format: 'currency' },
];
const taskCols = [
  { key: 'title', label: 'Tarefa' },
  { key: 'priority', label: 'Prioridade', format: 'badge' },
  { key: 'due_at', label: 'Prazo', format: 'date' },
  { key: 'status', label: 'Status', format: 'badge' },
];

function openObrigacao(row) { selectedObrigacao.value = row; }

async function concludeObrig() {
  if (!selectedObrigacao.value) return;
  concluding.value = true;
  try {
    await concludeObligation(selectedObrigacao.value.id);
    selectedObrigacao.value = null;
    await load();
  } catch {}
  finally { concluding.value = false; }
}

async function load() {
  loading.value = true; error.value = null;
  try { data.value = await dashboardRolePj(); }
  catch (e) { error.value = e; }
  finally { loading.value = false; }
}

let stopEvents;
onMounted(() => {
  load();
  stopEvents = dashboardEvents((ev) => {
    if (['task_assigned', 'document_sent', 'obligation_update', 'approval'].includes(ev.type)) load();
  });
});
onUnmounted(() => { if (stopEvents) stopEvents(); });
</script>

<style scoped>
.role-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--ui-space-4); margin-bottom: var(--ui-space-4); }
.role-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--ui-space-4); margin-bottom: var(--ui-space-4); }
.role-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ui-space-4); margin-bottom: var(--ui-space-4); }
@media (max-width: 768px) { .role-grid-3, .role-grid-2 { grid-template-columns: 1fr; } }
.imposto-row { display: flex; gap: var(--ui-space-6); margin-bottom: var(--ui-space-3); }
.imposto-item { display: flex; flex-direction: column; gap: var(--ui-space-1); }
.imposto-label { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.imposto-value { font-size: var(--ui-text-lg); font-weight: 600; }
.imposto-value.ok { color: rgb(var(--ui-ok)); }
.imposto-bar-wrap { height: 8px; background: rgb(var(--ui-surface-2)); border-radius: var(--ui-radius); overflow: hidden; margin-bottom: var(--ui-space-2); }
.imposto-bar { height: 100%; background: rgb(var(--ui-ok)); border-radius: var(--ui-radius); transition: width 0.5s; }
.imposto-hint { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); margin: 0; }
.folha-total { font-size: var(--ui-text-2xl); font-weight: 700; color: rgb(var(--ui-fg)); margin-bottom: var(--ui-space-1); }
.folha-hint { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); margin: 0; }
.obrig-detail { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.obrig-row { display: flex; justify-content: space-between; padding: var(--ui-space-2) 0; border-bottom: 1px solid rgb(var(--ui-border)); }
.obrig-label { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
</style>
