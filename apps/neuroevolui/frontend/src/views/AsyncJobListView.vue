<!--
  AsyncJobListView — Filas de Jobs (REF-NEUROEVOLUI-0048).
  Âncoras: REQ-NEUROEVOLUI-0003.
  Rota: /async-jobs   Roles: user

  Tabela paginada de jobs assíncronos: status, tipo (queue_name), progresso (%), created_at,
  completed_at. Clique em linha navega para /async-jobs/:id. Filtro por status sincroniza
  com query params da URL. Botão "Cancelar job" disponível para jobs cancellable (queued/processing).
  Auto-refresh a cada 15 s. Sem style inline, sem v-html. Tokens --ui-* apenas em CSS.

  Endpoints:
    GET  /v1/async-jobs        → { data, total } (filtros: status, queue_name)
    GET  /v1/health/queue      → { status, queue: { redis, waiting, active, completed, failed, delayed } }
    DELETE /v1/async-jobs/:id  → cancela/remove job
-->
<template>
  <UiPageLayout
    eyebrow="Observabilidade"
    title="Filas de Jobs"
    subtitle="Monitoramento das filas BullMQ — status, tipo, progresso e timestamps. Atualização automática a cada 15 s."
    width="wide"
    :error="fatalError"
    @retry="loadAll"
  >
    <!-- ===== Ações da página ===== -->
    <template #actions>
      <UiButton
        variant="subtle"
        size="sm"
        :loading="anyLoading"
        @click="loadAll"
      >
        Atualizar agora
      </UiButton>
      <UiButton
        :variant="autoRefresh ? 'primary' : 'ghost'"
        size="sm"
        @click="toggleAutoRefresh"
      >
        {{ autoRefresh ? 'Auto: 15 s' : 'Auto: desligado' }}
      </UiButton>
    </template>

    <!-- ===== Banner de saúde do broker ===== -->
    <template #banner>
      <div class="aj-banner" :data-tone="brokerTone" role="status" aria-live="polite">
        <span class="aj-banner-dot" aria-hidden="true" />
        <span class="aj-banner-text">{{ brokerHeadline }}</span>
        <span v-if="lastRefreshedLabel" class="aj-banner-meta">{{ lastRefreshedLabel }}</span>
      </div>
    </template>

    <!-- ===== Cartões de contagem por estado ===== -->
    <section class="aj-metrics" aria-label="Contadores por estado das filas">
      <UiMetricCard
        v-for="card in statusCards"
        :key="card.key"
        :label="card.label"
        :value="card.value"
        :tone="card.tone"
        :hint="card.hint"
        :loading="healthLoading"
        clickable
        @click="filterByStatus(card.statusKey)"
      />
    </section>

    <!-- ===== Acesso negado (403/401) ===== -->
    <UiCard v-if="accessDenied" title="Acesso restrito">
      <UiEmptyState
        icon="lock"
        title="Acesso não autorizado"
        description="O monitoramento de filas exige perfil de gestor (clinic_manager) ou superior. Solicite o acesso a um administrador."
      >
        <template #action>
          <UiButton variant="subtle" to="/dashboard">Voltar ao painel</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- ===== Tabela de jobs ===== -->
    <UiCard
      v-else
      title="Jobs enfileirados"
      subtitle="Clique em um job para ver os detalhes completos. Use o filtro para refinar por status ou tipo."
    >
      <template #actions>
        <UiButton
          variant="ghost"
          size="sm"
          :loading="r.loading.value"
          @click="r.load"
        >
          Recarregar tabela
        </UiButton>
      </template>

      <!-- Filtros -->
      <UiFiltersPanel
        v-model="filterModel"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />

      <!-- Tabela -->
      <UiDataTable
        :columns="columns"
        :rows="tableRows"
        :loading="r.loading.value"
        :error="tableErrorMessage"
        row-key="rowId"
        density="comfortable"
        clickable-rows
        server-mode
        :sort="r.sort.value"
        :page="r.page.value"
        :page-size="r.pageSize.value"
        :total="r.total.value"
        paginated
        :empty="{
          title: 'Nenhum job em execução',
          description: 'Quando o sistema disparar processamentos assíncronos (notas, importações, notificações, relatórios de IA), eles aparecerão aqui.',
          icon: 'clock',
        }"
        @update:sort="r.setSort"
        @update:page="r.setPage"
        @update:page-size="onPageSize"
        @row-click="openDetail"
        @retry="r.load"
      >
        <!-- Status com badge -->
        <template #cell-status="{ value }">
          <UiStatusBadge :status="value" with-dot />
        </template>

        <!-- Tipo (fila) com rótulo legível -->
        <template #cell-queue_name="{ value }">
          <span class="aj-queue-name">{{ queueLabel(value) }}</span>
        </template>

        <!-- Progresso em percentual -->
        <template #cell-progress="{ row, value }">
          <span class="aj-progress">{{ effectiveProgress(row, value) }}%</span>
        </template>

        <!-- Data de criação formatada -->
        <template #cell-created_at="{ value }">
          <span class="aj-date">{{ format.formatDateTime(value) }}</span>
        </template>

        <!-- Data de conclusão formatada -->
        <template #cell-completed_at="{ value }">
          <span class="aj-date">{{ value ? format.formatDateTime(value) : '—' }}</span>
        </template>

        <!-- Ação: cancelar job (apenas para queued/processing) -->
        <template #cell-_actions="{ row }">
          <UiButton
            v-if="isCancellable(row)"
            variant="ghost"
            size="sm"
            :loading="cancellingId === row.id"
            @click.stop="cancelJob(row)"
          >
            Cancelar job
          </UiButton>
        </template>

        <!-- CTA do estado vazio: verificar jobs concluídos -->
        <template #empty-action>
          <UiButton variant="subtle" @click="filterByStatus('completed')">
            Ver jobs concluídos
          </UiButton>
        </template>
      </UiDataTable>
    </UiCard>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiStatusBadge,
  UiEmptyState,
  UiFiltersPanel,
  UiButton,
  useResource,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

