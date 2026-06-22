<!-- SystemHealthView — Painel de observabilidade do ShopDesk.
     Lê SÓ endpoints reais: GET /health e GET /v1/health/jobs (via api.js, resolvidos
     defensivamente). CSP-safe (estado visual por class/data-attr), tokens --ui-* apenas,
     todos os estados (loading/empty/error/normal), a11y e responsivo.
     Âncoras: REQ-SHOPDESK-0001, REQ-SHOPDESK-0004. -->
<template>
  <UiPageLayout
    eyebrow="ShopDesk · Operação"
    title="Saúde do sistema"
    subtitle="Banco, workers e fila de processamento, com latência da sonda e contadores acumulados da fila em um só painel."
    width="wide"
    :loading="firstLoad"
    loading-message="Sondando banco, fila e workers…"
    :error="fatalError"
    @retry="loadAll"
  >
    <!-- ===================== Ações ===================== -->
    <template #actions>
      <span class="sh-auto" role="status">
        <span class="sh-auto-dot" :data-on="autoRefresh ? 'true' : 'false'" aria-hidden="true" />
        <button
          type="button"
          class="sh-auto-btn"
          :aria-pressed="autoRefresh ? 'true' : 'false'"
          @click="toggleAuto"
        >
          {{ autoRefresh ? 'Auto a cada 15s' : 'Auto pausado' }}
        </button>
      </span>
      <UiButton variant="ghost" size="sm" :loading="refreshing" @click="loadAll(true)">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton :href="grafanaUrl" variant="subtle" size="sm">
        <template #icon-left><span aria-hidden="true">📊</span></template>
        Abrir no Grafana
      </UiButton>
    </template>

    <!-- ===================== Banner geral / DlqAlert ===================== -->
    <template #banner>
      <!-- DlqAlert: prioridade máxima quando a DLQ não está vazia -->
      <div v-if="dlq > 0" class="sh-alert" data-tone="error" role="alert">
        <span class="sh-alert-ic" aria-hidden="true">⛔</span>
        <div class="sh-alert-body">
          <p class="sh-alert-title">
            {{ dlq }} {{ dlq === 1 ? 'tarefa parou' : 'tarefas pararam' }} na fila de erros (DLQ)
          </p>
          <p class="sh-alert-desc">
            Itens na <abbr title="Dead Letter Queue — fila de mensagens mortas">DLQ</abbr>
            esgotaram as tentativas e exigem ação manual. Investigue a causa antes de reprocessar.
          </p>
        </div>
        <UiButton :href="grafanaDlqUrl" variant="danger" size="sm">Ver no Grafana</UiButton>
      </div>

      <!-- Pulso geral do sistema -->
      <div class="sh-pulse" :data-tone="overall.tone" role="status">
        <span class="sh-pulse-dot" aria-hidden="true" />
        <span class="sh-pulse-text">
          <strong>{{ overall.title }}</strong>
          <span class="ui-muted"> · {{ overall.detail }}</span>
        </span>
        <span v-if="lastUpdatedLabel" class="sh-pulse-time ui-muted">
          Atualizado {{ lastUpdatedLabel }}
        </span>
      </div>
    </template>

    <!-- ===================== HealthCards ===================== -->
    <section class="sh-cards" aria-label="Estado dos componentes">
      <article
        v-for="c in healthCards"
        :key="c.key"
        class="sh-card"
        :data-tone="c.tone"
      >
        <div class="sh-card-top">
          <span class="sh-card-ic" aria-hidden="true">{{ c.icon }}</span>
          <UiStatusBadge :status="c.badgeStatus" :tone="c.tone" :label="c.badgeLabel" size="sm" />
        </div>
        <p class="sh-card-label">{{ c.label }}</p>
        <p class="sh-card-value">
          <span v-if="probing && c.live" class="ui-muted">…</span>
          <span v-else>{{ c.value }}</span>
        </p>
        <p class="sh-card-hint ui-muted">{{ c.hint }}</p>
      </article>
    </section>

    <!-- ===================== Grid principal ===================== -->
    <div class="sh-grid">
      <!-- ---------- QueueDepthChart ---------- -->
      <UiCard title="Profundidade da fila" subtitle="Tarefas por estágio do pipeline de jobs">
        <template #actions>
          <UiStatusBadge
            v-if="!jobsLoading && !jobsError"
            :status="dlq > 0 ? 'dlq' : (inFlight > 0 ? 'running' : 'ok')"
            :label="dlq > 0 ? 'Atenção' : (inFlight > 0 ? 'Em fluxo' : 'Ocioso')"
          />
        </template>

        <UiLoadingState v-if="jobsLoading" variant="skeleton" :skeleton-lines="5" />
        <UiErrorState
          v-else-if="jobsError"
          :message="jobsError"
          @retry="loadJobs"
        />
        <UiEmptyState
          v-else-if="jobsTotal === 0"
          icon="🗂"
          title="Fila vazia"
          description="Nenhuma tarefa registrada ainda. Assim que houver processamento, os estágios aparecem aqui."
        />

        <div v-else class="sh-queue">
          <!-- barras (SVG puro, sem style inline; alturas/cores por classe+atributo) -->
          <ul class="sh-bars" role="img" :aria-label="queueAriaLabel">
            <li v-for="b in queueBars" :key="b.key" class="sh-bar-col">
              <span class="sh-bar-count">{{ format.formatNumber(b.value) }}</span>
              <span class="sh-bar-track">
                <span
                  class="sh-bar-fill"
                  :data-tone="b.tone"
                  :data-pct="b.bucket"
                />
              </span>
              <span class="sh-bar-label">{{ b.label }}</span>
            </li>
          </ul>

          <!-- legenda / leituras -->
          <dl class="sh-queue-stats">
            <div class="sh-stat">
              <dt>Total</dt>
              <dd>{{ format.formatNumber(jobsTotal) }}</dd>
            </div>
            <div class="sh-stat">
              <dt>Em voo</dt>
              <dd>{{ format.formatNumber(inFlight) }}</dd>
            </div>
            <div class="sh-stat" :data-warn="backlog > backlogWarn ? 'true' : null">
              <dt>Backlog</dt>
              <dd>{{ format.formatNumber(backlog) }}</dd>
            </div>
            <div class="sh-stat" :data-err="dlq > 0 ? 'true' : null">
              <dt>DLQ</dt>
              <dd>{{ format.formatNumber(dlq) }}</dd>
            </div>
          </dl>
        </div>
      </UiCard>

      <!-- ---------- SloPanel ---------- -->
      <UiCard title="Indicadores" subtitle="Latência instantânea da sonda + contadores acumulados da fila">
        <template #actions>
          <UiStatusBadge :status="sloOverallTone" :tone="sloOverallTone" :label="sloOverallLabel" />
        </template>

        <UiLoadingState v-if="firstLoad" variant="skeleton" :skeleton-lines="4" />
        <UiErrorState
          v-else-if="!apiReachable && jobsError"
          message="Sem sinais suficientes para calcular SLOs — a API não respondeu."
          @retry="loadAll"
        />

        <ul v-else class="sh-slos">
          <li v-for="s in slos" :key="s.key" class="sh-slo">
            <div class="sh-slo-head">
              <span class="sh-slo-name">{{ s.label }}</span>
              <span class="sh-slo-value" :data-tone="s.tone">{{ s.display }}</span>
            </div>
            <div class="sh-slo-meter" role="presentation">
              <span class="sh-slo-bar" :data-tone="s.tone" :data-pct="s.bucket" />
            </div>
            <div class="sh-slo-foot">
              <span class="ui-muted">{{ s.target }}</span>
              <span class="sh-slo-tag" :data-tone="s.tone">{{ s.verdict }}</span>
            </div>
            <p class="sh-slo-note ui-muted">{{ s.note }}</p>
          </li>
        </ul>

        <template #footer>
          <span class="ui-muted">
            Latência é instantânea (sonda <code class="ui-mono">/health</code>); erro e volume são
            <strong>contadores acumulados</strong> da fila, não taxas por janela de tempo.
            Para rate/janela e histórico, use o <a :href="grafanaUrl">Grafana</a>.
          </span>
        </template>
      </UiCard>
    </div>

    <!-- ===================== Detalhe da fila (tabela) ===================== -->
    <UiCard title="Estágios da fila" subtitle="Leitura tabular dos contadores de jobs">
      <template #actions>
        <UiButton :href="grafanaUrl" variant="ghost" size="sm">Histórico</UiButton>
      </template>
      <UiDataTable
        :columns="stageColumns"
        :rows="stageRows"
        :loading="jobsLoading"
        :error="jobsError"
        row-key="key"
        density="comfortable"
        :empty="{
          title: 'Sem estágios para mostrar',
          description: 'A fila não retornou contadores. Verifique se o worker está ativo.',
          icon: '🧱',
        }"
        @retry="loadJobs"
      >
        <template #cell-label="{ row }">
          <span class="sh-stage-name">
            <span class="sh-stage-dot" :data-tone="row.tone" aria-hidden="true" />
            {{ row.label }}
          </span>
        </template>
        <template #cell-value="{ value }">
          <span class="ui-mono">{{ format.formatNumber(value) }}</span>
        </template>
        <template #cell-share="{ value }">{{ value }}</template>
        <template #cell-status="{ row }">
          <UiStatusBadge :status="row.statusKey" :tone="row.tone" :label="row.statusLabel" size="sm" />
        </template>
      </UiDataTable>
    </UiCard>

    <!-- ===================== Rodapé do painel ===================== -->
    <template #footer>
      <span>
        Fontes em tempo real:
        <code class="ui-mono">GET /health</code> ·
        <code class="ui-mono">GET /v1/health/jobs</code>.
        Painéis e alertas históricos no
        <a :href="grafanaUrl">Grafana</a>.
      </span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import * as api from '../api.js';
