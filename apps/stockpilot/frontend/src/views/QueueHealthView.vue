<!--
  QueueHealthView — Saúde da fila (observabilidade do processamento assíncrono)
  Âncoras: REQ-STOCKPILOT-0001 (worker resiliente), REQ-STOCKPILOT-0003 (reposição assíncrona).

  Contrato de UI (specs/forge/ui-kit-contract.md): SÓ componentes do kit (../ui/index.js),
  SÓ tokens --ui-* em CSS, SEM style inline / :style / v-html, TODOS os estados
  (loading/empty/error/normal), SÓ endpoints REAIS via ../api.js, ação destrutiva via useConfirm,
  toast em sucesso/erro, responsivo + a11y.

  Endpoints REAIS consumidos:
    GET  /v1/health/jobs            → profundidade da fila { jobs: { queued, running, done, dlq } }
    GET  /health                    → readiness da API/worker { status, db }
    GET  /v1/alerts                 → DLQ = falhas de envio ao fornecedor (alert_type 'ERROR',
                                       carregam last_error/last_attempt_at) + RUPTURA
    POST /v1/products/:id/reorder   → reenfileira o item (idempotente; dedup devolve o mesmo recurso)

  Links de domínio: /products, /orders, /alerts (só rotas reais do inventário).
-->
<template>
  <UiPageLayout
    eyebrow="Operação"
    title="Saúde da fila"
    subtitle="Observabilidade do processamento assíncrono: profundidade por status, itens em DLQ e readiness do worker resiliente."
    width="wide"
    :loading="firstLoad && pending"
    loading-message="Sondando a fila e a readiness…"
    :error="fatalError"
    @retry="() => loadAll(false)"
  >
    <!-- Ações: refresh manual + RefreshControl (auto-atualização) -->
    <template #actions>
      <label class="qh-auto" :data-on="autoRefresh ? 'true' : 'false'">
        <input
          class="qh-auto-input"
          type="checkbox"
          :checked="autoRefresh"
          :aria-label="autoAriaLabel"
          @change="toggleAuto"
        />
        <span class="qh-auto-pulse" aria-hidden="true" />
        <span class="qh-auto-text">Auto ({{ AUTO_SECS }}s)</span>
        <span class="qh-auto-state" aria-hidden="true">{{ autoRefresh ? 'ligado' : 'desligado' }}</span>
      </label>
      <UiButton variant="ghost" :loading="refreshing" @click="() => loadAll(true)">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton variant="subtle" to="/orders">Ver pedidos</UiButton>
    </template>

    <!-- Banner de readiness sempre visível (a cor nunca é o único sinal: há rótulo + texto) -->
    <template #banner>
      <div class="qh-banner" :data-state="readinessState" role="status" aria-live="polite">
        <span class="qh-banner-orb" :data-state="readinessState" aria-hidden="true" />
        <div class="qh-banner-copy">
          <p class="qh-banner-title">{{ readinessHeadline }}</p>
          <p class="qh-banner-sub">{{ readinessSubline }}</p>
        </div>
        <div class="qh-banner-meta">
          <UiStatusBadge :status="apiBadgeStatus" :label="apiBadgeLabel" size="lg" />
          <span class="qh-banner-time ui-muted">{{ lastUpdatedLabel }}</span>
        </div>
      </div>
    </template>

    <!-- ===================== Profundidade da fila (QueueDepthGauge) ===================== -->
    <UiCard title="Profundidade da fila" subtitle="Itens por status na fila transacional (jobs).">
      <template #actions>
        <UiStatusBadge
          :status="backlog > 0 ? 'pending' : 'done'"
          :label="backlog > 0 ? (backlog + ' em espera') : 'Sem backlog'"
        />
      </template>

      <UiLoadingState v-if="jobsLoading && !hasJobsData" variant="skeleton" :skeleton-lines="4" />

      <UiErrorState
        v-else-if="jobsError && !hasJobsData"
        :message="jobsError"
        @retry="loadJobs"
      />

      <UiEmptyState
        v-else-if="totalJobs === 0"
        icon="inbox"
        title="Fila vazia"
        description="Nenhum job registrado ainda. Os jobs aparecem quando uma reposição é disparada."
      >
        <template #action><UiButton to="/products">Ver produtos</UiButton></template>
      </UiEmptyState>

      <div v-else class="qh-gauges" role="list" aria-label="Profundidade da fila por status">
        <div
          v-for="g in gauges"
          :key="g.key"
          class="qh-gauge"
          :data-tone="g.tone"
          role="listitem"
        >
          <div class="qh-gauge-head">
            <span class="qh-gauge-dot" :data-tone="g.tone" aria-hidden="true" />
            <span class="qh-gauge-label">{{ g.label }}</span>
            <span class="qh-gauge-value">{{ format.formatNumber(g.value) }}</span>
          </div>
          <div
            class="qh-gauge-track"
            role="progressbar"
            :aria-label="g.label + ': ' + g.value + ' de ' + totalJobs"
            :aria-valuenow="g.value"
            aria-valuemin="0"
            :aria-valuemax="totalJobs"
          >
            <span class="qh-gauge-fill" :data-tone="g.tone" :data-w="g.bucket" />
          </div>
          <p class="qh-gauge-hint">{{ g.hint }}</p>
        </div>
      </div>

      <template #footer>
        <span class="ui-muted qh-foot-line">
          Total de {{ format.formatNumber(totalJobs) }} jobs. A fila usa <code class="ui-mono">FOR UPDATE SKIP LOCKED</code>
          com retry/backoff; ao esgotar tentativas o job vai para a <strong>DLQ</strong>.
        </span>
      </template>
    </UiCard>

    <!-- ===================== KPIs operacionais ===================== -->
    <section class="qh-kpis" aria-label="Indicadores da fila">
      <UiMetricCard
        label="Aguardando (queued)"
        :value="metricValue('queued')"
        tone="warning"
        hint="Jobs esperando um worker livre."
        :loading="jobsLoading && !hasJobsData"
      />
      <UiMetricCard
        label="Em execução (running)"
        :value="metricValue('running')"
        tone="running"
        hint="Sendo processados agora."
        :loading="jobsLoading && !hasJobsData"
      />
      <UiMetricCard
        label="Concluídos (done)"
        :value="metricValue('done')"
        tone="success"
        hint="Entregues com sucesso."
        :loading="jobsLoading && !hasJobsData"
      />
      <UiMetricCard
        label="Em DLQ (dlq)"
        :value="metricValue('dlq')"
        :tone="dlqCount > 0 ? 'error' : 'neutral'"
        :hint="dlqCount > 0 ? 'Exigem atenção — reprocesse abaixo.' : 'Nenhuma falha esgotada.'"
        clickable
        @click="scrollToDlq"
      />
    </section>

    <!-- ===================== DLQ (DlqTable) ===================== -->
    <UiCard
      ref="dlqCardEl"
      title="Dead-letter queue (DLQ)"
      subtitle="Reposições cuja submissão ao fornecedor esgotou as tentativas. Reprocesse para tentar de novo."
    >
      <template #actions>
        <UiStatusBadge
          :status="dlqRows.length > 0 ? 'error' : 'done'"
          :label="dlqRows.length > 0 ? (dlqRows.length + ' com falha') : 'Tudo entregue'"
          size="lg"
        />
      </template>

      <UiDataTable
        :columns="dlqColumns"
        :rows="dlqRows"
        row-key="id"
        density="comfortable"
        :loading="alertsLoading && !alertsLoaded"
        :error="alertsError && !alertsLoaded ? alertsError : null"
        :empty="dlqEmpty"
        :sort="dlqSort"
        @update:sort="(s) => (dlqSort = s)"
        @retry="loadAlerts"
      >
        <template #cell-name="{ row }">
          <div class="qh-cell-name">
            <strong class="qh-cell-prod">{{ row.name || ('Produto #' + row.id) }}</strong>
            <span class="qh-cell-sku ui-muted">#{{ row.id }}</span>
          </div>
        </template>

        <template #cell-stock="{ row }">
          <span class="qh-stock" :data-low="row.current_stock < row.min_stock ? 'true' : 'false'">
            {{ format.formatNumber(row.current_stock) }}
            <span class="qh-stock-min ui-muted">/ mín {{ format.formatNumber(row.min_stock) }}</span>
          </span>
        </template>

        <template #cell-last_error="{ value }">
          <span class="qh-err ui-mono" :title="value || ''">{{ value || '—' }}</span>
        </template>

        <template #cell-last_attempt_at="{ value }">
          {{ format.formatDateTime(value) }}
        </template>

        <template #cell-actions="{ row }">
          <div class="qh-row-actions">
            <UiButton
              variant="ghost"
              size="sm"
              :to="'/products/' + row.id"
            >Ver produto</UiButton>
            <UiButton
              variant="primary"
              size="sm"
              :loading="retryingId === row.id"
              :disabled="retryingId !== null && retryingId !== row.id"
              @click="confirmRetry(row)"
            >Reprocessar</UiButton>
          </div>
        </template>

        <template #empty-action>
          <UiButton to="/alerts">Ver alertas</UiButton>
        </template>
      </UiDataTable>

      <template #footer>
        <span class="ui-muted qh-foot-line">
          Itens em DLQ correspondem a pedidos marcados <UiStatusBadge status="failed" label="failed" size="sm" />
          com <code class="ui-mono">last_error</code>. Reprocessar reabre a reposição (idempotente: se já houver
          pedido aberto, devolve o mesmo).
        </span>
      </template>
    </UiCard>

    <!-- ===================== Rodapé de contexto ===================== -->
    <template #footer>
      <div class="qh-page-foot">
        <span>
          Diagnóstico do worker resiliente — REQ-STOCKPILOT-0001 · REQ-STOCKPILOT-0003.
        </span>
        <span class="qh-foot-links">
          <UiButton variant="ghost" size="sm" to="/products">Produtos</UiButton>
          <UiButton variant="ghost" size="sm" to="/orders">Pedidos</UiButton>
          <UiButton variant="ghost" size="sm" to="/alerts">Alertas</UiButton>
        </span>
      </div>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiStatusBadge,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  UiButton,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import { resourceFactory, health } from '../api.js';

