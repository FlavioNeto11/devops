<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { cancelActiveJob, deleteDLQJob, getActiveJobs, getAuditTrail, getDLQJobs, getJobById, removeActiveJob, requeueDLQJob } from '../services/api.js';
import ConfirmDialog from '../components/sicat/SicatConfirmDialog.vue';
import { useConfirmDialog } from '../composables/useConfirmDialog.js';
import { formatDateTimeBr } from '../utils/date-format.js';
import SicatPageLayout from '../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../components/shell/SicatPageHeader.vue';
import SicatStatusBadge from '../components/sicat/SicatStatusBadge.vue';

const jobs = ref([]);
const dlqJobs = ref([]);
const activeStats = ref(null);
const loading = ref(false);
const loadingActive = ref(false);
const loadingDlq = ref(false);
const isRefreshing = ref(false);
const error = ref('');
const activeLoadError = ref('');
const dlqLoadError = ref('');
const lastUpdated = ref('');
const lastRefreshDurationMs = ref(0);

const endpointHealth = ref({
  active: 'unknown',
  dlq: 'unknown',
  audit: 'unknown'
});

const autoRefreshEnabled = ref(true);
const autoRefreshIntervalMs = ref(5000);
let pollInterval = null;

const activeTab = ref('active');
const expandedJobId = ref('');

const lookupJobId = ref('');
const lookupResult = ref(null);
const lookupError = ref('');
const lookupLoading = ref(false);

const activeSearch = ref('');
const activeStatusFilter = ref('all');
const activeOperationFilter = ref('all');
const activeSort = ref('age_desc');
const activePage = ref(1);
const activePageSize = ref(20);

const dlqSearch = ref('');
const dlqSort = ref('moved_desc');
const dlqPage = ref(1);
const dlqPageSize = ref(10);

const detailByJobId = ref({});
const detailLoadingJobId = ref('');
const detailErrorByJobId = ref({});
const traceFeedback = ref('');

const auditCorrelationId = ref('');
const auditEntries = ref([]);
const auditLoading = ref(false);
const auditError = ref('');
const auditFilterManifestSearch = ref(true);
const auditCopyFeedback = ref('');

const activeActionLoading = ref('');
const activeFeedback = ref('');
const activeFeedbackError = ref('');
const dlqActionLoading = ref('');
const dlqFeedback = ref('');
const dlqFeedbackError = ref('');

const {
  dialogVisible,
  dialogTitle,
  dialogMessage,
  dialogConfirmLabel,
  dialogCancelLabel,
  dialogDanger,
  dialogShowCancel,
  confirm,
  accept,
  cancel
} = useConfirmDialog();

const stats = computed(() => ({
  queued: activeStats.value?.queued ?? jobs.value.filter((item) => item.status === 'queued').length,
  running: activeStats.value?.running ?? jobs.value.filter((item) => item.status === 'running').length,
  retryWait: activeStats.value?.retry_wait ?? jobs.value.filter((item) => item.status === 'retry_wait').length,
  dlq: dlqJobs.value.length
}));

const activeOperations = computed(() => {
  const set = new Set(jobs.value.map((job) => String(job.operation || '').trim()).filter(Boolean));
  return [...set].sort((left, right) => left.localeCompare(right, 'pt-BR'));
});

const filteredActiveJobs = computed(() => {
  const query = activeSearch.value.trim().toLowerCase();
  let filtered = jobs.value.filter((job) => {
    if (activeStatusFilter.value !== 'all' && job.status !== activeStatusFilter.value) {
      return false;
    }

    if (activeOperationFilter.value !== 'all' && String(job.operation || '') !== activeOperationFilter.value) {
      return false;
    }

    if (!query) return true;

    const candidate = [
      job.job_id,
      job.operation,
      job.entity_type,
      job.entity_id,
      job.correlation_id,
      job.command_id,
      job.last_error_code,
      job.last_error_message
    ]
      .map((part) => String(part || '').toLowerCase())
      .join(' ');

    return candidate.includes(query);
  });

  filtered = [...filtered].sort((left, right) => {
    const getTime = (value) => new Date(value || 0).getTime();

    if (activeSort.value === 'queued_desc') return getTime(right.queued_at) - getTime(left.queued_at);
    if (activeSort.value === 'queued_asc') return getTime(left.queued_at) - getTime(right.queued_at);
    if (activeSort.value === 'age_asc') return (left.age_seconds ?? 0) - (right.age_seconds ?? 0);
    if (activeSort.value === 'attempts_desc') return (right.attempts ?? 0) - (left.attempts ?? 0);

    return (right.age_seconds ?? 0) - (left.age_seconds ?? 0);
  });

  return filtered;
});

const activeTotalPages = computed(() => Math.max(1, Math.ceil(filteredActiveJobs.value.length / activePageSize.value)));
const activePagedJobs = computed(() => {
  const page = Math.min(activePage.value, activeTotalPages.value);
  const start = (page - 1) * activePageSize.value;
  return filteredActiveJobs.value.slice(start, start + activePageSize.value);
});

const filteredDlqJobs = computed(() => {
  const query = dlqSearch.value.trim().toLowerCase();
  let filtered = dlqJobs.value.filter((job) => {
    if (!query) return true;
    const candidate = [job.job_id, job.operation, job.entity_type, job.entity_id, job.reason, job.dlq_reason]
      .map((part) => String(part || '').toLowerCase())
      .join(' ');
    return candidate.includes(query);
  });

  filtered = [...filtered].sort((left, right) => {
    const leftTs = new Date(left.moved_at || 0).getTime();
    const rightTs = new Date(right.moved_at || 0).getTime();
    return dlqSort.value === 'moved_asc' ? leftTs - rightTs : rightTs - leftTs;
  });

  return filtered;
});