import {
  UiPageLayout,
  UiCard,
  UiDataTable,
  UiStatusBadge,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  UiButton,
  useToast,
  format,
} from '../ui/index.js';

const toast = useToast();

// --- Resolução defensiva dos recursos REAIS expostos por api.js -------------
// Só chamamos endpoints reais: /health e /v1/health/jobs. O integrador pode
// expor `api.healthJobs`; caímos para `api.health.jobs` se existir.
const healthFn = typeof api.health === 'function' ? api.health : null;
const jobsHealthFn =
  typeof api.healthJobs === 'function'
    ? api.healthJobs
    : api.health && typeof api.health.jobs === 'function'
      ? api.health.jobs
      : null;

// Link ao Grafana (observabilidade da plataforma). DEVE escapar do basePath /shopdesk
// do SPA: montamos a partir da ORIGIN do host para apontar à raiz absoluta /grafana,
// nunca a /shopdesk/grafana (rota inexistente). Fallback '/grafana' em SSR/sem window.
const grafanaOrigin =
  (typeof window !== 'undefined' && window.location && window.location.origin) || '';
const grafanaUrl = grafanaOrigin + '/grafana';
// dashboard de jobs/DLQ (busca pela tag canônica; cai na home do Grafana se não houver).
const grafanaDlqUrl = grafanaOrigin + '/grafana/dashboards?tag=shopdesk-jobs';

