<!--
  JobsMonitorView — Filas e jobs (monitor das filas assíncronas BullMQ).
  Saúde operacional / observabilidade. Restrito a clinic_manager+ (gate no backend; aqui
  tratamos 401/403 como "sem acesso" de forma graciosa).

  Âncoras: REQ-NEUROEVOLUI-0003 (filas/jobs), REQ-NEUROEVOLUI-0001.

  Endpoints REAIS (via ../api.js → resourceFactory → /v1/<name>):
    · GET /v1/health/queue            → { status, queue: { redis, waiting, active, completed, failed, delayed } }
    · GET /v1/async-jobs              → { data: [...], total } (coleção paginada de jobs rastreados)
    · GET /v1/jobs/:queueName/:jobKey → job único (drill-in: dedup + idempotência)

  Todos os estados de tela: loading (skeleton), empty (CTA), error (retry), normal.
  Nada de <table>/<input> cru, nada de style inline, nada de v-html. Tokens --ui-* só em CSS.
-->
<template>
  <UiPageLayout
    eyebrow="Observabilidade"
    title="Filas e jobs"
    subtitle="Monitor das filas assíncronas (BullMQ): contadores por estado, jobs recentes, dedup e idempotência."
    width="wide"
    :error="fatalError"
    @retry="loadAll"
  >
    <template #actions>
      <UiButton variant="subtle" size="sm" :loading="anyLoading" @click="loadAll">
        Atualizar
      </UiButton>
      <UiButton
        :variant="autoRefresh ? 'primary' : 'ghost'"
        size="sm"
        @click="toggleAuto"
      >
        {{ autoRefresh ? 'Auto: ligado' : 'Auto: desligado' }}
      </UiButton>
      <UiButton variant="ghost" size="sm" to="/">Voltar ao painel</UiButton>
    </template>

    <!-- Banner de estado do Redis (broker das filas) -->
    <template #banner>
      <div class="jm-banner" :data-tone="brokerTone" role="status">
        <span class="jm-banner-dot" aria-hidden="true" />
        <span class="jm-banner-text">{{ brokerHeadline }}</span>
        <span v-if="lastUpdatedLabel" class="jm-banner-meta">{{ lastUpdatedLabel }}</span>
      </div>
    </template>

    <!-- ============ CONTADORES POR ESTADO ============ -->
    <section class="jm-metrics" aria-label="Contadores por estado">
      <UiMetricCard
        v-for="m in metricCards"
        :key="m.key"
        :label="m.label"
        :value="m.value"
        :tone="m.tone"
        :hint="m.hint"
        :loading="health.loading"
      />
    </section>

    <!-- ============ ACESSO NEGADO (clinic_manager+) ============ -->
    <UiCard v-if="accessDenied" title="Acesso restrito">
      <UiEmptyState
        icon="lock"
        title="Esta tela é para gestores"
        description="O monitor de filas e jobs exige perfil de gestor da clínica (clinic_manager) ou superior. Fale com um administrador para liberar o acesso."
      >
        <template #action>
          <UiButton variant="subtle" to="/">Voltar ao painel</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- ============ JOBS RECENTES ============ -->
    <UiCard
      v-else
      title="Jobs recentes"
      subtitle="Cada job é único por fila + chave (dedup). Reenfileirar a mesma chave é idempotente."
    >
      <template #actions>
        <UiButton variant="ghost" size="sm" :loading="jobs.loading.value" @click="reloadJobs">
          Recarregar
        </UiButton>
      </template>

      <UiFiltersPanel
        v-model="filterModel"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />

      <UiDataTable
        :columns="columns"
        :rows="jobRows"
        :loading="jobs.loading.value"
        :error="jobsErrorMessage"
        row-key="rowId"
        density="comfortable"
        clickable-rows
        server-mode
        :sort="jobs.sort.value"
        :page="jobs.page.value"
        :page-size="jobs.pageSize.value"
        :total="jobs.total.value"
        paginated
        :empty="{
          title: 'Nenhum job por aqui',
          description: 'Quando a clínica disparar processamentos assíncronos (notas, importações, notificações, relatórios), eles aparecem aqui.',
          icon: 'clock',
        }"
        @update:sort="onSort"
        @update:page="onPage"
        @update:page-size="onPageSize"
        @row-click="openJob"
        @retry="reloadJobs"
      >
        <template #cell-status="{ value }">
          <UiStatusBadge :status="value" />
        </template>
        <template #cell-queue_name="{ value }">
          <span class="jm-queue">{{ queueLabel(value) }}</span>
        </template>
        <template #cell-job_key="{ value }">
          <code class="jm-code">{{ value || '—' }}</code>
        </template>
        <template #cell-created_at="{ value }">
          {{ format.formatDateTime(value) }}
        </template>
        <template #empty-action>
          <UiButton variant="subtle" to="/">Voltar ao painel</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- ============ MODAL DE DETALHE DO JOB (drill-in real) ============ -->
    <UiModal v-model:open="detailOpen" :title="detailTitle" width="lg">
      <UiLoadingState v-if="detail.loading" variant="skeleton" :skeleton-lines="6" />
      <UiErrorState
        v-else-if="detail.error"
        :message="detailErrorMessage"
        :code="detail.error && detail.error.status ? String(detail.error.status) : ''"
        retryable
        @retry="refetchDetail"
      />
      <div v-else-if="detail.job" class="jm-detail">
        <div class="jm-detail-head">
          <UiStatusBadge :status="detail.job.status" size="lg" />
          <span class="jm-detail-headline">{{ detailHeadline }}</span>
        </div>

        <dl class="jm-dl">
          <div class="jm-dl-row">
            <dt>Fila</dt>
            <dd>{{ queueLabel(detail.job.queue_name) }}</dd>
          </div>
          <div class="jm-dl-row">
            <dt>Chave do job (dedup)</dt>
            <dd><code class="jm-code">{{ detail.job.job_key || '—' }}</code></dd>
          </div>
          <div class="jm-dl-row">
            <dt>ID interno</dt>
            <dd>{{ detail.job.job_id || detail.job.id || '—' }}</dd>
          </div>
          <div class="jm-dl-row">
            <dt>Disparado por</dt>
            <dd>{{ detail.job.created_by || '—' }}</dd>
          </div>
          <div class="jm-dl-row">
            <dt>Criado em</dt>
            <dd>{{ format.formatDateTime(detail.job.created_at) }}</dd>
          </div>
          <div class="jm-dl-row">
            <dt>Atualizado em</dt>
            <dd>{{ format.formatDateTime(detail.job.updated_at) }}</dd>
          </div>
        </dl>

        <div v-if="detailPayload" class="jm-pre-wrap">
          <p class="jm-pre-label">Payload</p>
          <pre class="jm-pre">{{ detailPayload }}</pre>
        </div>
        <div v-if="detailResult" class="jm-pre-wrap">
          <p class="jm-pre-label">Resultado</p>
          <pre class="jm-pre">{{ detailResult }}</pre>
        </div>
      </div>
      <UiEmptyState
        v-else
        icon="search"
        title="Job não encontrado"
        description="Esta combinação de fila e chave não retornou um job. Ele pode ter sido removido pela política de retenção da fila."
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
// Recursos REAIS (resourceFactory → /v1/<name>).
//  · health/queue   → contadores da fila (BullMQ) + estado do Redis.
//  · async-jobs     → coleção paginada de jobs rastreados (garantida pelo integrador).
//  · jobs/:q/:k     → job único para o drill-in (dedup + idempotência).
// ---------------------------------------------------------------------------
const queueHealthApi = resourceFactory('health/queue');
const asyncJobsApi = resourceFactory('async-jobs');