const dlqTotalPages = computed(() => Math.max(1, Math.ceil(filteredDlqJobs.value.length / dlqPageSize.value)));
const dlqPagedJobs = computed(() => {
  const page = Math.min(dlqPage.value, dlqTotalPages.value);
  const start = (page - 1) * dlqPageSize.value;
  return filteredDlqJobs.value.slice(start, start + dlqPageSize.value);
});

const filteredAuditEntries = computed(() => {
  const source = auditFilterManifestSearch.value
    ? auditEntries.value.filter((entry) => String(entry?.entityType || '').toLowerCase() === 'manifest.search')
    : auditEntries.value;

  return [...source].sort((left, right) => {
    const leftTs = new Date(left?.occurredAt || 0).getTime();
    const rightTs = new Date(right?.occurredAt || 0).getTime();
    return rightTs - leftTs;
  });
});

watch([activeSearch, activeStatusFilter, activeOperationFilter, activeSort, activePageSize], () => {
  activePage.value = 1;
});

watch([dlqSearch, dlqSort, dlqPageSize], () => {
  dlqPage.value = 1;
});

watch(activeTotalPages, (pages) => {
  if (activePage.value > pages) activePage.value = pages;
});

watch(dlqTotalPages, (pages) => {
  if (dlqPage.value > pages) dlqPage.value = pages;
});

watch([autoRefreshEnabled, autoRefreshIntervalMs], () => {
  restartPolling();
});

function formatAge(seconds) {
  if (seconds == null) return '-';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  return `${Math.floor(seconds / 3600)}h`;
}

function formatTs(iso) {
  if (!iso) return '-';
  return formatDateTimeBr(iso);
}

function endpointClass(state) {
  if (state === 'ok') return 'is-ok';
  if (state === 'error') return 'is-error';
  return 'is-unknown';
}

async function copyText(value) {
  const text = String(value || '').trim();
  if (!text) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    temp.style.position = 'absolute';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    temp.remove();
    return true;
  } catch {
    return false;
  }
}

async function copyTrace(value, label) {
  const ok = await copyText(value);
  traceFeedback.value = ok ? `${label} copiado para a área de transferência.` : `Falha ao copiar ${label}.`;
}

function buildCurlFromAuditEntry(entry) {
  const method = String(entry?.httpMethod || 'GET').toUpperCase();
  const url = String(entry?.endpoint || entry?.sanitizedBody?.searchPath || '').trim();
  if (!url) return '';

  return `curl "${url}" -X ${method} -H "Accept: application/json"`;
}

async function copyAuditEndpoint(entry) {
  const value = String(entry?.endpoint || entry?.sanitizedBody?.searchPath || '').trim();
  if (!value) {
    auditCopyFeedback.value = 'Sem endpoint/path para copiar nesta entrada.';
    return;
  }

  const ok = await copyText(value);
  auditCopyFeedback.value = ok
    ? 'Endpoint/path copiado para a área de transferência.'
    : 'Falha ao copiar endpoint/path.';
}

async function copyAuditCurl(entry) {
  const command = buildCurlFromAuditEntry(entry);
  if (!command) {
    auditCopyFeedback.value = 'Sem dados suficientes para gerar cURL nesta entrada.';
    return;
  }

  const ok = await copyText(command);
  auditCopyFeedback.value = ok
    ? 'Comando cURL copiado para a área de transferência.'
    : 'Falha ao copiar cURL.';
}

function mergeActiveJobs(apiJobs = []) {
  if (!Array.isArray(apiJobs) || apiJobs.length === 0) {
    jobs.value = jobs.value.filter((item) => item._fromLookup);
    return;
  }

  for (const apiJob of apiJobs) {
    const index = jobs.value.findIndex((item) => item.job_id === apiJob.job_id);
    if (index >= 0) {
      jobs.value[index] = { ...jobs.value[index], ...apiJob, _fromLookup: false };
    } else {
      jobs.value.push({ ...apiJob, _fromLookup: false });
    }
  }

  const apiIds = new Set(apiJobs.map((item) => item.job_id));
  jobs.value = jobs.value.filter((item) => apiIds.has(item.job_id) || item._fromLookup);
}

async function loadActiveJobs(silent = false) {
  if (!silent) loadingActive.value = true;
  try {
    const data = await getActiveJobs();
    activeStats.value = data;
    mergeActiveJobs(data.jobs || []);
    activeLoadError.value = '';
    endpointHealth.value.active = 'ok';
    return true;
  } catch (err) {
    activeLoadError.value = err.message || 'Falha ao carregar jobs ativos.';
    endpointHealth.value.active = 'error';
    return false;
  } finally {
    loadingActive.value = false;
  }
}

async function loadDLQJobs(silent = false) {
  if (!silent) loadingDlq.value = true;
  try {
    const data = await getDLQJobs();
    dlqJobs.value = data.jobs || [];
    dlqLoadError.value = '';
    endpointHealth.value.dlq = 'ok';
    return true;
  } catch (err) {
    dlqLoadError.value = err.message || 'Falha ao carregar DLQ.';
    endpointHealth.value.dlq = 'error';
    return false;
  } finally {
    loadingDlq.value = false;
  }
}

async function refreshAll(silent = false) {
  if (isRefreshing.value && silent) return;

  isRefreshing.value = true;
  if (!silent) loading.value = true;

  const startedAt = performance.now();
  const [activeOk, dlqOk] = await Promise.all([loadActiveJobs(silent), loadDLQJobs(silent)]);

  if (!activeOk && !dlqOk) {
    error.value = 'Falha ao atualizar endpoints de jobs/health. Exibindo último snapshot local.';
  } else if (!activeOk || !dlqOk) {
    error.value = 'Atualização parcial: um dos endpoints de jobs/health falhou. Dados parciais exibidos.';
  } else {
    error.value = '';
  }

  lastUpdated.value = formatDateTimeBr(new Date().toISOString());
  lastRefreshDurationMs.value = Math.max(0, Math.round(performance.now() - startedAt));
  loading.value = false;
  isRefreshing.value = false;
}

