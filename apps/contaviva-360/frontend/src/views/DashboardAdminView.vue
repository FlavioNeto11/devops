<template>
  <UiPageLayout title="Painel Administrativo" eyebrow="Admin" subtitle="Visão geral de todas as entidades e saúde do sistema." :loading="loading" :error="error" @retry="load">
    <div class="role-metrics">
      <UiMetricCard label="Usuários" :value="data?.total_usuarios ?? 0" tone="primary" />
      <UiMetricCard label="Clientes PF" :value="data?.total_clientes_pf ?? 0" tone="neutral" />
      <UiMetricCard label="Clientes PJ" :value="data?.total_clientes_pj ?? 0" tone="neutral" />
      <UiMetricCard label="Total Receitas" :value="fmt(data?.total_receitas)" tone="success" />
      <UiMetricCard label="Total Despesas" :value="fmt(data?.total_despesas)" tone="error" />
      <UiMetricCard label="Jobs Falhando" :value="data?.jobs_falhando?.length ?? 0" :tone="(data?.jobs_falhando?.length ?? 0) > 0 ? 'error' : 'success'" />
    </div>

    <!-- Saúde dos componentes -->
    <UiCard title="Saúde dos Componentes">
      <div class="health-grid">
        <div v-for="(status, component) in data?.saude_componentes || {}" :key="component" class="health-item">
          <span class="health-indicator" :class="'health-' + status"></span>
          <span class="health-name">{{ component }}</span>
          <span class="health-status" :class="'status-' + status">{{ status }}</span>
        </div>
      </div>
    </UiCard>

    <!-- Alertas do sistema -->
    <UiCard v-if="data?.alertas_sistema?.length" title="Alertas do Sistema" class="alertas-card">
      <UiDataTable :columns="alertaCols" :rows="data.alertas_sistema" row-key="id"
        clickable-rows @row-click="openObrigacao" />
    </UiCard>
    <UiCard v-else title="Alertas do Sistema">
      <UiEmptyState title="Nenhum alerta" description="Sistema sem alertas ativos." />
    </UiCard>

    <!-- Jobs falhando -->
    <UiCard title="Jobs com Falha">
      <UiDataTable :columns="jobCols" :rows="data?.jobs_falhando || []" row-key="id"
        :empty="{ title: 'Nenhum job com falha', description: 'Todos os jobs estão operando normalmente.' }" />
    </UiCard>

    <!-- Modal: detalhe de obrigação + concluir (AC5) -->
    <UiModal :open="!!selectedObrigacao" title="Obrigação Fiscal" @update:open="v => { if (!v) selectedObrigacao = null; }">
      <div v-if="selectedObrigacao" class="obrig-detail">
        <div class="obrig-row"><span class="obrig-label">Tipo</span><span>{{ selectedObrigacao.tipo }}</span></div>
        <div class="obrig-row"><span class="obrig-label">Vencimento</span><span>{{ fmtDate(selectedObrigacao.data_vencimento) }}</span></div>
        <div class="obrig-row"><span class="obrig-label">Status</span><span>{{ selectedObrigacao.status }}</span></div>
        <div class="obrig-row"><span class="obrig-label">Entidade</span><span>{{ selectedObrigacao.entidade_tipo }}</span></div>
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
import { ref, onMounted, onUnmounted } from 'vue';
import { UiPageLayout, UiCard, UiMetricCard, UiDataTable, UiButton, UiModal, UiEmptyState } from '../ui/index.js';
import { dashboardRoleAdmin, dashboardEvents } from '../api.js';
import { useObligation } from '../composables/useObligation.js';

const loading = ref(true), error = ref(null), data = ref(null);
const selectedObrigacao = ref(null);
// Confirmação + feedback de erro centralizados (UX-CV360-003); fecha o modal só em sucesso.
const { concluding, conclude } = useObligation({ onDone: load });

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

const alertaCols = [
  { key: 'tipo', label: 'Obrigação' },
  { key: 'entidade_tipo', label: 'Entidade' },
  { key: 'data_vencimento', label: 'Vencimento', format: 'date' },
  { key: 'status', label: 'Status', format: 'badge' },
];
const jobCols = [
  { key: 'type', label: 'Tipo' },
  { key: 'status', label: 'Status', format: 'badge' },
  { key: 'error_message', label: 'Erro' },
  { key: 'created_at', label: 'Criado em', format: 'date' },
];

function openObrigacao(row) { selectedObrigacao.value = row; }

async function concludeObrig() {
  if (await conclude(selectedObrigacao.value)) selectedObrigacao.value = null;
}

async function load() {
  loading.value = true; error.value = null;
  try { data.value = await dashboardRoleAdmin(); }
  catch (e) { error.value = e; }
  finally { loading.value = false; }
}

let stopEvents;
onMounted(() => {
  load();
  stopEvents = dashboardEvents((ev) => {
    if (['task_assigned', 'document_sent', 'obligation_update', 'approval', 'job_failed'].includes(ev.type)) load();
  });
});
onUnmounted(() => { if (stopEvents) stopEvents(); });
</script>

<style scoped>
.role-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--ui-space-4); margin-bottom: var(--ui-space-4); }
.health-grid { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.health-item { display: flex; align-items: center; gap: var(--ui-space-3); padding: var(--ui-space-2) 0; border-bottom: 1px solid rgb(var(--ui-border)); }
.health-item:last-child { border-bottom: none; }
.health-indicator { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.health-ok { background: rgb(var(--ui-ok)); }
.health-error { background: rgb(var(--ui-danger)); }
.health-name { flex: 1; font-weight: 500; text-transform: capitalize; }
.health-status { font-size: var(--ui-text-sm); font-weight: 500; padding: 2px 10px; border-radius: var(--ui-radius-sm); }
.status-ok { background: rgb(var(--ui-ok) / 0.15); color: rgb(var(--ui-ok)); }
.status-error { background: rgb(var(--ui-danger) / 0.15); color: rgb(var(--ui-danger)); }
.alertas-card { border-left: 3px solid rgb(var(--ui-danger)); }
.obrig-detail { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.obrig-row { display: flex; justify-content: space-between; padding: var(--ui-space-2) 0; border-bottom: 1px solid rgb(var(--ui-border)); }
.obrig-label { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
</style>
