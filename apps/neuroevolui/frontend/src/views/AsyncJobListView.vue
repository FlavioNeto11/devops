<!--
  AsyncJobListView — Filas de Jobs (monitoramento BullMQ).
  Âncoras: REQ-NEUROEVOLUI-0003.

  Endpoints REAIS (via ../api.js → resourceFactory → /v1/<name>):
    · GET /v1/async-jobs     → { data: [...], total } (coleção paginada de jobs rastreados)
    · GET /v1/health/queue   → { status, queue: { redis, waiting, active, completed, failed, delayed } }

  Estados: loading (skeleton), empty (CTA), error (retry), normal.
  Auto-refresh: 15 s. Nenhum style inline, nenhum v-html. Tokens --ui-* apenas em CSS.
-->
<template>
  <UiPageLayout
    eyebrow="Observabilidade"
    title="Filas de Jobs"
    subtitle="Monitoramento das filas BullMQ — status, chaves e payloads dos jobs assíncronos. Atualização automática a cada 15 s."
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
      subtitle="Cada job é identificado de forma única pela combinação fila + chave (dedup / idempotência)."
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
          title: 'Nenhum job encontrado',
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

        <!-- Fila com rótulo legível -->
        <template #cell-queue_name="{ value }">
          <span class="aj-queue-name">{{ queueLabel(value) }}</span>
        </template>

        <!-- Chave do job em fonte mono -->
        <template #cell-job_key="{ value }">
          <code class="aj-code">{{ value || '—' }}</code>
        </template>

        <!-- Payload resumido (primeiros 80 chars) -->
        <template #cell-payload="{ value }">
          <span class="aj-payload-preview">{{ snippetPayload(value) }}</span>
        </template>

        <!-- Data formatada -->
        <template #cell-created_at="{ value }">
          <span class="aj-date">{{ format.formatDateTime(value) }}</span>
        </template>

        <!-- CTA do estado vazio -->
        <template #empty-action>
          <UiButton variant="subtle" to="/dashboard">Voltar ao painel</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- ===== Modal de detalhe do job ===== -->
    <UiModal v-model:open="detailOpen" :title="detailModalTitle" width="lg">
      <!-- Carregando -->
      <UiLoadingState v-if="detail.loading" variant="skeleton" :skeleton-lines="7" />

      <!-- Erro no detalhe -->
      <UiErrorState
        v-else-if="detail.error"
        :message="detailErrorMsg"
        :code="detail.error.status ? String(detail.error.status) : ''"
        retryable
        @retry="refetchDetail"
      />

      <!-- Conteúdo do job -->
      <div v-else-if="detail.job" class="aj-detail">
        <!-- Cabeçalho do job -->
        <div class="aj-detail-head">
          <UiStatusBadge :status="detail.job.status" size="lg" with-dot />
          <span class="aj-detail-headline">{{ statusHeadline }}</span>
        </div>

        <!-- Dados gerais -->
        <dl class="aj-dl">
          <div class="aj-dl-row">
            <dt>Fila</dt>
            <dd>{{ queueLabel(detail.job.queue_name) }}</dd>
          </div>
          <div class="aj-dl-row">
            <dt>Chave do job (dedup)</dt>
            <dd><code class="aj-code">{{ detail.job.job_key || '—' }}</code></dd>
          </div>
          <div class="aj-dl-row">
            <dt>ID interno</dt>
            <dd>{{ detail.job.job_id || detail.job.id || '—' }}</dd>
          </div>
          <div class="aj-dl-row">
            <dt>Criado por</dt>
            <dd>{{ detail.job.created_by || '—' }}</dd>
          </div>
          <div class="aj-dl-row">
            <dt>Enfileirado em</dt>
            <dd>{{ format.formatDateTime(detail.job.created_at) }}</dd>
          </div>
          <div class="aj-dl-row">
            <dt>Atualizado em</dt>
            <dd>{{ format.formatDateTime(detail.job.updated_at) }}</dd>
          </div>
        </dl>

        <!-- Payload completo (JSON formatado) -->
        <div v-if="detailPayloadStr" class="aj-pre-block">
          <p class="aj-pre-label">Payload (JSON)</p>
          <pre class="aj-pre">{{ detailPayloadStr }}</pre>
        </div>

        <!-- Resultado (se houver) -->
        <div v-if="detailResultStr" class="aj-pre-block">
          <p class="aj-pre-label">Resultado</p>
          <pre class="aj-pre">{{ detailResultStr }}</pre>
        </div>
      </div>

      <!-- Job não encontrado -->
      <UiEmptyState
        v-else
        icon="search"
        title="Job não encontrado"
        description="Este job pode ter expirado pela política de retenção da fila ou ainda não ter sido processado."
      />

      <template #footer>
        <UiButton variant="ghost" @click="detailOpen = false">Fechar</UiButton>
        <UiButton
          v-if="detail.job"
          variant="subtle"
          :loading="detail.loading"
          @click="refetchDetail"
        >
          Reconsultar
        </UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiStatusBadge,
  UiEmptyState,
  UiErrorState,
  UiLoadingState,
  UiFiltersPanel,
  UiModal,
  UiButton,
  useResource,
  useToast,
  format,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

const toast = useToast();

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
      statusKey: 'done',
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