// --- Estado --------------------------------------------------------------
const firstLoad = ref(true);
const refreshing = ref(false);
const probing = ref(false);
const fatalError = ref(null);
const lastUpdated = ref(null);

const apiReachable = ref(false);
// dbState: 'connected' | 'down' | 'unknown' (sem sinal explícito de banco no /health).
// Nunca inferimos "conectado" de status:'ok' ou resposta vazia — evita falso-positivo.
const dbState = ref('unknown');
const latencyMs = ref(null);

const jobs = ref({});
const jobsLoading = ref(false);
const jobsError = ref(null);

// auto-refresh
const autoRefresh = ref(true);
const REFRESH_MS = 15000;
let timer = null;

// --- Carregadores (isolados: falha de um não derruba o painel) -----------
async function loadHealth() {
  if (!healthFn) { apiReachable.value = false; dbState.value = 'unknown'; return; }
  probing.value = true;
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  try {
    const r = await healthFn();
    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    latencyMs.value = Math.max(0, Math.round(t1 - t0));
    apiReachable.value = true;
    // Só afirmamos "conectado" com o sinal EXPLÍCITO do backend (db === 'connected',
    // emitido após um SELECT 1 real). 'down' se o backend reportar outro valor; do
    // contrário 'unknown' — não tratamos status:'ok' nem resposta vazia como banco OK.
    const db = r && r.db;
    dbState.value = db === 'connected' ? 'connected' : (db ? 'down' : 'unknown');
  } catch {
    apiReachable.value = false;
    dbState.value = 'unknown';
    latencyMs.value = null;
  } finally {
    probing.value = false;
  }
}

async function loadJobs() {
  if (!jobsHealthFn) { jobs.value = {}; jobsError.value = null; return; }
  jobsLoading.value = true;
  jobsError.value = null;
  try {
    const r = await jobsHealthFn();
    jobs.value = (r && r.jobs) || {};
  } catch (e) {
    jobsError.value = e.message || 'Falha ao ler a fila de jobs.';
    jobs.value = {};
  } finally {
    jobsLoading.value = false;
  }
}