const jobs = useResource(asyncJobsApi, { pageSize: 25, sort: { key: 'created_at', dir: 'desc' } });

// ---------------------------------------------------------------------------
// Saúde da fila (contadores) — fail-soft, nunca lança.
// ---------------------------------------------------------------------------
const health = reactive({ loading: false, error: null, counts: null, redis: null });
const lastUpdated = ref(null);

function isDenied(e) {
  const s = e && e.status;
  return s === 401 || s === 403;
}

async function loadHealth() {
  health.loading = true;
  health.error = null;
  try {
    const r = await queueHealthApi.list();
    // /v1/health/queue → { status, queue: {...} }; resourceFactory embrulha sem 'data' → usa direto.
    const q = (r && r.queue) || (r && r.data && r.data.queue) || null;
    health.counts = q;
    health.redis = q ? !!q.redis : null;
  } catch (e) {
    health.error = e;
    if (!isDenied(e)) {
      health.counts = null;
      health.redis = null;
    }
  } finally {
    health.loading = false;
  }
}

// ---------------------------------------------------------------------------
// Cartões de contadores (derivados dos contadores reais da fila).
// ---------------------------------------------------------------------------
const n = (v) => (v === null || v === undefined ? '—' : format.formatNumber(v));

const metricCards = computed(() => {
  const c = health.counts || {};
  return [
    { key: 'active', label: 'Em processamento', value: n(c.active), tone: 'running', hint: 'Jobs ativos agora' },
    { key: 'waiting', label: 'Na fila', value: n(c.waiting), tone: 'warning', hint: 'Aguardando um worker' },
    { key: 'delayed', label: 'Agendados', value: n(c.delayed), tone: 'neutral', hint: 'Aguardando o retry/backoff' },
    { key: 'completed', label: 'Concluídos', value: n(c.completed), tone: 'success', hint: 'Retidos pela política da fila' },
    { key: 'failed', label: 'Com falha', value: n(c.failed), tone: 'error', hint: 'Esgotaram as tentativas' },
  ];
});