function startPolling() {
  if (!autoRefreshEnabled.value) return;
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    refreshAll(true);
  }, autoRefreshIntervalMs.value);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function restartPolling() {
  stopPolling();
  startPolling();
}

function clearActiveFilters() {
  activeSearch.value = '';
  activeStatusFilter.value = 'all';
  activeOperationFilter.value = 'all';
  activeSort.value = 'age_desc';
  activePage.value = 1;
}

function clearDlqFilters() {
  dlqSearch.value = '';
  dlqSort.value = 'moved_desc';
  dlqPage.value = 1;
}

function applyStatusFilter(status) {
  activeStatusFilter.value = status;
  activeTab.value = 'active';
}

async function loadAudit(correlationId) {
  const id = String(correlationId || '').trim();
  if (!id) {
    auditError.value = 'Informe um Correlation ID válido para consultar auditoria.';
    auditEntries.value = [];
    return;
  }

  auditLoading.value = true;
  auditError.value = '';
  auditCopyFeedback.value = '';
  auditEntries.value = [];
  auditCorrelationId.value = id;

  try {
    const audit = await getAuditTrail(id);
    auditEntries.value = Array.isArray(audit?.entries) ? audit.entries : [];
    endpointHealth.value.audit = 'ok';
  } catch (err) {
    endpointHealth.value.audit = 'error';
    auditError.value = err.message || 'Falha ao consultar auditoria.';
    auditEntries.value = [];
  } finally {
    auditLoading.value = false;
  }
}

async function searchJob() {
  const id = lookupJobId.value.trim();
  if (!id) {
    lookupError.value = 'Informe um Job ID.';
    return;
  }

  lookupLoading.value = true;
  lookupError.value = '';
  lookupResult.value = null;

  try {
    const data = await getJobById(id);
    lookupResult.value = data;
    detailByJobId.value = { ...detailByJobId.value, [data.jobId]: data };

    const index = jobs.value.findIndex((job) => job.job_id === data.jobId);
    const normalized = {
      job_id: data.jobId,
      command_id: data.commandId || null,
      operation: data.operation,
      entity_type: data.entityType,
      entity_id: data.entityId,
      status: data.status,
      attempts: data.attempts,
      max_attempts: data.maxAttempts,
      correlation_id: data.correlationId,
      queued_at: data.queuedAt || data.createdAt,
      claimed_at: data.startedAt || null,
      next_retry_at: data.nextRetryAt || null,
      last_error_code: data.lastErrorCode,
      last_error_message: data.lastErrorMessage,
      age_seconds: null,
      _fromLookup: true
    };

    if (index >= 0) jobs.value[index] = { ...jobs.value[index], ...normalized };
    else jobs.value.unshift(normalized);

    expandedJobId.value = normalized.job_id;
    lookupJobId.value = '';
  } catch (err) {
    lookupError.value = err.message || 'Job não encontrado.';
  } finally {
    lookupLoading.value = false;
  }
}

async function ensureJobDetails(jobId) {
  if (!jobId || detailByJobId.value[jobId]) return;

  detailLoadingJobId.value = jobId;
  detailErrorByJobId.value = { ...detailErrorByJobId.value, [jobId]: '' };

  try {
    const data = await getJobById(jobId);
    detailByJobId.value = { ...detailByJobId.value, [jobId]: data };

    const index = jobs.value.findIndex((job) => job.job_id === jobId);
    if (index >= 0) {
      jobs.value[index] = {
        ...jobs.value[index],
        command_id: data.commandId || jobs.value[index].command_id,
        correlation_id: data.correlationId || jobs.value[index].correlation_id,
        queued_at: data.queuedAt || jobs.value[index].queued_at,
        last_error_code: data.lastErrorCode || jobs.value[index].last_error_code,
        last_error_message: data.lastErrorMessage || jobs.value[index].last_error_message
      };
    }
  } catch (err) {
    detailErrorByJobId.value = {
      ...detailErrorByJobId.value,
      [jobId]: err.message || 'Falha ao carregar detalhes do job.'
    };
  } finally {
    detailLoadingJobId.value = '';
  }
}

function toggleExpand(jobId) {
  if (expandedJobId.value === jobId) {
    expandedJobId.value = '';
    return;
  }

  expandedJobId.value = jobId;
  ensureJobDetails(jobId);
}

async function loadAuditFromJob(job) {
  const id = String(job?.correlation_id || detailByJobId.value[job?.job_id]?.correlationId || '').trim();
  if (!id) {
    auditError.value = 'Job sem correlation_id para consulta de auditoria.';
    return;
  }

  await loadAudit(id);
}

async function cancelQueuedJob(job) {
  if (!job?.job_id) return;

  const confirmed = await confirm({
    title: 'Cancelar job',
    message: `Cancelar job ${job.job_id}?`,
    confirmLabel: 'Cancelar job',
    danger: true
  });
  if (!confirmed) return;

  activeActionLoading.value = job.job_id;
  activeFeedback.value = '';
  activeFeedbackError.value = '';

  try {
    await cancelActiveJob(job.job_id, 'Cancelled manually from Jobs monitor');
    activeFeedback.value = `Job ${job.job_id} cancelado com sucesso.`;
    jobs.value = jobs.value.filter((item) => item.job_id !== job.job_id);
    await refreshAll(true);
  } catch (err) {
    activeFeedbackError.value = err.message || 'Falha ao cancelar job ativo.';
  } finally {
    activeActionLoading.value = '';
  }
}