const toast = useToast();
const askConfirm = useConfirm();

// --- Recursos de DOMÍNIO (rotas REAIS sob /v1; sem inventar endpoint) --------
const jobsResource = resourceFactory('health/jobs');         // GET /v1/health/jobs
const alertsResource = resourceFactory('alerts');            // GET /v1/alerts
const reorderProduct = (id) => resourceFactory('products/' + id + '/reorder').create({}); // POST /v1/products/:id/reorder

const AUTO_SECS = 15;
const STATUSES = ['queued', 'running', 'done', 'dlq'];

// Normaliza tanto { data:[...] } quanto array cru.
function rowsOf(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  return [];
}
// O wrapper de list() embrulha respostas não-coleção em { data: <obj> }.
function jobsOf(res) {
  if (!res) return {};
  if (res.jobs) return res.jobs;
  if (res.data && res.data.jobs) return res.data.jobs;
  return {};
}

// --- Estado global (cada fonte isolada: falha de uma não derruba as demais) ---
const firstLoad = ref(true);
const refreshing = ref(false);
const fatalError = ref(null);
const lastUpdated = ref(null);
const autoRefresh = ref(false);
let autoTimer = null;

// fila
const jobs = ref({});
const jobsLoading = ref(false);
const jobsError = ref(null);