// Estado do broker (Redis) — fonte da saúde operacional das filas.
const brokerTone = computed(() => {
  if (health.loading && health.redis === null) return 'neutral';
  if (accessDenied.value) return 'neutral';
  if (health.redis === true) return 'success';
  if (health.redis === false) return 'warning';
  return 'neutral';
});
const brokerHeadline = computed(() => {
  if (accessDenied.value) return 'Sem acesso aos contadores das filas.';
  if (health.loading && health.redis === null) return 'Consultando o estado das filas…';
  if (health.redis === true) return 'Redis conectado — filas operando normalmente.';
  if (health.redis === false) return 'Redis indisponível — jobs rodam em modo inline (sem fila distribuída).';
  if (health.error) return 'Não foi possível consultar a saúde das filas.';
  return 'Estado das filas indisponível.';
});

const lastUpdatedLabel = computed(() =>
  lastUpdated.value ? 'Atualizado em ' + format.formatDateTime(lastUpdated.value) : ''
);

// ---------------------------------------------------------------------------
// Acesso restrito (clinic_manager+). Tanto a saúde quanto a coleção podem
// retornar 401/403; tratamos como "sem acesso" sem quebrar a tela.
// ---------------------------------------------------------------------------
const accessDenied = computed(
  () => isDenied(health.error) || isDenied(jobs.error.value)
);

// Erro FATAL da página: só quando NÃO é negação de acesso e NÃO há dado nenhum.
const fatalError = computed(() => {
  if (accessDenied.value) return null;
  const hErr = health.error && !isDenied(health.error);
  const jErr = jobs.error.value && !isDenied(jobs.error.value);
  if (hErr && jErr && !health.counts && !jobs.items.value.length) return jobs.error.value;
  return null;
});

const jobsErrorMessage = computed(() => {
  const e = jobs.error.value;
  if (!e || isDenied(e)) return null;
  return e.message || 'Não foi possível carregar os jobs.';
});