async function loadAll(isRefresh = false) {
  if (isRefresh) refreshing.value = true;
  fatalError.value = null;
  try {
    await Promise.allSettled([loadHealth(), loadJobs()]);
    lastUpdated.value = new Date();
    // Erro fatal só quando NADA respondeu (API fora e fila sem dados).
    if (!apiReachable.value && jobsError.value) {
      fatalError.value = 'Não foi possível falar com o backend. Verifique a API e tente novamente.';
    }
    if (isRefresh && !fatalError.value) toast.success('Painel de saúde atualizado.');
  } catch (e) {
    fatalError.value = e.message || 'Erro inesperado ao carregar o painel de saúde.';
    if (isRefresh) toast.error('Falha ao atualizar o painel.');
  } finally {
    firstLoad.value = false;
    refreshing.value = false;
  }
}

// --- Contadores da fila --------------------------------------------------
const num = (v) => { const n = Number(v); return isFinite(n) && n >= 0 ? n : 0; };
const queued = computed(() => num(jobs.value.queued));
const running = computed(() => num(jobs.value.running));
const done = computed(() => num(jobs.value.done));
const dlq = computed(() => num(jobs.value.dlq));

const jobsTotal = computed(() => queued.value + running.value + done.value + dlq.value);
const inFlight = computed(() => queued.value + running.value);
const backlog = computed(() => queued.value);
const backlogWarn = 20;

// proporção -> "bucket" de 0..10 (sem style inline; a CSS pinta por data-pct)
function bucketOf(value, max) {
  if (!max || max <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, value / max));
  return Math.round(ratio * 10);
}

const queueMax = computed(() => Math.max(1, queued.value, running.value, done.value, dlq.value));

const STAGE_META = [
  { key: 'queued', label: 'Na fila', tone: 'warning', icon: '⏳', statusKey: 'queued' },
  { key: 'running', label: 'Executando', tone: 'running', icon: '⚙', statusKey: 'running' },
  { key: 'done', label: 'Concluídas', tone: 'success', icon: '✓', statusKey: 'done' },
  { key: 'dlq', label: 'Erro (DLQ)', tone: 'error', icon: '⛔', statusKey: 'dlq' },
];

const stageValue = (k) =>
  ({ queued: queued.value, running: running.value, done: done.value, dlq: dlq.value }[k] || 0);

const queueBars = computed(() =>
  STAGE_META.map((m) => ({
    key: m.key,
    label: m.label,
    tone: m.tone,
    value: stageValue(m.key),
    bucket: bucketOf(stageValue(m.key), queueMax.value),
  })));

const queueAriaLabel = computed(() =>
  'Profundidade da fila: ' +
  STAGE_META.map((m) => m.label + ' ' + stageValue(m.key)).join(', ') + '.');