// DLQ / alertas
const alertsList = ref([]);
const alertsLoading = ref(false);
const alertsError = ref(null);
const alertsLoaded = ref(false);
const dlqSort = ref({ key: 'last_attempt_at', dir: 'desc' });

// readiness
const apiOnline = ref(false);
const dbConnected = ref(false);
const healthLoading = ref(false);

// ações
const retryingId = ref(null);
const dlqCardEl = ref(null);

// --- Derivados: fila --------------------------------------------------------
const hasJobsData = computed(() => Object.keys(jobs.value || {}).length > 0);
const jobCount = (k) => Number(jobs.value && jobs.value[k]) || 0;
const totalJobs = computed(() => STATUSES.reduce((sum, k) => sum + jobCount(k), 0));
const backlog = computed(() => jobCount('queued') + jobCount('running'));
const dlqCount = computed(() => jobCount('dlq'));
const pending = computed(() => jobsLoading.value || alertsLoading.value || healthLoading.value);

const metricValue = (k) => (hasJobsData.value ? format.formatNumber(jobCount(k)) : '—');

// Buckets de largura discretos (0..10) → classe CSS (sem :style; CSP-safe).
function bucket(value) {
  const t = totalJobs.value;
  if (!t || value <= 0) return 0;
  return Math.min(10, Math.max(1, Math.round((value / t) * 10)));
}