const toast = useToast();
const confirm = useConfirm();
const router = useRouter();
const route = useRoute();

// ---------------------------------------------------------------------------
// Recursos REAIS. asyncJobsApi → /v1/async-jobs. queueHealthApi → /v1/health/queue.
// ---------------------------------------------------------------------------
const asyncJobsApi = resourceFactory('async-jobs');
const queueHealthApi = resourceFactory('health/queue');

const r = useResource(asyncJobsApi, {
  pageSize: 20,
  sort: { key: 'created_at', dir: 'desc' },
});

// ---------------------------------------------------------------------------
// Saúde da fila (contadores BullMQ + estado Redis) — fail-soft.
// ---------------------------------------------------------------------------
const healthLoading = ref(false);
const healthError = ref(null);
const healthCounts = ref(null);
const redisConnected = ref(null);
const lastRefreshed = ref(null);

function isDenied(e) {
  return e && (e.status === 401 || e.status === 403);
}

async function loadHealth() {
  healthLoading.value = true;
  healthError.value = null;
  try {
    const res = await queueHealthApi.list();
    const q = (res && res.queue) || (res && res.data && res.data.queue) || null;
    healthCounts.value = q;
    redisConnected.value = q ? !!q.redis : null;
  } catch (e) {
    healthError.value = e;
    if (!isDenied(e)) {
      healthCounts.value = null;
      redisConnected.value = null;
    }
  } finally {
    healthLoading.value = false;
  }
}

// ---------------------------------------------------------------------------
// Cartões de contagem (5 estados BullMQ).
// ---------------------------------------------------------------------------
const fmt = (v) => (v === null || v === undefined ? '—' : format.formatNumber(v));

const statusCards = computed(() => {
  const c = healthCounts.value || {};
  return [
    {
      key: 'waiting',
      statusKey: 'queued',
      label: 'Na fila',
      value: fmt(c.waiting),
      tone: 'warning',
      hint: 'Aguardando um worker',
    },
    {
      key: 'active',
      statusKey: 'processing',
      label: 'Em processamento',
      value: fmt(c.active),
      tone: 'running',
      hint: 'Jobs sendo executados agora',
    },
    {
      key: 'completed',
      statusKey: 'completed',
      label: 'Concluídos',
      value: fmt(c.completed),
      tone: 'success',
      hint: 'Finalizados com sucesso',
    },
    {
      key: 'failed',
      statusKey: 'failed',
      label: 'Com falha',
      value: fmt(c.failed),
      tone: 'error',
      hint: 'Esgotaram as tentativas',
    },
    {
      key: 'delayed',
      statusKey: '',
      label: 'Agendados',
      value: fmt(c.delayed),
      tone: 'neutral',
      hint: 'Aguardando retry / backoff',
    },
  ];
});