// --- HealthCards ---------------------------------------------------------
const healthCards = computed(() => {
  const cards = [];

  // API
  cards.push({
    key: 'api',
    icon: '🌐',
    label: 'API',
    live: true,
    value: apiReachable.value ? 'No ar' : 'Fora do ar',
    hint: apiReachable.value
      ? 'Backend respondendo às requisições'
      : 'Sem resposta do backend — verifique o serviço',
    tone: apiReachable.value ? 'success' : 'error',
    badgeStatus: apiReachable.value ? 'ok' : 'error',
    badgeLabel: apiReachable.value ? 'Online' : 'Offline',
  });

  // Banco de dados — três estados honestos: conectado / sem conexão / indeterminado.
  // 'Conectado' só com o sinal explícito db==='connected' (backend rodou SELECT 1).
  let dbTone = 'neutral';
  let dbValue = 'Indeterminado';
  let dbHint = 'Não dá para checar com a API fora';
  if (apiReachable.value) {
    if (dbState.value === 'connected') {
      dbTone = 'success'; dbValue = 'Conectado'; dbHint = 'SELECT 1 respondeu — banco verificado';
    } else if (dbState.value === 'down') {
      dbTone = 'error'; dbValue = 'Sem conexão'; dbHint = 'A API não fala com o banco';
    } else {
      dbTone = 'neutral'; dbValue = 'Indeterminado'; dbHint = 'A API respondeu, mas não reportou o estado do banco';
    }
  }
  cards.push({
    key: 'db',
    icon: '🗄',
    label: 'Banco de dados',
    live: true,
    value: dbValue,
    hint: dbHint,
    tone: dbTone,
    badgeStatus: dbTone === 'success' ? 'ok' : (dbTone === 'error' ? 'error' : 'pending'),
    badgeLabel: dbTone === 'success' ? 'OK' : (dbTone === 'error' ? 'Falha' : '—'),
  });

  // Workers / fila
  let wkTone = 'neutral';
  let wkValue = 'Indeterminado';
  let wkHint = 'Sem leitura da fila de jobs';
  let wkBadge = 'pending';
  let wkLabel = '—';
  if (!jobsError.value && jobsHealthFn) {
    if (dlq.value > 0) {
      wkTone = 'error'; wkValue = 'Com falhas'; wkBadge = 'error'; wkLabel = 'DLQ';
      wkHint = dlq.value + ' tarefa(s) na DLQ exigem atenção';
    } else if (running.value > 0) {
      wkTone = 'running'; wkValue = 'Processando'; wkBadge = 'running'; wkLabel = 'Ativo';
      wkHint = running.value + ' tarefa(s) em execução agora';
    } else if (queued.value > 0) {
      wkTone = 'warning'; wkValue = 'Drenando fila'; wkBadge = 'pending'; wkLabel = 'Fila';
      wkHint = queued.value + ' tarefa(s) aguardando processamento';
    } else {
      wkTone = 'success'; wkValue = 'Ocioso'; wkBadge = 'ok'; wkLabel = 'OK';
      wkHint = 'Nenhuma tarefa pendente — fila limpa';
    }
  }
  cards.push({
    key: 'workers',
    icon: '🛠',
    label: 'Workers / fila',
    live: false,
    value: wkValue,
    hint: wkHint,
    tone: wkTone,
    badgeStatus: wkBadge,
    badgeLabel: wkLabel,
  });

  // Latência da sonda
  const lat = latencyMs.value;
  let latTone = 'neutral';
  if (lat !== null) latTone = lat <= 300 ? 'success' : (lat <= 800 ? 'warning' : 'error');
  cards.push({
    key: 'latency',
    icon: '⚡',
    label: 'Latência da sonda',
    live: true,
    value: lat === null ? '—' : lat + ' ms',
    hint: lat === null ? 'Medida na chamada a /health' : 'Tempo de ida e volta da verificação',
    tone: latTone,
    badgeStatus: latTone === 'success' ? 'ok' : (latTone === 'warning' ? 'pending' : (latTone === 'error' ? 'error' : 'pending')),
    badgeLabel: latTone === 'success' ? 'Rápido' : (latTone === 'warning' ? 'Lento' : (latTone === 'error' ? 'Crítico' : '—')),
  });

  return cards;
});

// --- Pulso geral ---------------------------------------------------------
const overall = computed(() => {
  if (!apiReachable.value) {
    return { tone: 'error', title: 'Sistema indisponível', detail: 'a API não está respondendo' };
  }
  if (dlq.value > 0) {
    return { tone: 'error', title: 'Degradado', detail: dlq.value + ' tarefa(s) na DLQ' };
  }
  if (dbState.value === 'down') {
    return { tone: 'error', title: 'Banco com problema', detail: 'a API não fala com o banco' };
  }
  if (backlog.value > backlogWarn) {
    return { tone: 'warning', title: 'Sob pressão', detail: backlog.value + ' tarefas acumuladas na fila' };
  }
  // Sem violações: só afirmamos "banco normal" quando ele foi de fato verificado.
  return dbState.value === 'connected'
    ? { tone: 'ok', title: 'Tudo no ar', detail: 'banco, workers e fila operando normalmente' }
    : { tone: 'ok', title: 'Operacional', detail: 'API e fila operando; estado do banco não reportado' };
});