const GAUGE_META = {
  queued: { label: 'Aguardando', tone: 'warning', hint: 'Esperando um worker livre.' },
  running: { label: 'Em execução', tone: 'running', hint: 'Sendo processados agora.' },
  done: { label: 'Concluídos', tone: 'success', hint: 'Entregues com sucesso.' },
  dlq: { label: 'Dead-letter (DLQ)', tone: 'error', hint: 'Falhas esgotadas — exigem reprocessamento.' },
};
const gauges = computed(() =>
  STATUSES.map((key) => {
    const value = jobCount(key);
    return { key, value, bucket: bucket(value), ...GAUGE_META[key] };
  })
);

// --- Derivados: readiness ---------------------------------------------------
const readinessState = computed(() => {
  if (!apiOnline.value) return 'down';
  if (!dbConnected.value) return 'degraded';
  if (dlqCount.value > 0) return 'attention';
  return 'up';
});
const readinessHeadline = computed(() => {
  switch (readinessState.value) {
    case 'down': return 'API/worker indisponível';
    case 'degraded': return 'Operando em modo degradado';
    case 'attention': return 'Operacional — itens em DLQ';
    default: return 'Tudo operacional';
  }
});
const readinessSubline = computed(() => {
  switch (readinessState.value) {
    case 'down': return 'A sonda de readiness falhou. Verifique a conexão com a API.';
    case 'degraded': return 'A API respondeu, mas o banco não está conectado.';
    case 'attention': return dlqCount.value + ' job(s) em DLQ aguardam reprocessamento.';
    default: return 'API e banco conectados; nenhuma falha esgotada na fila.';
  }
});
const apiBadgeStatus = computed(() => (apiOnline.value ? (dbConnected.value ? 'ok' : 'warning') : 'error'));
const apiBadgeLabel = computed(() => (apiOnline.value ? (dbConnected.value ? 'API online' : 'API sem banco') : 'API offline'));

const lastUpdatedLabel = computed(() =>
  lastUpdated.value ? 'Atualizado ' + format.formatDateTime(lastUpdated.value) : 'Ainda não atualizado'
);

// a11y: o estado on/off do auto-refresh é comunicado por TEXTO (não só por cor/animação).
const autoAriaLabel = computed(() =>
  autoRefresh.value
    ? 'Auto-atualização LIGADA, a cada ' + AUTO_SECS + ' segundos. Desmarque para parar.'
    : 'Auto-atualização DESLIGADA. Marque para atualizar a cada ' + AUTO_SECS + ' segundos.'
);