// Clique em um card filtra a tabela pelo status correspondente e sincroniza URL.
function filterByStatus(statusKey) {
  if (!statusKey) return;
  filterModel.value = { ...filterModel.value, status: statusKey };
  r.setFilters({ ...filterModel.value, status: statusKey });
  syncQueryParams({ ...filterModel.value, status: statusKey });
}

// ---------------------------------------------------------------------------
// Banner de saúde do broker.
// ---------------------------------------------------------------------------
const brokerTone = computed(() => {
  if (accessDenied.value) return 'neutral';
  if (healthLoading.value && redisConnected.value === null) return 'neutral';
  if (redisConnected.value === true) return 'success';
  if (redisConnected.value === false) return 'warning';
  return 'neutral';
});

const brokerHeadline = computed(() => {
  if (accessDenied.value) return 'Sem acesso aos contadores das filas.';
  if (healthLoading.value && redisConnected.value === null) return 'Consultando estado das filas…';
  if (redisConnected.value === true) return 'Redis conectado — filas BullMQ operando normalmente.';
  if (redisConnected.value === false) return 'Redis indisponível — jobs em modo degradado.';
  if (healthError.value) return 'Não foi possível consultar a saúde das filas.';
  return 'Estado das filas indisponível.';
});

const lastRefreshedLabel = computed(() =>
  lastRefreshed.value
    ? 'Atualizado em ' + format.formatDateTime(lastRefreshed.value)
    : ''
);

// ---------------------------------------------------------------------------
// Controle de acesso e erro fatal.
// ---------------------------------------------------------------------------
const accessDenied = computed(
  () => isDenied(healthError.value) || isDenied(r.error.value)
);

const fatalError = computed(() => {
  if (accessDenied.value) return null;
  const hErr = healthError.value && !isDenied(healthError.value);
  const jErr = r.error.value && !isDenied(r.error.value);
  if (hErr && jErr && !healthCounts.value && !r.items.value.length) return r.error.value;
  return null;
});

const tableErrorMessage = computed(() => {
  const e = r.error.value;
  if (!e || isDenied(e)) return null;
  return e.message || 'Não foi possível carregar os jobs.';
});

// ---------------------------------------------------------------------------
// Mapeamento de filas para rótulos legíveis.
// ---------------------------------------------------------------------------
const QUEUE_LABELS = {
  'consultation-notes': 'Notas de consulta',
  'patient-imports': 'Importação de pacientes',
  'notifications': 'Notificações',
  'summaries-ai': 'Resumos por IA',
  'patient-reports': 'Relatórios de paciente',
};

const queueLabel = (name) => QUEUE_LABELS[name] || format.humanize(name || '');

// ---------------------------------------------------------------------------
// Colunas da tabela (alinhadas ao refinement REF-NEUROEVOLUI-0048).
// ---------------------------------------------------------------------------
const columns = [
  { key: 'id', label: 'ID', sortable: true, align: 'right' },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'queue_name', label: 'Tipo', sortable: true },
  { key: 'progress', label: 'Progresso', align: 'center' },
  { key: 'created_at', label: 'Criado em', sortable: true },
  { key: 'completed_at', label: 'Concluído em', sortable: true },
  { key: '_actions', label: '' },
];

// Progresso efetivo: jobs done/completed exibem 100%.
function effectiveProgress(row, rawValue) {
  const st = String((row && row.status) || '').toLowerCase();
  if (st === 'done' || st === 'completed') return 100;
  return rawValue || 0;
}

// Linhas estabilizadas com rowId único.
const tableRows = computed(() =>
  (r.items.value || []).map((row) => ({
    ...row,
    rowId:
      row.id != null
        ? 'id-' + row.id
        : (row.queue_name || '') + '::' + (row.job_key || ''),
  }))
);

// ---------------------------------------------------------------------------
// Cancelamento de jobs.
// ---------------------------------------------------------------------------
const cancellingId = ref(null);

function isCancellable(row) {
  const st = String((row && row.status) || '').toLowerCase();
  return st === 'queued' || st === 'processing';
}

async function cancelJob(row) {
  const id = row && row.id;
  if (!id) return;
  const ok = await confirm({
    title: 'Cancelar job',
    message: `Cancelar o job "${queueLabel(row.queue_name)}" (#${id})? Esta ação não pode ser desfeita.`,
    confirmLabel: 'Cancelar job',
    cancelLabel: 'Manter',
    danger: true,
  });
  if (!ok) return;
  cancellingId.value = id;
  try {
    await asyncJobsApi.remove(id);
    toast.success('Job cancelado com sucesso.');
    await r.load();
  } catch (e) {
    toast.error(e.message || 'Não foi possível cancelar o job.');
  } finally {
    cancellingId.value = null;
  }
}