// --- SloPanel ------------------------------------------------------------
// HONESTIDADE: só a latência é uma medida INSTANTÂNEA (sonda /health). Erro e
// volume vêm de CONTADORES ACUMULADOS da fila — não são taxas por janela de
// tempo — então rotulamos como "acumulado" e marcamos metas informativas, sem
// prometer "agora"/"throughput". O histórico real (com janela/rate) está no
// Grafana (Prometheus: shopdesk_jobs_total / queue_depth).
const slos = computed(() => {
  const out = [];

  // 1) Latência da sonda /health — única medida instantânea. Meta 300ms.
  const lat = latencyMs.value;
  let latTone = 'neutral';
  let latVerdict = 'Sem dado';
  if (lat !== null) {
    latTone = lat <= 300 ? 'success' : (lat <= 800 ? 'warning' : 'error');
    latVerdict = latTone === 'success' ? 'Dentro' : (latTone === 'warning' ? 'No limite' : 'Estourou');
  }
  out.push({
    key: 'latency',
    label: 'Latência da sonda',
    display: lat === null ? '—' : lat + ' ms',
    target: 'meta ≤ 300 ms',
    tone: latTone,
    verdict: latVerdict,
    bucket: lat === null ? 0 : bucketOf(Math.min(lat, 1000), 1000),
    note: 'Medida instantânea: ida e volta da chamada a /health.',
  });

  // 2) Erro acumulado = DLQ / total finalizado (done + dlq). NÃO é taxa recente:
  // 'done' é cumulativo, então uma rajada de falhas mal move este número.
  const finished = done.value + dlq.value;
  const errRate = finished > 0 ? (dlq.value / finished) * 100 : 0;
  let errTone = 'success';
  if (finished === 0) errTone = 'neutral';
  else if (errRate >= 5) errTone = 'error';
  else if (errRate >= 1) errTone = 'warning';
  out.push({
    key: 'error',
    label: 'Erro acumulado (jobs)',
    display: finished === 0 ? '—' : errRate.toFixed(errRate < 10 ? 1 : 0) + '%',
    target: 'referência < 1%',
    tone: errTone,
    verdict: finished === 0 ? 'Sem dado' : (errTone === 'success' ? 'Saudável' : (errTone === 'warning' ? 'Atenção' : 'Crítico')),
    bucket: finished === 0 ? 0 : bucketOf(Math.min(errRate, 10), 10),
    note: 'DLQ sobre o total finalizado (done + DLQ), acumulado — não taxa por minuto. Rajadas recentes só aparecem no Grafana.',
  });

  // 3) Concluídas (acumulado) — contador total, sem taxa por unidade de tempo.
  let thrTone = done.value > 0 ? 'success' : 'neutral';
  out.push({
    key: 'throughput',
    label: 'Concluídas (acumulado)',
    display: format.formatNumber(done.value),
    target: 'contador total',
    tone: thrTone,
    verdict: done.value > 0 ? 'Houve processamento' : 'Aguardando',
    bucket: bucketOf(done.value, queueMax.value),
    note: 'Total histórico de tarefas concluídas. A taxa por minuto fica no Grafana.',
  });

  return out;
});

const sloOverallTone = computed(() => {
  const tones = slos.value.map((s) => s.tone);
  if (tones.includes('error')) return 'error';
  if (tones.includes('warning')) return 'warning';
  if (tones.every((t) => t === 'neutral')) return 'neutral';
  return 'success';
});
const sloOverallLabel = computed(() =>
  ({ error: 'Violado', warning: 'Em risco', neutral: 'Sem dados', success: 'No alvo' }[sloOverallTone.value]));

// --- Tabela de estágios --------------------------------------------------
const stageColumns = [
  { key: 'label', label: 'Estágio' },
  { key: 'value', label: 'Tarefas', align: 'right' },
  { key: 'share', label: 'Participação', align: 'right' },
  { key: 'status', label: 'Situação' },
];

const stageRows = computed(() =>
  STAGE_META.map((m) => {
    const v = stageValue(m.key);
    const share = jobsTotal.value > 0 ? Math.round((v / jobsTotal.value) * 100) + '%' : '—';
    let statusLabel = 'Normal';
    if (m.key === 'dlq') statusLabel = v > 0 ? 'Requer ação' : 'Limpo';
    else if (m.key === 'running') statusLabel = v > 0 ? 'Em execução' : 'Parado';
    else if (m.key === 'queued') statusLabel = v > 0 ? 'Pendente' : 'Vazio';
    else if (m.key === 'done') statusLabel = v > 0 ? 'Concluído' : 'Nenhum';
    return {
      key: m.key,
      label: m.label,
      value: v,
      share,
      tone: m.tone,
      statusKey: m.statusKey,
      statusLabel,
    };
  }));

// --- Labels ---------------------------------------------------------------
const lastUpdatedLabel = computed(() =>
  lastUpdated.value
    ? new Intl.DateTimeFormat('pt-BR', { timeStyle: 'medium' }).format(lastUpdated.value)
    : '');

// --- Auto-refresh --------------------------------------------------------
function startTimer() {
  stopTimer();
  if (!autoRefresh.value) return;
  timer = setInterval(() => { if (!document.hidden) loadAll(false); }, REFRESH_MS);
}
function stopTimer() {
  if (timer) { clearInterval(timer); timer = null; }
}
function toggleAuto() {
  autoRefresh.value = !autoRefresh.value;
  if (autoRefresh.value) { startTimer(); toast.info('Atualização automática ativada.'); }
  else { stopTimer(); toast.info('Atualização automática pausada.'); }
}

onMounted(() => {
  loadAll(false);
  startTimer();
});
onBeforeUnmount(stopTimer);
</script>