// --- Derivados: DLQ (falhas de envio = alert_type 'ERROR' com last_error) ----
const dlqRows = computed(() =>
  (alertsList.value || []).filter((a) => a && a.alert_type === 'ERROR' && a.last_error)
);
const dlqColumns = [
  { key: 'name', label: 'Produto', sortable: true },
  { key: 'stock', label: 'Estoque', align: 'right' },
  { key: 'last_error', label: 'Último erro' },
  { key: 'last_attempt_at', label: 'Última tentativa', sortable: true },
  { key: 'actions', label: '', align: 'right' },
];
const dlqEmpty = {
  icon: 'check',
  title: 'Nenhum item em DLQ',
  description: 'Todas as reposições foram entregues ao fornecedor. Nada a reprocessar.',
};

// --- Carregadores (cada um fail-soft e isolado) -----------------------------
async function loadJobs() {
  jobsLoading.value = true; jobsError.value = null;
  try {
    jobs.value = jobsOf(await jobsResource.list());
  } catch (e) {
    jobsError.value = e.message || 'Falha ao carregar a profundidade da fila.';
    jobs.value = {};
  } finally {
    jobsLoading.value = false;
  }
}

async function loadAlerts() {
  alertsLoading.value = true; alertsError.value = null;
  try {
    alertsList.value = rowsOf(await alertsResource.list());
    alertsLoaded.value = true;
  } catch (e) {
    alertsError.value = e.message || 'Falha ao carregar as falhas de envio (DLQ).';
    alertsList.value = [];
  } finally {
    alertsLoading.value = false;
  }
}

async function loadHealth() {
  healthLoading.value = true;
  try {
    const r = await health();
    apiOnline.value = true;
    dbConnected.value = !r || r.db === undefined ? true : r.db === 'connected';
  } catch {
    apiOnline.value = false;
    dbConnected.value = false;
  } finally {
    healthLoading.value = false;
  }
}

async function loadAll(isRefresh = false) {
  if (isRefresh) refreshing.value = true;
  fatalError.value = null;
  try {
    await Promise.allSettled([loadHealth(), loadJobs(), loadAlerts()]);
    lastUpdated.value = new Date();
    // Fatal só quando NADA carregou — falha visível em vez de "tudo zero" enganoso.
    if (jobsError.value && alertsError.value && !apiOnline.value) {
      fatalError.value = 'Não foi possível obter a saúde da fila. Verifique a conexão com a API.';
    } else if (isRefresh) {
      toast.success('Saúde da fila atualizada.');
    }
  } catch (e) {
    fatalError.value = e.message || 'Erro inesperado ao carregar a saúde da fila.';
    if (isRefresh) toast.error('Falha ao atualizar a saúde da fila.');
  } finally {
    firstLoad.value = false;
    refreshing.value = false;
  }
}

// --- Auto-refresh (RefreshControl) ------------------------------------------
function stopAuto() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
}
function toggleAuto(e) {
  autoRefresh.value = !!(e && e.target && e.target.checked);
  stopAuto();
  if (autoRefresh.value) {
    autoTimer = setInterval(() => { if (!refreshing.value) loadAll(false); }, AUTO_SECS * 1000);
    toast.info('Auto-atualização ligada (' + AUTO_SECS + 's).');
  }
}

// --- Ação: reprocessar item da DLQ (idempotente) ----------------------------
async function confirmRetry(row) {
  const name = row.name || ('produto #' + row.id);
  const ok = await askConfirm({
    title: 'Reprocessar reposição?',
    message: 'Vamos reenfileirar a reposição de "' + name + '" para nova submissão ao fornecedor. '
      + 'A operação é idempotente: se já houver um pedido aberto, ele será reaproveitado.',
    confirmLabel: 'Reprocessar',
    cancelLabel: 'Cancelar',
  });
  if (!ok) return;

  retryingId.value = row.id;
  try {
    const res = await reorderProduct(row.id);
    if (res && res.deduped) {
      toast.info('Já havia uma reposição aberta para "' + name + '" — reaproveitada.');
    } else {
      toast.success('Reposição de "' + name + '" reenfileirada.');
    }
    await Promise.allSettled([loadJobs(), loadAlerts()]);
    lastUpdated.value = new Date();
  } catch (e) {
    toast.error(e.message || 'Não foi possível reprocessar a reposição.');
  } finally {
    retryingId.value = null;
  }
}