async function removeQueuedJob(job) {
  if (!job?.job_id) return;

  const confirmed = await confirm({
    title: 'Remover job da fila',
    message: `Remover job ${job.job_id} da fila?`,
    confirmLabel: 'Remover job',
    danger: true
  });
  if (!confirmed) return;

  activeActionLoading.value = job.job_id;
  activeFeedback.value = '';
  activeFeedbackError.value = '';

  try {
    await removeActiveJob(job.job_id);
    activeFeedback.value = `Job ${job.job_id} removido da fila.`;
    jobs.value = jobs.value.filter((item) => item.job_id !== job.job_id);
    await refreshAll(true);
  } catch (err) {
    activeFeedbackError.value = err.message || 'Falha ao remover job da fila.';
  } finally {
    activeActionLoading.value = '';
  }
}

async function requeueJob(jobId) {
  dlqActionLoading.value = jobId;
  dlqFeedback.value = '';
  dlqFeedbackError.value = '';

  try {
    await requeueDLQJob(jobId);
    dlqFeedback.value = `Job ${jobId} recolocado na fila com sucesso.`;
    await refreshAll(true);
  } catch (err) {
    dlqFeedbackError.value = err.message || 'Falha ao recolocar job na fila.';
  } finally {
    dlqActionLoading.value = '';
  }
}

async function discardJob(jobId) {
  const confirmed = await confirm({
    title: 'Descartar job da DLQ',
    message: `Descartar permanentemente o job ${jobId}? Esta ação não pode ser desfeita.`,
    confirmLabel: 'Descartar',
    danger: true
  });
  if (!confirmed) return;

  dlqActionLoading.value = jobId;
  dlqFeedback.value = '';
  dlqFeedbackError.value = '';

  try {
    await deleteDLQJob(jobId);
    dlqFeedback.value = `Job ${jobId} descartado.`;
    dlqJobs.value = dlqJobs.value.filter((job) => job.job_id !== jobId);
  } catch (err) {
    dlqFeedbackError.value = err.message || 'Falha ao descartar job.';
  } finally {
    dlqActionLoading.value = '';
  }
}

onMounted(() => {
  refreshAll();
  startPolling();
});