<style scoped>
/* ===================== DlqAlert ===================== */
.sh-alert {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  padding: var(--ui-space-4);
  border: 1px solid rgb(var(--ui-danger) / 0.35);
  border-left: 4px solid rgb(var(--ui-danger));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-danger) / 0.08);
}
.sh-alert-ic { font-size: 1.4rem; flex-shrink: 0; }
.sh-alert-body { flex: 1 1 240px; min-width: 0; }
.sh-alert-title { margin: 0; font-weight: 700; color: rgb(var(--ui-danger)); }
.sh-alert-desc { margin: 2px 0 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }
.sh-alert-desc abbr { text-decoration: underline dotted; cursor: help; }

/* ===================== Pulso geral ===================== */
.sh-pulse {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  font-size: var(--ui-text-sm);
}
.sh-pulse[data-tone="ok"] { border-left-color: rgb(var(--ui-ok)); }
.sh-pulse[data-tone="warning"] { border-left-color: rgb(var(--ui-warn)); }
.sh-pulse[data-tone="error"] { border-left-color: rgb(var(--ui-danger)); }
.sh-pulse-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; background: rgb(var(--ui-faint)); }
.sh-pulse[data-tone="ok"] .sh-pulse-dot { background: rgb(var(--ui-ok)); }
.sh-pulse[data-tone="warning"] .sh-pulse-dot { background: rgb(var(--ui-warn)); }
.sh-pulse[data-tone="error"] .sh-pulse-dot { background: rgb(var(--ui-danger)); }
.sh-pulse-text { color: rgb(var(--ui-fg)); }
.sh-pulse-time { margin-left: auto; font-size: var(--ui-text-xs); }

/* ===================== Toggle auto-refresh ===================== */
.sh-auto { display: inline-flex; align-items: center; gap: var(--ui-space-2); }
.sh-auto-dot { width: 8px; height: 8px; border-radius: 50%; background: rgb(var(--ui-faint)); }
.sh-auto-dot[data-on="true"] { background: rgb(var(--ui-ok)); }
.sh-auto-btn {
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: transparent;
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-pill);
  padding: 4px 11px;
  cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.sh-auto-btn[aria-pressed="true"] { color: rgb(var(--ui-accent-strong)); border-color: rgb(var(--ui-accent) / 0.5); }
.sh-auto-btn:hover { background: rgb(var(--ui-surface-2)); }

/* ===================== HealthCards ===================== */
.sh-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-4);
}
.sh-card {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  padding: var(--ui-space-4) var(--ui-space-5);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-top: 3px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-sm);
}
.sh-card[data-tone="success"] { border-top-color: rgb(var(--ui-ok)); }
.sh-card[data-tone="warning"] { border-top-color: rgb(var(--ui-warn)); }
.sh-card[data-tone="error"] { border-top-color: rgb(var(--ui-danger)); }
.sh-card[data-tone="running"] { border-top-color: rgb(var(--ui-accent)); }
.sh-card-top { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-2); }
.sh-card-ic { font-size: 1.3rem; }
.sh-card-label { margin: var(--ui-space-1) 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.sh-card-value { margin: 0; font-family: var(--ui-font-display); font-weight: 700; font-size: 1.45rem; }
.sh-card-hint { margin: 0; font-size: var(--ui-text-xs); }

/* ===================== Grid principal ===================== */
.sh-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: var(--ui-space-4);
  align-items: start;
}

/* ===================== QueueDepthChart ===================== */
.sh-queue { display: flex; flex-direction: column; gap: var(--ui-space-5); }
.sh-bars {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-3);
  align-items: end;
}
.sh-bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-space-2);
}
.sh-bar-count { font-family: var(--ui-font-display); font-weight: 700; font-size: var(--ui-text-lg); }
.sh-bar-track {
  width: 100%;
  height: 150px;
  display: flex;
  align-items: flex-end;
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-sm);
  overflow: hidden;
}
.sh-bar-fill {
  width: 100%;
  border-radius: var(--ui-radius-sm) var(--ui-radius-sm) 0 0;
  background: rgb(var(--ui-faint));
  transition: height .4s ease;
  min-height: 3px;
}
.sh-bar-fill[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.sh-bar-fill[data-tone="running"] { background: rgb(var(--ui-accent)); }
.sh-bar-fill[data-tone="success"] { background: rgb(var(--ui-ok)); }
.sh-bar-fill[data-tone="error"] { background: rgb(var(--ui-danger)); }
/* alturas por "bucket" (0..10) — sem style inline */
.sh-bar-fill[data-pct="0"] { height: 3px; }
.sh-bar-fill[data-pct="1"] { height: 10%; }
.sh-bar-fill[data-pct="2"] { height: 20%; }
.sh-bar-fill[data-pct="3"] { height: 30%; }
.sh-bar-fill[data-pct="4"] { height: 40%; }
.sh-bar-fill[data-pct="5"] { height: 50%; }
.sh-bar-fill[data-pct="6"] { height: 60%; }
.sh-bar-fill[data-pct="7"] { height: 70%; }
.sh-bar-fill[data-pct="8"] { height: 80%; }
.sh-bar-fill[data-pct="9"] { height: 90%; }
.sh-bar-fill[data-pct="10"] { height: 100%; }
.sh-bar-label { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); text-align: center; }