// --- Navegação suave até a DLQ a partir do KPI ------------------------------
function scrollToDlq() {
  const host = dlqCardEl.value && dlqCardEl.value.$el;
  if (host && typeof host.scrollIntoView === 'function') {
    host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

onMounted(() => loadAll(false));
onBeforeUnmount(stopAuto);
</script>

<style scoped>
/* ============================ Banner de readiness ============================ */
.qh-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4) var(--ui-space-5);
  border: 1px solid rgb(var(--ui-border));
  border-left: 4px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
  flex-wrap: wrap;
}
.qh-banner[data-state="up"] { border-left-color: rgb(var(--ui-ok)); }
.qh-banner[data-state="attention"] { border-left-color: rgb(var(--ui-warn)); }
.qh-banner[data-state="degraded"] { border-left-color: rgb(var(--ui-warn)); }
.qh-banner[data-state="down"] { border-left-color: rgb(var(--ui-danger)); }

.qh-banner-orb {
  width: 14px; height: 14px; border-radius: 50%;
  flex-shrink: 0;
  background: rgb(var(--ui-muted));
  box-shadow: 0 0 0 4px rgb(var(--ui-muted) / 0.16);
}
.qh-banner-orb[data-state="up"] {
  background: rgb(var(--ui-ok));
  box-shadow: 0 0 0 4px rgb(var(--ui-ok) / 0.18);
  animation: qh-breathe 2.6s ease-in-out infinite;
}
.qh-banner-orb[data-state="attention"],
.qh-banner-orb[data-state="degraded"] {
  background: rgb(var(--ui-warn));
  box-shadow: 0 0 0 4px rgb(var(--ui-warn) / 0.18);
}
.qh-banner-orb[data-state="down"] {
  background: rgb(var(--ui-danger));
  box-shadow: 0 0 0 4px rgb(var(--ui-danger) / 0.2);
  animation: qh-pulse 1.3s ease-in-out infinite;
}
.qh-banner-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 240px; }
.qh-banner-title { margin: 0; font-weight: 700; font-family: var(--ui-font-display); }
.qh-banner-sub { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.qh-banner-meta { display: flex; flex-direction: column; align-items: flex-end; gap: var(--ui-space-1); margin-left: auto; }
.qh-banner-time { font-size: var(--ui-text-xs); }

/* ============================ RefreshControl (auto) ============================ */
.qh-auto {
  display: inline-flex; align-items: center; gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-pill);
  font-size: var(--ui-text-sm); font-weight: 600;
  color: rgb(var(--ui-fg));
  cursor: pointer; user-select: none;
  transition: border-color .15s ease, background .15s ease;
}
.qh-auto[data-on="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.1);
  color: rgb(var(--ui-accent-strong));
}
.qh-auto-input { width: 14px; height: 14px; accent-color: rgb(var(--ui-accent)); cursor: pointer; }
.qh-auto-pulse { width: 8px; height: 8px; border-radius: 50%; background: rgb(var(--ui-muted)); }
.qh-auto[data-on="true"] .qh-auto-pulse {
  background: rgb(var(--ui-accent));
  animation: qh-pulse 1.4s ease-in-out infinite;
}
.qh-auto-text { white-space: nowrap; }
.qh-auto-state {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-muted));
}
.qh-auto[data-on="true"] .qh-auto-state { color: rgb(var(--ui-accent-strong)); }