// ---------------------------------------------------------------------------
// Navegação: clique em linha abre a página de detalhe do job.
// ---------------------------------------------------------------------------
function openDetail(row) {
  const id = row && (row.id || row.job_id);
  if (!id) return;
  router.push('/async-jobs/' + id);
}

// ---------------------------------------------------------------------------
// Filtros com sincronização de query params da URL.
// ---------------------------------------------------------------------------
const filterModel = ref({
  queue_name: route.query.queue_name || '',
  status: route.query.status || '',
});

const filterFields = [
  {
    key: 'queue_name',
    label: 'Tipo',
    type: 'select',
    options: [
      { value: '', label: 'Todos os tipos' },
      ...Object.keys(QUEUE_LABELS).map((k) => ({ value: k, label: QUEUE_LABELS[k] })),
    ],
  },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: '', label: 'Todos os status' },
      { value: 'queued', label: 'Enfileirado' },
      { value: 'processing', label: 'Em processamento' },
      { value: 'completed', label: 'Concluído' },
      { value: 'failed', label: 'Com falha' },
    ],
  },
];

function syncQueryParams(filters) {
  const q = {};
  if (filters.status) q.status = filters.status;
  if (filters.queue_name) q.queue_name = filters.queue_name;
  router.replace({ query: q });
}

function applyFilters(values) {
  r.setFilters({ ...(values || {}) });
  syncQueryParams(values || {});
}

function clearFilters() {
  filterModel.value = { queue_name: '', status: '' };
  r.setFilters({ queue_name: '', status: '' });
  router.replace({ query: {} });
}

function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}

// ---------------------------------------------------------------------------
// Carga inicial + auto-refresh a cada 15 s.
// ---------------------------------------------------------------------------
const anyLoading = computed(() => healthLoading.value || r.loading.value);

async function loadAll() {
  await Promise.allSettled([loadHealth(), r.load()]);
  lastRefreshed.value = new Date().toISOString();
}

const autoRefresh = ref(true);
const AUTO_MS = 15000;
let autoTimer = null;

function scheduleAuto() {
  if (!autoRefresh.value) return;
  autoTimer = setTimeout(async () => {
    if (!autoRefresh.value) return;
    await loadAll();
    scheduleAuto();
  }, AUTO_MS);
}

function stopAuto() {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
}

function toggleAutoRefresh() {
  autoRefresh.value = !autoRefresh.value;
  stopAuto();
  if (autoRefresh.value) {
    toast.success('Atualização automática ligada (15 s).');
    scheduleAuto();
  } else {
    toast.info('Atualização automática desligada.');
  }
}

onMounted(async () => {
  // Aplica filtros iniciais vindos da URL antes do primeiro carregamento.
  const initStatus = route.query.status || '';
  const initQueue = route.query.queue_name || '';
  if (initStatus) r.filters.status = initStatus;
  if (initQueue) r.filters.queue_name = initQueue;

  await loadAll();
  scheduleAuto();
});
onBeforeUnmount(stopAuto);
</script>

<style scoped>
/* Banner do broker Redis */
.aj-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  font-size: var(--ui-text-sm);
}
.aj-banner[data-tone="success"] { border-left-color: rgb(var(--ui-ok)); }
.aj-banner[data-tone="warning"] { border-left-color: rgb(var(--ui-warn)); }
.aj-banner[data-tone="neutral"] { border-left-color: rgb(var(--ui-faint)); }

.aj-banner-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--ui-faint));
}
.aj-banner[data-tone="success"] .aj-banner-dot { background: rgb(var(--ui-ok)); }
.aj-banner[data-tone="warning"] .aj-banner-dot { background: rgb(var(--ui-warn)); }

.aj-banner-text {
  color: rgb(var(--ui-fg));
  font-weight: 600;
}
.aj-banner-meta {
  margin-left: auto;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
}

/* Grade de cards de contagem */
.aj-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--ui-space-4);
}

/* Células especiais da tabela */
.aj-queue-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

.aj-progress {
  font-variant-numeric: tabular-nums;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

.aj-date {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  white-space: nowrap;
}

/* Responsivo ≤ 860 px */
@media (max-width: 860px) {
  .aj-banner-meta { margin-left: 0; width: 100%; }
}
</style>