.sh-queue-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-3);
  margin: 0;
  border-top: 1px solid rgb(var(--ui-border));
  padding-top: var(--ui-space-4);
}
.sh-stat { display: flex; flex-direction: column; gap: 2px; }
.sh-stat dt { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); text-transform: uppercase; letter-spacing: .04em; }
.sh-stat dd { margin: 0; font-family: var(--ui-font-display); font-weight: 700; font-size: var(--ui-text-lg); }
.sh-stat[data-warn="true"] dd { color: rgb(var(--ui-warn)); }
.sh-stat[data-err="true"] dd { color: rgb(var(--ui-danger)); }

/* ===================== SloPanel ===================== */
.sh-slos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-5); }
.sh-slo { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.sh-slo-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-2); }
.sh-slo-name { font-weight: 600; }
.sh-slo-value { font-family: var(--ui-font-display); font-weight: 700; font-size: var(--ui-text-lg); }
.sh-slo-value[data-tone="success"] { color: rgb(var(--ui-ok)); }
.sh-slo-value[data-tone="warning"] { color: rgb(var(--ui-warn)); }
.sh-slo-value[data-tone="error"] { color: rgb(var(--ui-danger)); }
.sh-slo-meter {
  width: 100%;
  height: 8px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  overflow: hidden;
}
.sh-slo-bar {
  display: block;
  height: 100%;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-faint));
  transition: width .4s ease;
}
.sh-slo-bar[data-tone="success"] { background: rgb(var(--ui-ok)); }
.sh-slo-bar[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.sh-slo-bar[data-tone="error"] { background: rgb(var(--ui-danger)); }
.sh-slo-bar[data-pct="0"] { width: 4%; }
.sh-slo-bar[data-pct="1"] { width: 10%; }
.sh-slo-bar[data-pct="2"] { width: 20%; }
.sh-slo-bar[data-pct="3"] { width: 30%; }
.sh-slo-bar[data-pct="4"] { width: 40%; }
.sh-slo-bar[data-pct="5"] { width: 50%; }
.sh-slo-bar[data-pct="6"] { width: 60%; }
.sh-slo-bar[data-pct="7"] { width: 70%; }
.sh-slo-bar[data-pct="8"] { width: 80%; }
.sh-slo-bar[data-pct="9"] { width: 90%; }
.sh-slo-bar[data-pct="10"] { width: 100%; }
.sh-slo-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-2); font-size: var(--ui-text-xs); }
.sh-slo-tag { font-weight: 600; padding: 2px 8px; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-muted) / 0.16); color: rgb(var(--ui-muted)); }
.sh-slo-tag[data-tone="success"] { background: rgb(var(--ui-ok) / 0.16); color: rgb(var(--ui-ok)); }
.sh-slo-tag[data-tone="warning"] { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.sh-slo-tag[data-tone="error"] { background: rgb(var(--ui-danger) / 0.16); color: rgb(var(--ui-danger)); }
.sh-slo-note { margin: 0; font-size: var(--ui-text-xs); }

/* ===================== Tabela de estágios ===================== */
.sh-stage-name { display: inline-flex; align-items: center; gap: var(--ui-space-2); font-weight: 600; }
.sh-stage-dot { width: 8px; height: 8px; border-radius: 50%; background: rgb(var(--ui-faint)); flex-shrink: 0; }
.sh-stage-dot[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.sh-stage-dot[data-tone="running"] { background: rgb(var(--ui-accent)); }
.sh-stage-dot[data-tone="success"] { background: rgb(var(--ui-ok)); }
.sh-stage-dot[data-tone="error"] { background: rgb(var(--ui-danger)); }

/* ===================== Responsivo ===================== */
@media (max-width: 1080px) {
  .sh-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sh-grid { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .sh-cards { grid-template-columns: 1fr; }
  .sh-bar-track { height: 110px; }
  .sh-pulse-time { margin-left: 0; }
}
</style>