onUnmounted(() => {
  stopPolling();
});
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        title="Monitoramento de Jobs"
        description="Fila ativa, DLQ e trilha de auditoria com rastreabilidade por jobId, commandId e correlationId."
      >
        <template #actions>
          <v-chip size="small" :color="autoRefreshEnabled ? 'success' : undefined" variant="tonal">
            {{ autoRefreshEnabled ? `Auto-refresh ${autoRefreshIntervalMs / 1000}s` : 'Auto-refresh desligado' }}
          </v-chip>
          <span v-if="lastUpdated" class="text-caption text-medium-emphasis">Atualizado {{ lastUpdated }} · {{ lastRefreshDurationMs }} ms</span>
        </template>
      </SicatPageHeader>
    </template>

          <!-- KPIs clicáveis -->
          <v-row class="mb-4">
            <v-col cols="6" sm="3">
              <v-card class="cursor-pointer" @click="applyStatusFilter('queued')">
                <v-card-text class="text-center">
                  <div class="text-caption text-medium-emphasis">Aguardando</div>
                  <div class="text-h4 font-weight-bold text-warning">{{ stats.queued }}</div>
                </v-card-text>
              </v-card>
            </v-col>
            <v-col cols="6" sm="3">
              <v-card class="cursor-pointer" @click="applyStatusFilter('running')">
                <v-card-text class="text-center">
                  <div class="text-caption text-medium-emphasis">Executando</div>
                  <div class="text-h4 font-weight-bold text-primary">{{ stats.running }}</div>
                </v-card-text>
              </v-card>
            </v-col>
            <v-col cols="6" sm="3">
              <v-card class="cursor-pointer" @click="applyStatusFilter('retry_wait')">
                <v-card-text class="text-center">
                  <div class="text-caption text-medium-emphasis">Retry</div>
                  <div class="text-h4 font-weight-bold text-info">{{ stats.retryWait }}</div>
                </v-card-text>
              </v-card>
            </v-col>
            <v-col cols="6" sm="3">
              <v-card class="cursor-pointer" @click="activeTab = 'dlq'">
                <v-card-text class="text-center">
                  <div class="text-caption text-medium-emphasis">DLQ</div>
                  <div class="text-h4 font-weight-bold text-error">{{ stats.dlq }}</div>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
          <!-- Controles de refresh -->
          <v-card class="mb-4">
            <v-card-text>
              <v-row align="center" dense>
                <v-col cols="12" sm="auto" class="d-flex flex-wrap ga-2">
                  <v-chip :color="endpointClass(endpointHealth.active) === 'endpoint-ok' ? 'success' : 'error'" size="small" variant="tonal">/v1/health/jobs/active</v-chip>
                  <v-chip :color="endpointClass(endpointHealth.dlq) === 'endpoint-ok' ? 'success' : 'error'" size="small" variant="tonal">/v1/health/jobs/dlq</v-chip>
                  <v-chip :color="endpointClass(endpointHealth.audit) === 'endpoint-ok' ? 'success' : 'error'" size="small" variant="tonal">/v1/audit/:correlationId</v-chip>
                </v-col>
                <v-spacer />
                <v-col cols="auto" class="d-flex align-center ga-3">
                  <v-checkbox-btn v-model="autoRefreshEnabled" label="Auto-refresh" density="compact" />
                  <v-select
                    v-model.number="autoRefreshIntervalMs"
                    :items="[{title:'5s',value:5000},{title:'10s',value:10000},{title:'15s',value:15000},{title:'30s',value:30000}]"
                    item-title="title"
                    item-value="value"
                    density="compact"
                    style="max-width:90px"
                    :disabled="!autoRefreshEnabled"
                  />
                  <v-btn variant="outlined" size="small" :loading="loading || isRefreshing" prepend-icon="mdi-refresh" @click="refreshAll()">
                    Atualizar
                  </v-btn>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>
          <v-alert v-if="error" type="error" variant="tonal" class="mb-3" density="compact">{{ error }}</v-alert>
          <v-alert v-if="traceFeedback" type="success" variant="tonal" class="mb-3" density="compact">{{ traceFeedback }}</v-alert>
          <!-- Consulta por Job ID -->
          <v-card class="mb-4">
            <v-card-text>
              <div class="text-subtitle-2 mb-2">Consultar Job por ID</div>
              <div class="d-flex ga-2 align-start">
                <v-text-field v-model="lookupJobId" placeholder="job_xxxxxxxxxxxxxxxx" density="compact" hide-details style="max-width:340px" @keyup.enter="searchJob" />
                <v-btn color="primary" size="small" :loading="lookupLoading" @click="searchJob">Consultar</v-btn>
              </div>
              <v-alert v-if="lookupError" type="error" variant="tonal" density="compact" class="mt-2">{{ lookupError }}</v-alert>
              <v-card v-if="lookupResult" variant="outlined" class="mt-3">
                <v-card-text>
                  <div class="d-flex align-center ga-2 mb-2">
                    <strong>{{ lookupResult.jobId }}</strong>
                    <SicatStatusBadge :status="lookupResult.status" domain="job" with-dot />
                  </div>
                  <v-row dense>
                    <v-col cols="12" sm="6"><span class="text-medium-emphasis">Operação:</span> {{ lookupResult.operation }}</v-col>
                    <v-col cols="12" sm="6"><span class="text-medium-emphasis">Entidade:</span> {{ lookupResult.entityType }} / {{ lookupResult.entityId }}</v-col>
                    <v-col cols="12" sm="6"><span class="text-medium-emphasis">Tentativas:</span> {{ lookupResult.attempts }} / {{ lookupResult.maxAttempts }}</v-col>
                    <v-col cols="12" sm="6"><span class="text-medium-emphasis">Command ID:</span> <code>{{ lookupResult.commandId || '-' }}</code></v-col>
                    <v-col cols="12"><span class="text-medium-emphasis">Correlation ID:</span> <code>{{ lookupResult.correlationId || '-' }}</code></v-col>
                  </v-row>
                  <div class="d-flex ga-2 mt-2">
                    <v-btn size="small" variant="outlined" :disabled="!lookupResult.commandId" @click="copyTrace(lookupResult.commandId, 'Command ID')">Copiar commandId</v-btn>
                    <v-btn size="small" variant="outlined" :disabled="!lookupResult.correlationId" @click="copyTrace(lookupResult.correlationId, 'Correlation ID')">Copiar correlationId</v-btn>
                  </div>
                  <v-alert v-if="lookupResult.lastErrorMessage" type="error" variant="tonal" density="compact" class="mt-2">
                    <strong>{{ lookupResult.lastErrorCode }}</strong> — {{ lookupResult.lastErrorMessage }}
                  </v-alert>
                </v-card-text>
              </v-card>
            </v-card-text>
          </v-card>
          <!-- Auditoria por Correlation ID -->
          <v-card class="mb-4">
            <v-card-text>
              <div class="text-subtitle-2 mb-2">Auditoria por Correlation ID</div>
              <div class="d-flex flex-wrap ga-2 align-center mb-2">
                <v-text-field v-model="auditCorrelationId" placeholder="frontend_xxxxx ou corr_xxxxx" density="compact" hide-details style="max-width:340px" @keyup.enter="loadAudit(auditCorrelationId)" />
                <v-btn color="primary" size="small" :loading="auditLoading" @click="loadAudit(auditCorrelationId)">Consultar auditoria</v-btn>
                <v-checkbox-btn v-model="auditFilterManifestSearch" density="compact">
                  <template #label>Somente <code class="mx-1">manifest.search</code></template>
                </v-checkbox-btn>
              </div>
              <v-alert v-if="auditError" type="error" variant="tonal" density="compact" class="mb-2">{{ auditError }}</v-alert>
              <v-alert v-if="auditCopyFeedback" type="success" variant="tonal" density="compact" class="mb-2">{{ auditCopyFeedback }}</v-alert>
              <div v-if="auditCorrelationId && !auditLoading" class="text-caption text-medium-emphasis mb-2">
                {{ filteredAuditEntries.length }} entrada(s) exibida(s) para {{ auditCorrelationId }}
              </div>
              <v-table v-if="filteredAuditEntries.length" density="compact">
                <thead>
                  <tr>
                    <th scope="col">Quando</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Componente</th>
                    <th scope="col">Status</th>
                    <th scope="col">Endpoint</th>
                    <th scope="col">Resultado</th>
                    <th scope="col">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(entry, index) in filteredAuditEntries" :key="`${entry.occurredAt}-${index}`">
                    <td>{{ formatTs(entry.occurredAt) }}</td>
                    <td><code>{{ entry.entityType || '-' }}</code></td>
                    <td>{{ entry.component || '-' }}</td>
                    <td>{{ entry.httpStatus || '-' }}</td>
                    <td>{{ entry.endpoint || entry.sanitizedBody?.searchPath || '-' }}</td>
                    <td>{{ entry.sanitizedBody?.resultCount ?? '-' }}</td>
                    <td>
                      <div class="d-flex ga-1">
                        <v-btn size="x-small" variant="outlined" @click="copyAuditEndpoint(entry)">Path</v-btn>
                        <v-btn size="x-small" variant="outlined" @click="copyAuditCurl(entry)">cURL</v-btn>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </v-card-text>
          </v-card>

          <!-- Tabs: Fila ativa / DLQ -->
          <v-card>
            <v-tabs v-model="activeTab" color="primary">
              <v-tab value="active">Fila ativa ({{ jobs.length }})</v-tab>
              <v-tab value="dlq">DLQ ({{ dlqJobs.length }})</v-tab>
            </v-tabs>
            <v-divider />
            <!-- Fila ativa -->
            <v-window v-model="activeTab">
              <v-window-item value="active">
                <v-card-text class="pb-0">
                  <v-row dense align="center">
                    <v-col cols="12" sm="4">
                      <v-text-field v-model="activeSearch" placeholder="Filtrar por jobId, commandId, entidade..." density="compact" hide-details prepend-inner-icon="mdi-magnify" clearable />
                    </v-col>
                    <v-col cols="6" sm="2">
                      <v-select v-model="activeStatusFilter" :items="[{title:'Todos status',value:'all'},{title:'Aguardando',value:'queued'},{title:'Executando',value:'running'},{title:'Retry wait',value:'retry_wait'}]" item-title="title" item-value="value" density="compact" hide-details />
                    </v-col>
                    <v-col cols="6" sm="2">
                      <v-select v-model="activeOperationFilter" :items="[{title:'Todas operações',value:'all'}, ...activeOperations.map(o=>({title:o,value:o}))]" item-title="title" item-value="value" density="compact" hide-details />
                    </v-col>
                    <v-col cols="6" sm="2">
                      <v-select v-model="activeSort" :items="[{title:'Mais antigos',value:'age_desc'},{title:'Mais novos',value:'age_asc'},{title:'Enfileirados recentes',value:'queued_desc'},{title:'Enfileirados antigos',value:'queued_asc'},{title:'Mais tentativas',value:'attempts_desc'}]" item-title="title" item-value="value" density="compact" hide-details />
                    </v-col>
                    <v-col cols="6" sm="1">
                      <v-select v-model.number="activePageSize" :items="[{title:'10',value:10},{title:'20',value:20},{title:'50',value:50}]" item-title="title" item-value="value" density="compact" hide-details />
                    </v-col>
                    <v-col cols="auto">
                      <v-btn size="small" variant="text" @click="clearActiveFilters">Limpar</v-btn>
                    </v-col>
                  </v-row>
                </v-card-text>
                <v-alert v-if="activeLoadError" type="error" variant="tonal" density="compact" class="mx-4 mb-2">{{ activeLoadError }}</v-alert>
                <v-alert v-if="activeFeedback" type="success" variant="tonal" density="compact" class="mx-4 mb-2">{{ activeFeedback }}</v-alert>
                <v-alert v-if="activeFeedbackError" type="error" variant="tonal" density="compact" class="mx-4 mb-2">{{ activeFeedbackError }}</v-alert>
                <v-table density="compact">
                  <thead>
                    <tr>
                      <th scope="col">Job ID</th>
                      <th scope="col">Operação</th>
                      <th scope="col">Entidade</th>
                      <th scope="col">Tentativas</th>
                      <th scope="col">Idade</th>
                      <th scope="col">Status</th>
                      <th scope="col">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="loadingActive && !jobs.length">
                      <td colspan="7" class="text-center text-medium-emphasis pa-4">Carregando jobs ativos…</td>
                    </tr>
                    <tr v-else-if="!filteredActiveJobs.length">
                      <td colspan="7" class="text-center text-medium-emphasis pa-4">Nenhum job encontrado.</td>
                    </tr>
                    <template v-for="job in activePagedJobs" :key="job.job_id">
                      <tr>
                        <td class="font-weight-medium" style="font-family:monospace;font-size:0.8em">{{ job.job_id }}</td>
                        <td>{{ job.operation || '-' }}</td>
                        <td>
                          <div>{{ job.entity_type }}</div>
                          <div class="text-caption text-medium-emphasis">{{ job.entity_id }}</div>
                        </td>
                        <td>{{ job.attempts }} / {{ job.max_attempts }}</td>
                        <td>{{ formatAge(job.age_seconds) }}</td>
                        <td>
                          <SicatStatusBadge :status="job.status" domain="job" with-dot />
                        </td>
                        <td>
                          <div class="d-flex ga-1 flex-wrap">
                            <v-btn size="x-small" variant="text" :icon="expandedJobId === job.job_id ? 'mdi-chevron-up' : 'mdi-chevron-down'" @click="toggleExpand(job.job_id)" />
                            <v-btn size="x-small" variant="outlined" :disabled="!job.correlation_id" @click="loadAuditFromJob(job)">Audit</v-btn>
                            <v-btn size="x-small" color="warning" variant="tonal" :disabled="activeActionLoading === job.job_id || job.status === 'running'" :loading="activeActionLoading === job.job_id" @click="cancelQueuedJob(job)">Cancelar</v-btn>
                            <v-btn size="x-small" color="error" variant="tonal" :disabled="activeActionLoading === job.job_id || job.status === 'running'" :loading="activeActionLoading === job.job_id" @click="removeQueuedJob(job)">Remover</v-btn>
                          </div>
                        </td>
                      </tr>
                      <tr v-if="expandedJobId === job.job_id">
                        <td colspan="7" class="bg-surface-variant pa-3">
                          <v-row dense>
                            <v-col cols="12" sm="6"><strong>Job ID:</strong> <code>{{ job.job_id }}</code></v-col>
                            <v-col cols="12" sm="6"><strong>Command ID:</strong> <code>{{ detailByJobId[job.job_id]?.commandId || job.command_id || '-' }}</code></v-col>
                            <v-col cols="12" sm="6"><strong>Correlation ID:</strong> <code>{{ detailByJobId[job.job_id]?.correlationId || job.correlation_id || '-' }}</code></v-col>
                            <v-col cols="12" sm="6"><strong>Enfileirado em:</strong> {{ formatTs(job.queued_at) }}</v-col>
                            <v-col cols="12" sm="6"><strong>Próximo retry:</strong> {{ formatTs(job.next_retry_at) }}</v-col>
                            <v-col cols="12" sm="6"><strong>Entidade:</strong> {{ detailByJobId[job.job_id]?.entityType || job.entity_type }} / {{ detailByJobId[job.job_id]?.entityId || job.entity_id }}</v-col>
                          </v-row>
                          <div class="d-flex ga-2 mt-2">
                            <v-btn size="small" variant="outlined" :disabled="!(detailByJobId[job.job_id]?.commandId || job.command_id)" @click="copyTrace(detailByJobId[job.job_id]?.commandId || job.command_id, 'Command ID')">Copiar commandId</v-btn>
                            <v-btn size="small" variant="outlined" :disabled="!(detailByJobId[job.job_id]?.correlationId || job.correlation_id)" @click="copyTrace(detailByJobId[job.job_id]?.correlationId || job.correlation_id, 'Correlation ID')">Copiar correlationId</v-btn>
                          </div>
                          <div v-if="detailLoadingJobId === job.job_id" class="text-caption text-medium-emphasis mt-1">Carregando detalhes…</div>
                          <v-alert v-if="detailErrorByJobId[job.job_id]" type="error" variant="tonal" density="compact" class="mt-2">{{ detailErrorByJobId[job.job_id] }}</v-alert>
                          <v-alert v-if="job.last_error_code" type="error" variant="tonal" density="compact" class="mt-2">
                            <strong>{{ job.last_error_code }}</strong> — {{ job.last_error_message }}
                          </v-alert>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </v-table>
                <v-card-text class="d-flex align-center justify-space-between pt-3">
                  <span class="text-caption text-medium-emphasis">{{ filteredActiveJobs.length }} job(s) filtrado(s)</span>
                  <div class="d-flex align-center ga-2">
                    <v-btn size="small" variant="outlined" :disabled="activePage <= 1" prepend-icon="mdi-chevron-left" @click="activePage = Math.max(1, activePage - 1)">Anterior</v-btn>
                    <span class="text-caption">{{ activePage }} / {{ activeTotalPages }}</span>
                    <v-btn size="small" variant="outlined" :disabled="activePage >= activeTotalPages" append-icon="mdi-chevron-right" @click="activePage = Math.min(activeTotalPages, activePage + 1)">Próxima</v-btn>
                  </div>
                </v-card-text>
              </v-window-item>
              <!-- DLQ -->
              <v-window-item value="dlq">
                <v-card-text class="pb-0">
                  <v-row dense align="center">
                    <v-col cols="12" sm="5">
                      <v-text-field v-model="dlqSearch" placeholder="Filtrar DLQ por jobId, entidade, motivo..." density="compact" hide-details prepend-inner-icon="mdi-magnify" clearable />
                    </v-col>
                    <v-col cols="6" sm="2">
                      <v-select v-model="dlqSort" :items="[{title:'Mais recentes',value:'moved_desc'},{title:'Mais antigos',value:'moved_asc'}]" item-title="title" item-value="value" density="compact" hide-details />
                    </v-col>
                    <v-col cols="6" sm="1">
                      <v-select v-model.number="dlqPageSize" :items="[{title:'10',value:10},{title:'20',value:20},{title:'50',value:50}]" item-title="title" item-value="value" density="compact" hide-details />
                    </v-col>
                    <v-col cols="auto">
                      <v-btn size="small" variant="text" @click="clearDlqFilters">Limpar</v-btn>
                    </v-col>
                  </v-row>
                </v-card-text>
                <v-alert v-if="dlqLoadError" type="error" variant="tonal" density="compact" class="mx-4 mb-2">{{ dlqLoadError }}</v-alert>
                <v-alert v-if="dlqFeedback" type="success" variant="tonal" density="compact" class="mx-4 mb-2">{{ dlqFeedback }}</v-alert>
                <v-alert v-if="dlqFeedbackError" type="error" variant="tonal" density="compact" class="mx-4 mb-2">{{ dlqFeedbackError }}</v-alert>
                <v-table density="compact">
                  <thead>
                    <tr>
                      <th scope="col">Job ID</th>
                      <th scope="col">Operação</th>
                      <th scope="col">Entidade</th>
                      <th scope="col">Movido para DLQ</th>
                      <th scope="col">Motivo</th>
                      <th scope="col">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="loadingDlq && !dlqJobs.length">
                      <td colspan="6" class="text-center text-medium-emphasis pa-4">Carregando DLQ…</td>
                    </tr>
                    <tr v-else-if="!filteredDlqJobs.length">
                      <td colspan="6" class="text-center text-medium-emphasis pa-4">Nenhum item na DLQ.</td>
                    </tr>
                    <tr v-for="job in dlqPagedJobs" :key="job.job_id">
                      <td style="font-family:monospace;font-size:0.8em">{{ job.job_id }}</td>
                      <td>{{ job.operation }}</td>
                      <td>
                        <div>{{ job.entity_type }}</div>
                        <div class="text-caption text-medium-emphasis">{{ job.entity_id }}</div>
                      </td>
                      <td>{{ formatTs(job.moved_at) }}</td>
                      <td class="text-error text-caption">{{ job.reason || '-' }}</td>
                      <td>
                        <div class="d-flex ga-1">
                          <v-btn size="x-small" color="primary" variant="tonal" :loading="dlqActionLoading === job.job_id" @click="requeueJob(job.job_id)">Reprocessar</v-btn>
                          <v-btn size="x-small" color="error" variant="tonal" :loading="dlqActionLoading === job.job_id" @click="discardJob(job.job_id)">Descartar</v-btn>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </v-table>
                <v-card-text class="d-flex align-center justify-space-between pt-3">
                  <span class="text-caption text-medium-emphasis">{{ filteredDlqJobs.length }} job(s) na DLQ</span>
                  <div class="d-flex align-center ga-2">
                    <v-btn size="small" variant="outlined" :disabled="dlqPage <= 1" prepend-icon="mdi-chevron-left" @click="dlqPage = Math.max(1, dlqPage - 1)">Anterior</v-btn>
                    <span class="text-caption">{{ dlqPage }} / {{ dlqTotalPages }}</span>
                    <v-btn size="small" variant="outlined" :disabled="dlqPage >= dlqTotalPages" append-icon="mdi-chevron-right" @click="dlqPage = Math.min(dlqTotalPages, dlqPage + 1)">Próxima</v-btn>
                  </div>
                </v-card-text>
              </v-window-item>
            </v-window>
          </v-card>
          <ConfirmDialog
            :visible="dialogVisible"
            :title="dialogTitle"
            :message="dialogMessage"
            :confirm-label="'Confirmar'"
            :cancel-label="dialogCancelLabel"
            :show-cancel="dialogShowCancel"
            :danger="dialogDanger"
            @confirm="accept"
            @cancel="cancel"
            @close="cancel"
          />
  </SicatPageLayout>