/* ============================ QueueDepthGauge ============================ */
.qh-gauges {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-4);
}
.qh-gauge {
  display: flex; flex-direction: column; gap: var(--ui-space-2);
  padding: var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.qh-gauge-head { display: flex; align-items: baseline; gap: var(--ui-space-2); }
.qh-gauge-dot { width: 9px; height: 9px; border-radius: 50%; background: rgb(var(--ui-muted)); flex-shrink: 0; align-self: center; }
.qh-gauge-dot[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.qh-gauge-dot[data-tone="running"] { background: rgb(var(--ui-accent)); }
.qh-gauge-dot[data-tone="success"] { background: rgb(var(--ui-ok)); }
.qh-gauge-dot[data-tone="error"] { background: rgb(var(--ui-danger)); }
.qh-gauge-label { font-weight: 600; font-size: var(--ui-text-sm); }
.qh-gauge-value {
  margin-left: auto;
  font-family: var(--ui-font-display);
  font-size: 1.5rem; font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.qh-gauge-track {
  height: 10px; border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-border));
  overflow: hidden;
}
.qh-gauge-fill {
  display: block; height: 100%;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted));
  width: 0;
  transition: width .5s cubic-bezier(.22, 1, .36, 1);
}
.qh-gauge-fill[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.qh-gauge-fill[data-tone="running"] { background: rgb(var(--ui-accent)); }
.qh-gauge-fill[data-tone="success"] { background: rgb(var(--ui-ok)); }
.qh-gauge-fill[data-tone="error"] { background: rgb(var(--ui-danger)); }
/* larguras discretas via data-w (CSP-safe; sem :style) */
.qh-gauge-fill[data-w="0"] { width: 3%; }
.qh-gauge-fill[data-w="1"] { width: 10%; }
.qh-gauge-fill[data-w="2"] { width: 20%; }
.qh-gauge-fill[data-w="3"] { width: 30%; }
.qh-gauge-fill[data-w="4"] { width: 40%; }
.qh-gauge-fill[data-w="5"] { width: 50%; }
.qh-gauge-fill[data-w="6"] { width: 60%; }
.qh-gauge-fill[data-w="7"] { width: 70%; }
.qh-gauge-fill[data-w="8"] { width: 80%; }
.qh-gauge-fill[data-w="9"] { width: 90%; }
.qh-gauge-fill[data-w="10"] { width: 100%; }
.qh-gauge-hint { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }

/* ============================ KPIs ============================ */
.qh-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* ============================ Células da DLQ ============================ */
.qh-cell-name { display: flex; flex-direction: column; gap: 1px; }
.qh-cell-prod { font-weight: 600; }
.qh-cell-sku { font-size: var(--ui-text-xs); }
.qh-stock { font-variant-numeric: tabular-nums; font-weight: 600; }
.qh-stock[data-low="true"] { color: rgb(var(--ui-danger)); }
.qh-stock-min { font-weight: 400; font-size: var(--ui-text-xs); margin-left: var(--ui-space-1); }
.qh-err {
  display: inline-block;
  max-width: 32ch;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-danger));
  vertical-align: bottom;
}
.qh-row-actions { display: inline-flex; gap: var(--ui-space-2); justify-content: flex-end; flex-wrap: wrap; }

/* ============================ Rodapés ============================ */
.qh-foot-line { font-size: var(--ui-text-sm); }
.qh-foot-line code { font-size: var(--ui-text-xs); }
.qh-page-foot {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--ui-space-3); flex-wrap: wrap;
  font-size: var(--ui-text-sm);
}
.qh-foot-links { display: inline-flex; gap: var(--ui-space-2); flex-wrap: wrap; }

/* ============================ Animações ============================ */
@keyframes qh-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .35; }
}
@keyframes qh-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.18); }
}
@media (prefers-reduced-motion: reduce) {
  .qh-banner-orb, .qh-auto[data-on="true"] .qh-auto-pulse { animation: none !important; }
  .qh-gauge-fill { transition: none !important; }
}

/* ============================ Responsivo ============================ */
@media (max-width: 860px) {
  .qh-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .qh-gauges { grid-template-columns: 1fr; }
  .qh-banner-meta { align-items: flex-start; margin-left: 0; }
  .qh-err { max-width: 20ch; }
}
@media (max-width: 540px) {
  .qh-kpis { grid-template-columns: 1fr; }
}
</style>