// ---------------------------------------------------------------------------
// Filas conhecidas (rótulos legíveis) — derivados, sem heurística de domínio.
// ---------------------------------------------------------------------------
const QUEUE_LABELS = {
  'consultation-notes': 'Notas de consulta',
  'patient-imports': 'Importação de pacientes',
  'notifications': 'Notificações',
  'summaries-ai': 'Resumos por IA',
  'patient-reports': 'Relatórios de paciente',
};
const queueLabel = (name) => QUEUE_LABELS[name] || format.humanize(name);

// ---------------------------------------------------------------------------
// Tabela de jobs recentes.
// ---------------------------------------------------------------------------
const columns = [
  { key: 'status', label: 'Status', sortable: true },
  { key: 'queue_name', label: 'Fila', sortable: true },
  { key: 'job_key', label: 'Chave (dedup)' },
  { key: 'created_by', label: 'Disparado por' },
  { key: 'created_at', label: 'Criado em', sortable: true, align: 'right' },
];

// rowKey estável (a coleção tem id, mas garantimos unicidade por fila+chave).
const jobRows = computed(() =>
  (jobs.items.value || []).map((row) => ({
    ...row,
    rowId: row.id != null ? 'id-' + row.id : (row.queue_name || '') + '::' + (row.job_key || ''),
  }))
);

// ---------------------------------------------------------------------------
// Filtros (fila + status). Server-mode: passamos para o backend via setFilters.
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
      { value: 'active', label: 'Em processamento' },
      { value: 'completed', label: 'Concluído' },
      { value: 'failed', label: 'Com falha' },
    ],
  },
];

function applyFilters(values) {
  jobs.setFilters({ ...(values || {}) });
}
function clearFilters() {
  filterModel.value = { queue_name: '', status: '' };
  jobs.setFilters({ queue_name: '', status: '' });
}

function onSort(s) {
  jobs.setSort(s);
}
function onPage(p) {
  jobs.setPage(p);
}
function onPageSize(size) {
  jobs.pageSize.value = size;
  jobs.setPage(1);
}

async function reloadJobs() {
  await jobs.load();
}

// ---------------------------------------------------------------------------
// Drill-in: detalhe REAL do job via GET /v1/jobs/:queueName/:jobKey.
// ---------------------------------------------------------------------------
const detailOpen = ref(false);
const detail = reactive({ loading: false, error: null, job: null, ref: null });

const detailTitle = computed(() => {
  if (!detail.ref) return 'Detalhe do job';
  return queueLabel(detail.ref.queueName);
});

const detailHeadline = computed(() => {
  const s = detail.job && detail.job.status;
  switch (s) {
    case 'queued': return 'Enfileirado — aguardando um worker.';
    case 'active': return 'Em processamento agora.';
    case 'completed': return 'Concluído com sucesso.';
    case 'failed': return 'Falhou após esgotar as tentativas.';
    default: return 'Job rastreado.';
  }
});

const detailErrorMessage = computed(() => {
  const e = detail.error;
  if (!e) return '';
  if (e.status === 404) return 'Job não encontrado — pode ter expirado pela retenção da fila.';
  if (isDenied(e)) return 'Você não tem acesso a este job.';
  return e.message || 'Não foi possível carregar o job.';
});

function safeStringify(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') {
    try { return JSON.stringify(JSON.parse(v), null, 2); } catch { return v; }
  }
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}
const detailPayload = computed(() => (detail.job ? safeStringify(detail.job.payload) : ''));
const detailResult = computed(() => (detail.job ? safeStringify(detail.job.result) : ''));