</template>

<style scoped>
.jobs-hero-main {
  display: grid;
  gap: 10px;
}

.jobs-kicker,
.session-kicker,
.access-admin-kicker,
.access-admin-kicker-muted {
  display: inline-flex;
  width: fit-content;
  min-height: 30px;
  align-items: center;
  padding: 0 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface) 90%);
  color: var(--color-primary);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.jobs-hero-meta-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.jobs-hero-side {
  display: grid;
}

.jobs-hero-panel {
  border-radius: 24px;
  padding: 20px;
  background: var(--gradient-primary);
  color: var(--color-primary-contrast);
  display: grid;
  gap: 8px;
}

.jobs-panel-label {
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  opacity: 0.82;
}

.jobs-hero-panel strong {
  font-size: 1.8rem;
  font-family: var(--font-family-display);
}

.jobs-section-card {
  overflow: hidden;
}

.jobs-meta-text {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.jobs-metrics :deep(.sicat-metric) {
  border-color: color-mix(in srgb, var(--color-border) 62%, transparent 38%);
  background: linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 96%, white 4%) 0%, color-mix(in srgb, var(--color-surface-raised) 24%, var(--color-surface) 76%) 100%);
}

.jobs-metric-click {
  cursor: pointer;
}

.jobs-metric-click:hover {
  transform: translateY(-1px);
}