// Clique em um card filtra a tabela pelo status correspondente.
function filterByStatus(statusKey) {
  if (!statusKey) return;
  filterModel.value = { ...filterModel.value, status: statusKey };
  r.setFilters({ ...filterModel.value, status: statusKey });
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
// Colunas da tabela.
// ---------------------------------------------------------------------------
const columns = [
  { key: 'status', label: 'Status', sortable: true },
  { key: 'queue_name', label: 'Fila', sortable: true },
  { key: 'job_key', label: 'Chave (dedup)' },
  { key: 'payload', label: 'Payload resumido' },
  { key: 'created_by', label: 'Criado por' },
  { key: 'created_at', label: 'Enfileirado em', sortable: true, align: 'right' },
];

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
// Preview de payload (primeiros 80 chars, sem expandir JSON).
// ---------------------------------------------------------------------------
function snippetPayload(value) {
  if (value === null || value === undefined) return '—';
  const str =
    typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > 80 ? str.slice(0, 77) + '…' : str;
}

// ---------------------------------------------------------------------------
// Filtros.
// ---------------------------------------------------------------------------
const filterModel = ref({ queue_name: '', status: '' });

const filterFields = [
  {
    key: 'queue_name',
    label: 'Fila',
    type: 'select',
    options: [
      { value: '', label: 'Todas as filas' },
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
      { value: 'done', label: 'Concluído' },
      { value: 'failed', label: 'Com falha' },
    ],
  },
];

function applyFilters(values) {
  r.setFilters({ ...(values || {}) });
}

function clearFilters() {
  filterModel.value = { queue_name: '', status: '' };
  r.setFilters({ queue_name: '', status: '' });
}

function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}

// ---------------------------------------------------------------------------
// Modal de detalhe do job.
// ---------------------------------------------------------------------------
const detailOpen = ref(false);
const detail = reactive({
  loading: false,
  error: null,
  job: null,
  ref: null, // { jobId }
});

const detailModalTitle = computed(() => {
  if (!detail.job) return 'Detalhe do job';
  return queueLabel(detail.job.queue_name);
});

const statusHeadline = computed(() => {
  switch (detail.job && detail.job.status) {
    case 'queued':
      return 'Enfileirado — aguardando um worker.';
    case 'processing':
      return 'Em processamento agora.';
    case 'done':
      return 'Concluído com sucesso.';
    case 'failed':
      return 'Falhou após esgotar as tentativas.';
    default:
      return 'Job rastreado.';
  }
});

const detailErrorMsg = computed(() => {
  const e = detail.error;
  if (!e) return '';
  if (e.status === 404) return 'Job não encontrado — pode ter expirado.';
  if (isDenied(e)) return 'Você não tem acesso a este job.';
  return e.message || 'Falha ao carregar o detalhe do job.';
});

function safeJson(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  }
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

const detailPayloadStr = computed(() =>
  detail.job ? safeJson(detail.job.payload) : ''
);
const detailResultStr = computed(() =>
  detail.job ? safeJson(detail.job.result) : ''
);

async function fetchDetail(jobId) {
  detail.loading = true;
  detail.error = null;
  try {
    const res = await asyncJobsApi.get(jobId);
    detail.job = res && res.data !== undefined && !Array.isArray(res) ? res.data : res;
  } catch (e) {
    detail.error = e;
    detail.job = null;
    if (!isDenied(e) && e.status !== 404) {
      toast.error(e.message || 'Falha ao carregar o job.');
    }
  } finally {
    detail.loading = false;
  }
}

async function openDetail(row) {
  const id = row && (row.id || row.job_id);
  if (!id) {
    toast.error('Job sem identificador — não é possível abrir o detalhe.');
    return;
  }
  detail.ref = { jobId: id };
  detail.job = null;
  detail.error = null;
  detailOpen.value = true;
  await fetchDetail(id);
}

async function refetchDetail() {
  if (!detail.ref) return;
  await fetchDetail(detail.ref.jobId);
  if (!detail.error) toast.success('Status do job atualizado.');
}

// ---------------------------------------------------------------------------
// Carga inicial + auto-refresh a cada 15 s.
// ---------------------------------------------------------------------------
const anyLoading = computed(() => healthLoading.value || r.loading.value);

async function loadAll() {
  await Promise.allSettled([loadHealth(), r.load()]);
  lastRefreshed.value = new Date().toISOString();
}

const autoRefresh = ref(true); // ligado por padrão (requisito: atualização a cada 15 s)
const AUTO_MS = 15000;
let autoTimer = null;

function scheduleAuto() {
  if (!autoRefresh.value) return;
  autoTimer = setTimeout(async () => {
    if (!autoRefresh.value) return;
    // Não interrompe a leitura de um detalhe aberto.
    if (!detailOpen.value) await loadAll();
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
.aj-code {
  font-family: var(--ui-font-mono, ui-monospace, monospace);
  font-size: var(--ui-text-xs);
  background: rgb(var(--ui-surface-2));
  padding: 2px 6px;
  border-radius: var(--ui-radius-sm);
  color: rgb(var(--ui-fg));
  word-break: break-all;
}
.aj-payload-preview {
  font-family: var(--ui-font-mono, ui-monospace, monospace);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
  display: inline-block;
  vertical-align: middle;
}
.aj-date {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  white-space: nowrap;
}

/* Modal de detalhe */
.aj-detail {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}
.aj-detail-head {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.aj-detail-headline {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}

.aj-dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-3) var(--ui-space-5);
  margin: 0;
}
.aj-dl-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.aj-dl-row dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.aj-dl-row dd {
  margin: 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  word-break: break-word;
}

/* Blocos de pré-formatado (payload / resultado) */
.aj-pre-block {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.aj-pre-label {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.aj-pre {
  margin: 0;
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  font-family: var(--ui-font-mono, ui-monospace, monospace);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 260px;
}

/* Responsivo ≤ 860 px */
@media (max-width: 860px) {
  .aj-dl { grid-template-columns: 1fr; }
  .aj-banner-meta { margin-left: 0; width: 100%; }
  .aj-payload-preview { max-width: 160px; }
}
</style>
