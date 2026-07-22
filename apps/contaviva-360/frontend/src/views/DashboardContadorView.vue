<template>
  <UiPageLayout title="Painel do Contador" eyebrow="Contador" subtitle="Clientes sob sua responsabilidade e alertas críticos." :loading="loading" :error="error" @retry="load">
    <div class="role-metrics">
      <UiMetricCard label="Clientes" :value="data?.clientes?.length ?? 0" tone="primary" />
      <UiMetricCard label="Tarefas Atribuídas" :value="data?.tarefas_atribuidas?.length ?? 0" tone="neutral" />
      <UiMetricCard label="Obrigações Atrasadas" :value="data?.obrigacoes_atrasadas?.length ?? 0" :tone="(data?.obrigacoes_atrasadas?.length ?? 0) > 0 ? 'error' : 'success'" />
      <UiMetricCard label="Alertas Críticos" :value="data?.alertas_criticos?.length ?? 0" :tone="(data?.alertas_criticos?.length ?? 0) > 0 ? 'error' : 'neutral'" />
    </div>

    <!-- Clientes sob responsabilidade -->
    <UiCard title="Clientes" subtitle="Clique em um cliente para ver os documentos pendentes">
      <div class="clientes-grid">
        <div
          v-for="c in data?.clientes || []"
          :key="c.tipo + c.id"
          class="cliente-card"
          :class="'status-' + c.status_fiscal"
          role="button"
          tabindex="0"
          :aria-label="'Ver documentos pendentes de ' + c.nome"
          @click="openClienteDocs(c)"
          @keydown.enter.self="openClienteDocs(c)"
          @keydown.space.self.prevent="openClienteDocs(c)"
        >
          <div class="cliente-nome">{{ c.nome }}</div>
          <div class="cliente-meta">
            <span class="cliente-tipo">{{ c.tipo }}</span>
            <span class="cliente-status" :class="'status-badge-' + c.status_fiscal">{{ statusFiscalLabel(c.status_fiscal) }}</span>
          </div>
        </div>
      </div>
      <UiEmptyState v-if="!data?.clientes?.length" title="Nenhum cliente" description="Cadastre clientes PF ou PJ para visualizar aqui." />
    </UiCard>

    <!-- Tarefas atribuídas -->
    <UiCard title="Tarefas Atribuídas">
      <UiDataTable :columns="taskCols" :rows="data?.tarefas_atribuidas || []" row-key="id"
        :empty="{ title: 'Nenhuma tarefa atribuída', description: 'Você não tem tarefas pendentes.' }" />
    </UiCard>

    <!-- Documentos pendentes (interativo: AC5) -->
    <UiCard title="Documentos Pendentes por Cliente">
      <template #actions>
        <UiButton v-if="totalDocs > 0" variant="ghost" @click="showAllDocs = true">Ver todos ({{ totalDocs }})</UiButton>
      </template>
      <div v-if="data?.documentos_por_cliente?.length" class="doc-groups">
        <div v-for="grp in docPreview" :key="grp.entity_type + grp.entity_id" class="doc-group">
          <div
            class="doc-group-header"
            role="button"
            tabindex="0"
            :aria-label="'Ver documentos de ' + grp.entity_type + ' #' + grp.entity_id"
            @click="showDocsForGroup(grp)"
            @keydown.enter.self="showDocsForGroup(grp)"
            @keydown.space.self.prevent="showDocsForGroup(grp)"
          >
            <span>{{ grp.entity_type }} #{{ grp.entity_id }}</span>
            <span class="doc-count">{{ grp.docs.length }} doc(s)</span>
          </div>
        </div>
      </div>
      <UiEmptyState v-else title="Nenhum documento pendente" description="Todos os documentos estão em dia." />
    </UiCard>

    <!-- Obrigações atrasadas dos clientes -->
    <UiCard title="Obrigações Atrasadas">
      <UiDataTable :columns="obrigCols" :rows="data?.obrigacoes_atrasadas || []" row-key="id"
        :empty="{ title: 'Nenhuma obrigação em atraso', description: 'Todos os clientes estão em dia.' }"
        clickable-rows @row-click="openObrigacao" />
    </UiCard>

    <!-- Alertas críticos -->
    <UiCard v-if="data?.alertas_criticos?.length" title="Alertas Críticos" class="alertas-card">
      <UiDataTable :columns="alertaCols" :rows="data.alertas_criticos" row-key="id" />
    </UiCard>

    <!-- Modal: documentos de um cliente (AC5) -->
    <UiModal :open="!!selectedCliente" :title="'Documentos — ' + (selectedCliente?.nome || '')" width="lg" @update:open="v => { if (!v) selectedCliente = null; }">
      <UiDataTable v-if="selectedCliente" :columns="docDetailCols" :rows="clienteDocs" row-key="id"
        :empty="{ title: 'Nenhum documento pendente', description: '' }" />
    </UiModal>

    <!-- Modal: todos os documentos pendentes (AC5) -->
    <UiModal :open="showAllDocs" title="Todos os Documentos Pendentes" width="lg" @update:open="showAllDocs = $event">
      <div v-for="grp in data?.documentos_por_cliente || []" :key="grp.entity_type + grp.entity_id" class="mb-4">
        <h3 class="doc-group-title">{{ grp.entity_type }} #{{ grp.entity_id }} ({{ grp.docs.length }})</h3>
        <UiDataTable :columns="docDetailCols" :rows="grp.docs" row-key="id"
          :empty="{ title: '', description: '' }" />
      </div>
    </UiModal>

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
import { UiPageLayout, UiCard, UiMetricCard, UiDataTable, UiButton, UiModal, UiEmptyState } from '../ui/index.js';
import { dashboardRoleContador, concludeObligation, dashboardEvents } from '../api.js';