async function fetchDetail(queueName, jobKey) {
  detail.loading = true;
  detail.error = null;
  try {
    // /v1/jobs/:queueName/:jobKey — partes da URL escapadas (chaves podem conter caracteres especiais).
    const api = resourceFactory(
      'jobs/' + encodeURIComponent(queueName) + '/' + encodeURIComponent(jobKey)
    );
    // resourceFactory.list() faz GET na raiz do recurso → exatamente /v1/jobs/:q/:k.
    const res = await api.list();
    detail.job = res && res.data !== undefined && !Array.isArray(res) && !res.queue_name ? res.data : res;
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

async function openJob(row) {
  if (!row || !row.queue_name || !row.job_key) {
    toast.error('Job sem fila/chave — não é possível consultar o detalhe.');
    return;
  }
  detail.ref = { queueName: row.queue_name, jobKey: row.job_key };
  detail.job = null;
  detail.error = null;
  detailOpen.value = true;
  await fetchDetail(row.queue_name, row.job_key);
}

async function refetchDetail() {
  if (!detail.ref) return;
  await fetchDetail(detail.ref.queueName, detail.ref.jobKey);
  if (!detail.error) toast.success('Status do job atualizado.');
}

// ---------------------------------------------------------------------------
// Carga geral + auto-refresh (fail-soft).
// ---------------------------------------------------------------------------
const anyLoading = computed(() => health.loading || jobs.loading.value);

async function loadAll() {
  await Promise.allSettled([loadHealth(), jobs.load()]);
  lastUpdated.value = new Date().toISOString();
}

// Auto-refresh (intervalo) — recursivo via setTimeout para nunca empilhar cargas.
const autoRefresh = ref(false);
let autoTimer = null;
const AUTO_MS = 10000;

function scheduleAuto() {
  if (!autoRefresh.value) return;
  autoTimer = setTimeout(async () => {
    if (!autoRefresh.value) return;
    if (!detailOpen.value) await loadAll(); // não interrompe quem está lendo um detalhe
    scheduleAuto();
  }, AUTO_MS);
}
function stopAuto() {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
}
function toggleAuto() {
  autoRefresh.value = !autoRefresh.value;
  stopAuto();
  if (autoRefresh.value) {
    toast.success('Atualização automática a cada 10s.');
    scheduleAuto();
  } else {
    toast.info('Atualização automática desligada.');
  }
}

onMounted(loadAll);
onBeforeUnmount(stopAuto);
</script>

<style scoped>
/* Banner do broker (Redis) — sinal por cor + texto (cor nunca é o único sinal). */
.jm-banner {
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
.jm-banner[data-tone="success"] { border-left-color: rgb(var(--ui-ok)); }
.jm-banner[data-tone="warning"] { border-left-color: rgb(var(--ui-warn)); }
.jm-banner[data-tone="neutral"] { border-left-color: rgb(var(--ui-faint)); }
.jm-banner-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: rgb(var(--ui-faint));
}
.jm-banner[data-tone="success"] .jm-banner-dot { background: rgb(var(--ui-ok)); }
.jm-banner[data-tone="warning"] .jm-banner-dot { background: rgb(var(--ui-warn)); }
.jm-banner-text { color: rgb(var(--ui-fg)); font-weight: 600; }
.jm-banner-meta { margin-left: auto; color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }

/* Grade de contadores. */
.jm-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
}

/* Células da tabela. */
.jm-queue { font-weight: 600; }
.jm-code {
  font-family: var(--ui-font-mono, ui-monospace, monospace);
  font-size: var(--ui-text-xs);
  background: rgb(var(--ui-surface-2));
  padding: 2px 6px;
  border-radius: var(--ui-radius-sm);
  color: rgb(var(--ui-fg));
  word-break: break-all;
}

/* Detalhe do job (modal). */
.jm-detail { display: flex; flex-direction: column; gap: var(--ui-space-5); }
.jm-detail-head { display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap; }
.jm-detail-headline { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }

.jm-dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-3) var(--ui-space-5);
  margin: 0;
}
.jm-dl-row { display: flex; flex-direction: column; gap: 2px; }
.jm-dl-row dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: .04em;
}
.jm-dl-row dd { margin: 0; color: rgb(var(--ui-fg)); font-size: var(--ui-text-sm); word-break: break-word; }

.jm-pre-wrap { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.jm-pre-label {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: .04em;
}
.jm-pre {
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
  max-height: 280px;
}

/* Responsivo. */
@media (max-width: 860px) {
  .jm-dl { grid-template-columns: 1fr; }
  .jm-banner-meta { margin-left: 0; width: 100%; }
}
</style>
