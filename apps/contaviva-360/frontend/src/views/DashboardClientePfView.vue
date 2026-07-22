<template>
  <UiPageLayout title="Meu Painel" eyebrow="Cliente PF" subtitle="Visão consolidada do seu patrimônio e obrigações." :loading="loading" :error="error" @retry="load">
    <div class="role-metrics">
      <UiMetricCard label="Patrimônio Líquido" :value="fmt(data?.patrimonio?.total)" tone="primary" />
      <UiMetricCard label="Investimentos" :value="fmt(data?.patrimonio?.saldo_investimentos)" tone="success" />
      <UiMetricCard label="Receitas (12m)" :value="fmt(data?.receitas_despesas?.receitas)" tone="success" />
      <UiMetricCard label="Despesas (12m)" :value="fmt(data?.receitas_despesas?.despesas)" tone="error" />
    </div>

    <div class="role-grid">
      <!-- IR Progress -->
      <UiCard title="Imposto de Renda (IRPF)">
        <div class="ir-progress">
          <div class="ir-bar-wrap">
            <div class="ir-bar" :style="{ width: (data?.imposto_renda?.progresso || 0) + '%' }" :class="irBarTone"></div>
          </div>
          <div class="ir-meta">
            <span class="ir-status">{{ irStatusLabel }}</span>
            <span v-if="data?.imposto_renda?.data_vencimento" class="ir-due">
              Venc.: {{ fmtDate(data.imposto_renda.data_vencimento) }}
            </span>
          </div>
        </div>
      </UiCard>

      <!-- Receitas vs Despesas por mês -->
      <UiCard title="Receitas e Despesas (12 meses)">
        <UiDataTable :columns="rdCols" :rows="data?.receitas_despesas?.por_mes || []"
          row-key="mes" :empty="{ title: 'Sem movimentações', description: 'Nenhuma entrada nos últimos 12 meses.' }" />
      </UiCard>
    </div>

    <!-- Documentos Pendentes (interativo: AC5) -->
    <UiCard title="Documentos Pendentes" :subtitle="`${docCount} documento(s) aguardando`">
      <template #actions>
        <UiButton v-if="docCount" variant="ghost" @click="showDocs = true">Ver todos</UiButton>
      </template>
      <!-- A prévia não é clicável por linha: o clique abria a lista completa ignorando a linha
           (UX-CV360-019). Para ver/agir sobre os documentos, use "Ver todos". -->
      <UiDataTable :columns="docCols" :rows="docsPreview" row-key="id"
        :empty="{ title: 'Nenhum documento pendente', description: 'Todos os documentos estão em dia.' }" />
    </UiCard>

    <!-- Alertas de Vencimento -->
    <UiCard title="Alertas de Vencimento">
      <UiDataTable :columns="alertaCols" :rows="data?.alertas_vencimento || []" row-key="id"
        :empty="{ title: 'Sem alertas de vencimento', description: 'Nenhuma obrigação próxima do vencimento.' }"
        clickable-rows @row-click="openObrigacao" />
    </UiCard>

    <!-- Tarefas em Aberto -->
    <UiCard title="Tarefas em Aberto">
      <UiDataTable :columns="taskCols" :rows="data?.tarefas_abertas || []" row-key="id"
        :empty="{ title: 'Nenhuma tarefa pendente', description: 'Você não tem tarefas abertas.' }" />
    </UiCard>

    <!-- Modal: lista de documentos pendentes (AC5) -->
    <UiModal :open="showDocs" title="Documentos Pendentes" width="lg" @update:open="showDocs = $event">
      <UiDataTable :columns="docCols" :rows="data?.documentos_pendentes || []" row-key="id"
        :empty="{ title: 'Nenhum documento', description: '' }" />
    </UiModal>

    <!-- Modal: detalhe de obrigação + concluir (AC5) -->
    <UiModal :open="!!selectedObrigacao" title="Obrigação Fiscal" @update:open="v => { if (!v) selectedObrigacao = null; }">
      <div v-if="selectedObrigacao" class="obrig-detail">
        <div class="obrig-row"><span class="obrig-label">Tipo</span><span>{{ selectedObrigacao.tipo }}</span></div>
        <div class="obrig-row"><span class="obrig-label">Vencimento</span><span>{{ fmtDate(selectedObrigacao.data_vencimento) }}</span></div>
        <div class="obrig-row"><span class="obrig-label">Status</span><span>{{ selectedObrigacao.status }}</span></div>
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
import { dashboardRolePf, concludeObligation, dashboardEvents } from '../api.js';

const loading = ref(true), error = ref(null), data = ref(null);
const showDocs = ref(false), selectedObrigacao = ref(null), concluding = ref(false);

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

const rdCols = [
  { key: 'mes', label: 'Mês' },
  { key: 'receitas', label: 'Receitas', format: 'currency' },
  { key: 'despesas', label: 'Despesas', format: 'currency' },
];
const docCols = [
  { key: 'tipo', label: 'Tipo' },
  { key: 'mes', label: 'Mês' },
  { key: 'ano', label: 'Ano' },
  { key: 'status', label: 'Status', format: 'badge' },
];
const alertaCols = [
  { key: 'tipo', label: 'Obrigação' },
  { key: 'data_vencimento', label: 'Vencimento', format: 'date' },
  { key: 'status', label: 'Status', format: 'badge' },
  { key: 'valor_estimado', label: 'Valor est.', format: 'currency' },
];
const taskCols = [
  { key: 'title', label: 'Tarefa' },
  { key: 'priority', label: 'Prioridade', format: 'badge' },
  { key: 'due_at', label: 'Prazo', format: 'date' },
  { key: 'status', label: 'Status', format: 'badge' },
];

const docCount = computed(() => data.value?.documentos_pendentes?.length || 0);
const docsPreview = computed(() => (data.value?.documentos_pendentes || []).slice(0, 5));

const irStatusLabel = computed(() => {
  const s = data.value?.imposto_renda?.status;
  if (!s || s === 'nao_encontrado') return 'Não iniciado';
  if (s === 'pago') return 'Declaração entregue';
  if (s === 'atrasado') return 'Em atraso';
  return 'Em andamento';
});
const irBarTone = computed(() => {
  const s = data.value?.imposto_renda?.status;
  if (s === 'pago') return 'bar-ok';
  if (s === 'atrasado') return 'bar-danger';
  return 'bar-warn';
});

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
  try { data.value = await dashboardRolePf(); }
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
.role-grid { display: grid; grid-template-columns: 1fr 2fr; gap: var(--ui-space-4); margin-bottom: var(--ui-space-4); }
@media (max-width: 768px) { .role-grid { grid-template-columns: 1fr; } }
.ir-progress { display: flex; flex-direction: column; gap: var(--ui-space-3); padding: var(--ui-space-2) 0; }
.ir-bar-wrap { height: 10px; background: rgb(var(--ui-surface-2)); border-radius: var(--ui-radius); overflow: hidden; }
.ir-bar { height: 100%; border-radius: var(--ui-radius); transition: width 0.5s; }
.ir-bar.bar-ok { background: rgb(var(--ui-ok)); }
.ir-bar.bar-danger { background: rgb(var(--ui-danger)); }
.ir-bar.bar-warn { background: rgb(var(--ui-warn)); }
.ir-meta { display: flex; justify-content: space-between; font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }
.obrig-detail { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.obrig-row { display: flex; justify-content: space-between; padding: var(--ui-space-2) 0; border-bottom: 1px solid rgb(var(--ui-border)); }
.obrig-label { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
</style>