.jobs-ops-bar {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  flex-wrap: wrap;
}

.jobs-endpoints {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.jobs-endpoint-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  padding: 4px 10px;
  font-size: 0.74rem;
  font-family: var(--font-family-mono);
}

.jobs-endpoint-chip.is-ok {
  background: color-mix(in srgb, var(--color-success) 12%, var(--color-surface) 88%);
  color: var(--color-success);
}

.jobs-endpoint-chip.is-error {
  background: color-mix(in srgb, var(--color-error) 12%, var(--color-surface) 88%);
  color: var(--color-error);
}

.jobs-endpoint-chip.is-unknown {
  background: color-mix(in srgb, var(--color-text-muted) 10%, var(--color-surface) 90%);
  color: var(--color-text-muted);
}

.jobs-refresh-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.jobs-inline-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.jobs-select-inline {
  min-width: 108px;
  max-width: 150px;
  min-height: 40px;
  padding: 8px 10px;
}

.jobs-lookup {
  display: grid;
  gap: 12px;
}

.jobs-card-title {
  margin: 0;
}

.jobs-lookup-result {
  background: var(--color-surface-raised);
  border: none;
}

.jobs-audit-card {
  display: grid;
  gap: 12px;
}

.jobs-audit-actions {
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.jobs-lookup-grid {
  display: grid;
  gap: 6px;
  font-size: 0.85rem;
}

.jobs-trace-header {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.jobs-trace-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.jobs-muted {
  color: var(--color-text-muted);
}

.jobs-audit-count {
  font-size: 0.82rem;
}

.jobs-table-wrapper {
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 10px;
}

.jobs-endpoint-cell {
  font-size: 0.76rem;
  max-width: 420px;
  word-break: break-all;
}

.jobs-inline-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.jobs-inline-actions-right {
  justify-content: flex-end;
}

.jobs-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent 30%);
  padding-bottom: 2px;
}