const loading = ref(true), error = ref(null), data = ref(null);
const selectedCliente = ref(null), selectedObrigacao = ref(null), concluding = ref(false);
const showAllDocs = ref(false);

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

const totalDocs = computed(() => (data.value?.documentos_por_cliente || []).reduce((s, g) => s + g.docs.length, 0));
const docPreview = computed(() => (data.value?.documentos_por_cliente || []).slice(0, 5));

const clienteDocs = computed(() => {
  if (!selectedCliente.value) return [];
  const grp = (data.value?.documentos_por_cliente || []).find(
    g => g.entity_type === selectedCliente.value.tipo && g.entity_id === selectedCliente.value.id
  );
  return grp?.docs || [];
});

const taskCols = [
  { key: 'title', label: 'Tarefa' },
  { key: 'assignee', label: 'Responsável' },
  { key: 'priority', label: 'Prioridade', format: 'badge' },
  { key: 'due_at', label: 'Prazo', format: 'date' },
  { key: 'status', label: 'Status', format: 'badge' },
];
const obrigCols = [
  { key: 'tipo', label: 'Obrigação' },
  { key: 'data_vencimento', label: 'Vencimento', format: 'date' },
  { key: 'entidade_tipo', label: 'Tipo' },
  { key: 'status', label: 'Status', format: 'badge' },
  { key: 'valor_estimado', label: 'Valor est.', format: 'currency' },
];
const alertaCols = [
  { key: 'tipo', label: 'Obrigação' },
  { key: 'entidade_tipo', label: 'Entidade' },
  { key: 'data_vencimento', label: 'Vencimento', format: 'date' },
  { key: 'status', label: 'Status', format: 'badge' },
];
const docDetailCols = [
  { key: 'tipo', label: 'Tipo' },
  { key: 'mes', label: 'Mês' },
  { key: 'ano', label: 'Ano' },
  { key: 'status', label: 'Status', format: 'badge' },
];

function statusFiscalLabel(s) {
  if (s === 'atrasado') return 'Atrasado';
  if (s === 'pendente') return 'Pendente';
  return 'Em dia';
}

function openClienteDocs(c) { selectedCliente.value = c; }
function showDocsForGroup(grp) {
  const c = (data.value?.clientes || []).find(c => c.tipo === grp.entity_type && c.id === grp.entity_id);
  selectedCliente.value = c || { tipo: grp.entity_type, id: grp.entity_id, nome: grp.entity_type + ' #' + grp.entity_id };
}
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
  try { data.value = await dashboardRoleContador(); }
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
.clientes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--ui-space-3); }
.cliente-card { border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius); padding: var(--ui-space-3); cursor: pointer; transition: border-color 0.15s, background 0.15s; }
.cliente-card:hover { background: rgb(var(--ui-surface-2)); }
.cliente-card.status-atrasado { border-color: rgb(var(--ui-danger)); }
.cliente-card.status-pendente { border-color: rgb(var(--ui-warn)); }
.cliente-nome { font-weight: 600; margin-bottom: var(--ui-space-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cliente-meta { display: flex; justify-content: space-between; align-items: center; }
.cliente-tipo { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); background: rgb(var(--ui-surface-2)); padding: 2px 6px; border-radius: var(--ui-radius-sm); }
.cliente-status { font-size: var(--ui-text-xs); font-weight: 500; padding: 2px 8px; border-radius: var(--ui-radius-sm); }
.status-badge-atrasado { background: rgb(var(--ui-danger) / 0.15); color: rgb(var(--ui-danger)); }
.status-badge-pendente { background: rgb(var(--ui-warn) / 0.15); color: rgb(var(--ui-warn)); }
.status-badge-em_dia { background: rgb(var(--ui-ok) / 0.15); color: rgb(var(--ui-ok)); }
.doc-groups { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.doc-group-header { display: flex; justify-content: space-between; padding: var(--ui-space-2) var(--ui-space-3); background: rgb(var(--ui-surface-2)); border-radius: var(--ui-radius-sm); cursor: pointer; }
.doc-group-header:hover { background: rgb(var(--ui-border)); }
.doc-count { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }
.doc-group-title { font-weight: 600; margin: 0 0 var(--ui-space-2); }
.alertas-card { border-left: 3px solid rgb(var(--ui-danger)); }
.obrig-detail { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.obrig-row { display: flex; justify-content: space-between; padding: var(--ui-space-2) 0; border-bottom: 1px solid rgb(var(--ui-border)); }
.obrig-label { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.mb-4 { margin-bottom: var(--ui-space-4); }
</style>