.jobs-tab-button {
  border-radius: 12px 12px 0 0;
}

.jobs-tab-spacer {
  flex: 1;
}

.jobs-toolbar {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  border-bottom: 1px solid var(--color-border);
}

.jobs-input-grow {
  flex: 1;
  min-width: 260px;
}

.jobs-table-shell {
  padding: 0;
  overflow: auto;
}

.jobs-mono {
  font-family: var(--font-family-mono);
  font-size: 0.78rem;
}

.jobs-job-id {
  word-break: break-all;
  max-width: 260px;
}

.jobs-entity-cell {
  font-size: 0.8rem;
}

.jobs-attempts-cell {
  text-align: center;
}

.jobs-expanded-row {
  background: var(--color-surface-raised);
  padding: 8px 12px;
}

.jobs-expanded-grid {
  display: grid;
  gap: 6px;
  font-size: 0.82rem;
}

.jobs-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid var(--color-border);
}

.jobs-pagination-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.jobs-error-card {
  border-color: color-mix(in srgb, var(--color-error) 42%, var(--color-border) 58%);
  background: color-mix(in srgb, var(--color-error) 12%, var(--color-surface) 88%);
}

.jobs-error-text {
  color: var(--color-error);
}

.jobs-error-inline {
  color: var(--color-error);
  font-size: 0.85rem;
}

.jobs-success-inline {
  color: var(--color-success);
  font-size: 0.85rem;
}

.jobs-feedback {
  padding: 10px 14px;
  font-size: 0.85rem;
}

.jobs-feedback-success {
  background: color-mix(in srgb, var(--color-success) 14%, var(--color-surface) 86%);
  color: var(--color-success);
}

.jobs-feedback-error {
  background: color-mix(in srgb, var(--color-error) 12%, var(--color-surface) 88%);
  color: var(--color-error);
}

.jobs-action-warn {
  font-size: 0.78rem;
  color: var(--color-warning);
}

.jobs-action-danger {
  font-size: 0.78rem;
  color: var(--color-error);
}

@media (max-width: 900px) {
  .jobs-hero {
    grid-template-columns: 1fr;
  }

  .jobs-pagination {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
