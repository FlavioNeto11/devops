<template>
  <UiPageLayout
    width="wide"
    eyebrow="HelpFlow · Operação"
    title="Observabilidade"
    subtitle="Saúde do serviço e do banco, profundidade da fila, taxa de erros e latência das sondas. Painel somente leitura, ao vivo."
    :loading="loading"
    :error="errorMsg"
    @retry="load"
  >
    <!-- Ações do cabeçalho -->
    <template #actions>
      <span class="hf-clock" aria-live="polite">{{ autoLabel }}</span>
      <button
        type="button"
        class="hf-live"
        :data-on="autoRefresh ? 'true' : 'false'"
        :aria-pressed="autoRefresh ? 'true' : 'false'"
        @click="toggleAuto"
      >
        <span class="hf-live-dot" aria-hidden="true" />
        {{ autoRefresh ? 'Ao vivo (15s)' : 'Pausado' }}
      </button>
      <UiButton variant="primary" :loading="refreshing" @click="load">
        <template #icon-left><span class="hf-ico" aria-hidden="true">↻</span></template>
        Atualizar agora
      </UiButton>
    </template>

    <!-- Banner de incidentes (somente quando há algo a destacar) -->
    <template v-if="hasIncidents" #banner>
      <div class="hf-banner" :data-tone="bannerTone" role="alert">
        <span class="hf-banner-icon" aria-hidden="true">{{ bannerTone === 'error' ? '⛔' : '⚠' }}</span>
        <div class="hf-banner-body">
          <p class="hf-banner-title">{{ bannerTitle }}</p>
          <p class="hf-banner-text">{{ incidentSummary }}</p>
        </div>
        <UiButton v-if="jobs.dlq > 0" variant="ghost" size="sm" to="/jobs">Ver fila morta</UiButton>
      </div>
    </template>

    <!-- ======================= HEALTH PANEL ======================= -->
    <section class="hf-health" aria-label="Saúde dos componentes">
      <article
        v-for="c in healthCards"
        :key="c.key"
        class="hf-health-card"
        :data-tone="c.tone"
        :aria-label="c.name + ': ' + c.label"
      >
        <div class="hf-health-top">
          <span class="hf-health-pulse" :data-tone="c.tone" aria-hidden="true" />
          <span class="hf-health-name">{{ c.name }}</span>
          <UiStatusBadge :status="c.badgeStatus" :label="c.label" size="sm" />
        </div>
        <p class="hf-health-detail">{{ c.detail }}</p>
        <dl class="hf-health-meta">
          <div v-for="row in c.meta" :key="row.k" class="hf-health-row">
            <dt>{{ row.k }}</dt>
            <dd>
              <code v-if="row.code" class="hf-code">{{ row.v }}</code>
              <template v-else>{{ row.v }}</template>
            </dd>
          </div>
        </dl>
      </article>
    </section>

    <!-- ======================= METRIC TILES ======================= -->
    <section class="hf-tiles" aria-label="Indicadores operacionais">
      <UiMetricCard
        label="Profundidade da fila"
        :value="format.formatNumber(queueOpen)"
        :tone="queueOpen > 0 ? 'running' : 'success'"
        hint="aguardando + em processamento"
        clickable
        @click="goJobs"
      />
      <UiMetricCard
        label="Falhas (DLQ)"
        :value="format.formatNumber(jobs.dlq)"
        :tone="jobs.dlq > 0 ? 'error' : 'success'"
        hint="jobs sem reprocessar"
        clickable
        @click="goJobs"
      />
      <UiMetricCard
        label="Taxa de erro de jobs"
        :value="errorRateLabel"
        :tone="errorRateTone"
        hint="DLQ sobre total processado"
      />
      <UiMetricCard
        label="Latência da sonda"
        :value="probe.latencyMs !== null ? probe.latencyMs + ' ms' : '—'"
        :tone="latencyTone"
        hint="round-trip de GET /health"
      />
      <UiMetricCard
        label="Concluídos"
        :value="format.formatNumber(jobs.done)"
        tone="primary"
        hint="jobs finalizados com sucesso"
      />
      <UiMetricCard
        label="Throughput aparente"
        :value="format.formatNumber(processed)"
        tone="neutral"
        hint="total processado (done + dlq)"
      />
    </section>

    <!-- ============ FILA + TAXA DE ERRO (dois painéis) ============ -->
    <section class="hf-grid-2">
      <!-- QueueDepthWidget -->
      <UiCard title="Profundidade da fila" subtitle="Distribuição dos jobs por estágio do worker.">
        <template #actions>
          <UiStatusBadge :status="jobsBadgeStatus" :label="jobsLabel" size="sm" />
        </template>

        <div v-if="jobsError" class="hf-inline-error" role="alert">
          <p class="hf-inline-error-text">Não foi possível ler a saúde da fila.</p>
          <UiButton size="sm" variant="ghost" @click="load">Tentar de novo</UiButton>
        </div>

        <div v-else-if="totalJobs === 0" class="hf-soft-empty">
          <span class="hf-soft-empty-icon" aria-hidden="true">✓</span>
          <p class="hf-soft-empty-text">Nenhum job registrado. A fila está vazia.</p>
        </div>

        <template v-else>
          <div class="hf-chart" role="img" :aria-label="queueChartAria">
            <svg class="hf-chart-svg" viewBox="0 0 320 130" preserveAspectRatio="none" aria-hidden="true">
              <g class="hf-chart-grid">
                <line x1="0" y1="32" x2="320" y2="32" />
                <line x1="0" y1="64" x2="320" y2="64" />
                <line x1="0" y1="96" x2="320" y2="96" />
              </g>
              <g class="hf-chart-bars">
                <rect
                  v-for="(b, i) in queueBars"
                  :key="b.key"
                  class="hf-bar"
                  :data-tone="b.tone"
                  :x="i * 80 + 26"
                  :y="116 - b.h"
                  :width="48"
                  :height="b.h"
                  rx="4"
                />
              </g>
            </svg>
          </div>
          <ul class="hf-legend">
            <li v-for="b in queueBars" :key="b.key" class="hf-legend-item">
              <span class="hf-legend-dot" :data-tone="b.tone" aria-hidden="true" />
              <span class="hf-legend-label">{{ b.label }}</span>
              <span class="hf-legend-value">{{ format.formatNumber(b.value) }}</span>
            </li>
          </ul>
        </template>

        <template #footer>
          <UiButton variant="subtle" size="sm" to="/jobs">Abrir monitor da fila</UiButton>
        </template>
      </UiCard>

      <!-- ErrorRateChart -->
      <UiCard title="Taxa de erros" subtitle="Saúde do processamento ao longo das atualizações.">
        <template #actions>
          <UiStatusBadge :status="errorRateBadgeStatus" :label="errorRateBadgeLabel" size="sm" />
        </template>

        <div v-if="jobsError" class="hf-inline-error" role="alert">
          <p class="hf-inline-error-text">Sem dados de erro — a fila está indisponível.</p>
          <UiButton size="sm" variant="ghost" @click="load">Tentar de novo</UiButton>
        </div>

        <div v-else-if="errorHistory.length < 2" class="hf-soft-empty">
          <span class="hf-soft-empty-icon" aria-hidden="true">📈</span>
          <p class="hf-soft-empty-text">
            Coletando histórico. As medições aparecem aqui a cada atualização.
          </p>
        </div>

        <template v-else>
          <div class="hf-chart hf-chart--line" role="img" :aria-label="errorChartAria">
            <svg class="hf-chart-svg" viewBox="0 0 320 130" preserveAspectRatio="none" aria-hidden="true">
              <g class="hf-chart-grid">
                <line x1="0" y1="32" x2="320" y2="32" />
                <line x1="0" y1="64" x2="320" y2="64" />
                <line x1="0" y1="96" x2="320" y2="96" />
              </g>
              <polygon class="hf-area" :points="errorAreaPoints" />
              <polyline class="hf-line" :points="errorLinePoints" />
              <circle
                v-for="(p, i) in errorPoints"
                :key="i"
                class="hf-dot"
                :data-tone="p.tone"
                :cx="p.x"
                :cy="p.y"
                r="3.5"
              />
            </svg>
          </div>
          <div class="hf-line-foot">
            <span class="hf-line-foot-now">
              Atual: <strong>{{ errorRateLabel }}</strong>
            </span>
            <span class="hf-line-foot-peak">Pico na janela: {{ peakErrorLabel }}</span>
          </div>
        </template>
      </UiCard>
    </section>

    <!-- ============ LATÊNCIA DE SONDAS ============ -->
    <UiCard
      title="Latência de sondas"
      subtitle="Tempo de resposta das checagens de saúde nas últimas leituras."
    >
      <div v-if="latencyHistory.length < 2" class="hf-soft-empty">
        <span class="hf-soft-empty-icon" aria-hidden="true">⏱</span>
        <p class="hf-soft-empty-text">Aguardando medições suficientes para traçar a latência.</p>
      </div>
      <template v-else>
        <div class="hf-spark" role="img" :aria-label="latencyChartAria">
          <svg class="hf-chart-svg" viewBox="0 0 320 90" preserveAspectRatio="none" aria-hidden="true">
            <polyline class="hf-line hf-line--alt" :points="latencyLinePoints" />
          </svg>
        </div>
        <ul class="hf-stat-row">
          <li class="hf-stat">
            <span class="hf-stat-label">Mín</span>
            <span class="hf-stat-value">{{ latencyStats.min }} ms</span>
          </li>
          <li class="hf-stat">
            <span class="hf-stat-label">Médio</span>
            <span class="hf-stat-value">{{ latencyStats.avg }} ms</span>
          </li>
          <li class="hf-stat">
            <span class="hf-stat-label">Máx</span>
            <span class="hf-stat-value">{{ latencyStats.max }} ms</span>
          </li>
          <li class="hf-stat">
            <span class="hf-stat-label">Amostras</span>
            <span class="hf-stat-value">{{ latencyHistory.length }}</span>
          </li>
        </ul>
      </template>
    </UiCard>

    <!-- ============ LINKS EXTERNOS (Prometheus / métricas) ============ -->
    <UiCard
      title="Métricas e observabilidade externa"
      subtitle="Painéis e endpoints da plataforma DevOps, fora da aplicação."
    >
      <ul class="hf-links">
        <li v-for="lnk in externalLinks" :key="lnk.href" class="hf-link-card">
          <a class="hf-link-anchor" :href="lnk.href" target="_blank" rel="noopener noreferrer">
            <span class="hf-link-icon" :data-tone="lnk.tone" aria-hidden="true">{{ lnk.icon }}</span>
            <span class="hf-link-text">
              <span class="hf-link-title">{{ lnk.title }}</span>
              <span class="hf-link-desc">{{ lnk.desc }}</span>
            </span>
            <span class="hf-link-arrow" aria-hidden="true">↗</span>
          </a>
        </li>
      </ul>
      <p class="hf-links-note">
        Estes destinos abrem ferramentas da plataforma DevOps em nova aba; podem exigir login SSO.
      </p>
    </UiCard>

    <template #footer>
      <span>
        Atualizado {{ updatedAt ? format.formatDateTime(updatedAt) : '—' }} ·
        {{ autoRefresh ? 'auto-refresh a cada 15s' : 'auto-refresh pausado' }} · dados ao vivo.
      </span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiButton,
  useToast,
  format,
} from '../ui/index.js';
import { health as healthProbe, jobsHealth } from '../api.js';

const router = useRouter();
const toast = useToast();

// Base usada pelo api.js — para a sonda /me, que vive na RAIZ (fora de /v1).
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/helpflow/api';

const loading = ref(true);
const refreshing = ref(false);
const errorMsg = ref(null);
const jobsError = ref(false);
const updatedAt = ref(null);

const HISTORY_MAX = 24;
const AUTO_MS = 15000;

// ---- Estados crus dos componentes monitorados ----
const svc = reactive({ status: '', db: '' }); // GET /health → { status, db }
const probe = reactive({ ok: false, latencyMs: null }); // medição da sonda
const me = reactive({ email: null, name: null, role: null, ok: false }); // GET /me
const jobs = reactive({ queued: 0, running: 0, done: 0, dlq: 0 }); // GET /v1/health/jobs

// ---- Históricos (séries temporais em memória) ----
const errorHistory = ref([]); // [{ rate }]
const latencyHistory = ref([]); // [ms]

let timer = null;
const autoRefresh = ref(true);
const tick = ref(0); // força reavaliação do rótulo de relógio

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// GET /health → primário; sua falha derruba a tela inteira (erro + retry).
async function probeHealth() {
  const t0 = nowMs();
  try {
    const h = await healthProbe();
    probe.ok = true;
    probe.latencyMs = Math.max(0, Math.round(nowMs() - t0));
    svc.status = (h && h.status) || 'ok';
    svc.db = (h && h.db) || '';
  } catch (e) {
    probe.ok = false;
    probe.latencyMs = null;
    svc.status = 'error';
    svc.db = '';
    throw e;
  }
}

// GET /me → identidade da borda SSO; degrada graciosamente (não derruba a tela).
async function probeIdentity() {
  try {
    const r = await fetch(API_BASE + '/me');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const m = await r.json().catch(() => ({}));
    me.ok = true;
    me.email = (m && m.email) || null;
    me.name = (m && m.name) || null;
    me.role = (m && m.role) || null;
  } catch {
    me.ok = false;
    me.email = null;
    me.name = null;
    me.role = null;
  }
}

// GET /v1/health/jobs → { status, jobs: { queued, running, done, dlq } }; degrada graciosamente.
async function probeJobs() {
  try {
    const res = await jobsHealth();
    const payload = res && res.data && res.data.jobs ? res.data : res;
    const j = (payload && payload.jobs) || {};
    jobs.queued = Number(j.queued || 0);
    jobs.running = Number(j.running || 0);
    jobs.done = Number(j.done || 0);
    jobs.dlq = Number(j.dlq || 0);
    jobsError.value = false;
  } catch {
    jobsError.value = true;
  }
}

function pushHistory() {
  // só registra a taxa quando a fila respondeu
  if (!jobsError.value) {
    errorHistory.value = errorHistory.value.concat({ rate: errorRate.value }).slice(-HISTORY_MAX);
  }
  if (probe.latencyMs !== null) {
    latencyHistory.value = latencyHistory.value.concat(probe.latencyMs).slice(-HISTORY_MAX);
  }
}

async function load() {
  const first = loading.value;
  if (!first) refreshing.value = true;
  errorMsg.value = null;
  try {
    await probeHealth(); // sinal primário
    await Promise.all([probeJobs(), probeIdentity()]); // sondas secundárias (fail-soft)
    pushHistory();
    updatedAt.value = new Date();
    if (!first) toast.success('Painel de observabilidade atualizado');
  } catch (e) {
    errorMsg.value = e && e.message ? e.message : 'Serviço indisponível (GET /health falhou)';
    if (!first) toast.error('Não foi possível atualizar o painel');
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function toggleAuto() {
  autoRefresh.value = !autoRefresh.value;
  if (autoRefresh.value) {
    startAuto();
    toast.info('Auto-refresh ligado (15s)');
  } else {
    stopAuto();
    toast.info('Auto-refresh pausado');
  }
}

function startAuto() {
  stopAuto();
  timer = setInterval(() => {
    tick.value = Date.now();
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (!refreshing.value && autoRefresh.value && !hidden) load();
  }, AUTO_MS);
}
function stopAuto() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function goJobs() {
  router.push('/jobs');
}

// ===================== DERIVAÇÕES =====================
const totalJobs = computed(() => jobs.queued + jobs.running + jobs.done + jobs.dlq);
const queueOpen = computed(() => jobs.queued + jobs.running);
const processed = computed(() => jobs.done + jobs.dlq);
const errorRate = computed(() => (processed.value > 0 ? jobs.dlq / processed.value : 0));
const errorRateLabel = computed(() =>
  processed.value > 0 ? (errorRate.value * 100).toFixed(1) + '%' : '0%',
);

const dbConnected = computed(() => String(svc.db).toLowerCase() === 'connected');

// ---- Tons / rótulos do serviço (API) ----
const serviceTone = computed(() => (probe.ok ? 'success' : 'error'));

// ---- Tons / rótulos do banco ----
const dbTone = computed(() => {
  if (!probe.ok) return 'neutral';
  return dbConnected.value ? 'success' : 'error';
});

// ---- Tons / rótulos da fila ----
const jobsTone = computed(() => {
  if (jobsError.value) return 'neutral';
  if (jobs.dlq > 0) return 'error';
  if (queueOpen.value > 0) return 'warning';
  return 'success';
});
const jobsBadgeStatus = computed(() => {
  if (jobsError.value) return 'unknown';
  if (jobs.dlq > 0) return 'dlq';
  if (queueOpen.value > 0) return 'running';
  return 'ok';
});
const jobsLabel = computed(() => {
  if (jobsError.value) return 'Indisponível';
  if (jobs.dlq > 0) return 'Com falhas';
  if (queueOpen.value > 0) return 'Processando';
  return 'Em dia';
});

// ---- Tons / rótulos da identidade (SSO) ----
const identityTone = computed(() => {
  if (!me.ok) return 'neutral';
  return me.email ? 'success' : 'warning';
});

// HealthPanel declarativo (4 componentes monitorados).
const healthCards = computed(() => [
  {
    key: 'service',
    name: 'Serviço (API)',
    tone: serviceTone.value,
    badgeStatus: probe.ok ? 'ok' : 'error',
    label: probe.ok ? 'Operacional' : 'Fora do ar',
    detail: probe.ok
      ? 'A API respondeu à sonda de saúde normalmente.'
      : 'A API não respondeu à última sonda de saúde.',
    meta: [
      { k: 'Endpoint', v: 'GET /health', code: true },
      { k: 'Resposta', v: probe.latencyMs !== null ? probe.latencyMs + ' ms' : '—' },
    ],
  },
  {
    key: 'db',
    name: 'Banco de dados',
    tone: dbTone.value,
    badgeStatus: !probe.ok ? 'unknown' : dbConnected.value ? 'ok' : 'error',
    label: !probe.ok ? 'Desconhecido' : dbConnected.value ? 'Conectado' : 'Sem conexão',
    detail: !probe.ok
      ? 'Sem leitura do banco enquanto o serviço está fora do ar.'
      : dbConnected.value
        ? 'A sonda SELECT 1 confirmou conexão ativa com o Postgres.'
        : 'O banco não confirmou a sonda de conexão.',
    meta: [
      { k: 'Conexão', v: svc.db || '—' },
      { k: 'Sonda', v: 'SELECT 1', code: true },
    ],
  },
  {
    key: 'jobs',
    name: 'Fila de jobs',
    tone: jobsTone.value,
    badgeStatus: jobsBadgeStatus.value,
    label: jobsLabel.value,
    detail: jobsError.value
      ? 'O endpoint de saúde da fila não respondeu.'
      : jobs.dlq > 0
        ? jobs.dlq + ' job(s) na fila morta aguardando reprocessamento.'
        : queueOpen.value > 0
          ? queueOpen.value + ' job(s) em andamento na fila.'
          : 'Sem pendências: todos os jobs foram processados.',
    meta: [
      { k: 'Endpoint', v: 'GET /v1/health/jobs', code: true },
      { k: 'Em aberto', v: format.formatNumber(queueOpen.value) },
    ],
  },
  {
    key: 'identity',
    name: 'Identidade (SSO)',
    tone: identityTone.value,
    badgeStatus: !me.ok ? 'unknown' : me.email ? 'ok' : 'pending',
    label: !me.ok ? 'Indisponível' : me.email ? 'Autenticado' : 'Sem sessão',
    detail: !me.ok
      ? 'O endpoint de identidade não respondeu.'
      : me.email
        ? 'Sessão SSO ativa para ' + me.email + '.'
        : 'A borda não injetou identidade — acesso anônimo ou sem SSO.',
    meta: [
      { k: 'Endpoint', v: 'GET /me', code: true },
      { k: 'Sessão', v: me.email || me.name || 'Anônima' },
    ],
  },
]);

// ---- Tons dos tiles ----
const errorRateTone = computed(() => {
  if (jobsError.value) return 'neutral';
  if (errorRate.value >= 0.1) return 'error';
  if (errorRate.value > 0) return 'warning';
  return 'success';
});
const latencyTone = computed(() => {
  if (probe.latencyMs === null) return 'neutral';
  if (probe.latencyMs >= 800) return 'error';
  if (probe.latencyMs >= 300) return 'warning';
  return 'success';
});

// ---- Badge da taxa de erro ----
const errorRateBadgeStatus = computed(() => {
  if (jobsError.value) return 'unknown';
  if (errorRate.value >= 0.1) return 'error';
  if (errorRate.value > 0) return 'warning';
  return 'ok';
});
const errorRateBadgeLabel = computed(() => {
  if (jobsError.value) return 'Sem dados';
  if (errorRate.value >= 0.1) return 'Crítica';
  if (errorRate.value > 0) return 'Atenção';
  return 'Saudável';
});

// ===================== BANNER =====================
const hasIncidents = computed(
  () => !probe.ok || (probe.ok && !dbConnected.value) || jobs.dlq > 0 || errorRate.value >= 0.1,
);
const bannerTone = computed(() => {
  if (!probe.ok || (probe.ok && !dbConnected.value) || errorRate.value >= 0.1) return 'error';
  return 'warning';
});
const bannerTitle = computed(() =>
  bannerTone.value === 'error' ? 'Incidente operacional' : 'Atenção operacional',
);
const incidentSummary = computed(() => {
  const parts = [];
  if (!probe.ok) parts.push('serviço (API) sem resposta');
  if (probe.ok && !dbConnected.value) parts.push('banco de dados sem conexão');
  if (jobs.dlq > 0) parts.push(jobs.dlq + ' job(s) na fila morta (DLQ)');
  if (errorRate.value >= 0.1) parts.push('taxa de erro em ' + errorRateLabel.value);
  return parts.join(' · ') + '.';
});

// ===================== QueueDepthWidget (gráfico de barras) =====================
const queueBars = computed(() => {
  const data = [
    { key: 'queued', label: 'Aguardando', value: jobs.queued, tone: 'running' },
    { key: 'running', label: 'Processando', value: jobs.running, tone: 'accent' },
    { key: 'dlq', label: 'Falhas (DLQ)', value: jobs.dlq, tone: 'danger' },
    { key: 'done', label: 'Concluídos', value: jobs.done, tone: 'ok' },
  ];
  const max = Math.max(1, ...data.map((d) => d.value));
  return data.map((d) => ({ ...d, h: Math.max(4, Math.round((d.value / max) * 108)) }));
});
const queueChartAria = computed(
  () => 'Profundidade da fila: ' + queueBars.value.map((b) => b.label + ' ' + b.value).join(', '),
);

// ===================== ErrorRateChart (área + linha) =====================
const errorPoints = computed(() => {
  const n = errorHistory.value.length;
  if (n < 2) return [];
  const maxRate = Math.max(0.05, ...errorHistory.value.map((p) => p.rate));
  return errorHistory.value.map((p, i) => {
    const x = (i / (n - 1)) * 320;
    const y = 122 - (p.rate / maxRate) * 108;
    const tone = p.rate >= 0.1 ? 'danger' : p.rate > 0 ? 'warn' : 'ok';
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, tone };
  });
});
const errorLinePoints = computed(() => errorPoints.value.map((p) => p.x + ',' + p.y).join(' '));
const errorAreaPoints = computed(() => {
  const pts = errorPoints.value;
  if (!pts.length) return '';
  return '0,122 ' + pts.map((p) => p.x + ',' + p.y).join(' ') + ' 320,122';
});
const peakErrorLabel = computed(() => {
  if (!errorHistory.value.length) return '0%';
  const peak = Math.max(...errorHistory.value.map((p) => p.rate));
  return (peak * 100).toFixed(1) + '%';
});
const errorChartAria = computed(() => {
  const series = errorHistory.value.map((p) => (p.rate * 100).toFixed(0) + '%').join(', ');
  return 'Histórico da taxa de erro: ' + series + '. Atual ' + errorRateLabel.value + '.';
});

// ===================== Latência (sparkline) =====================
const latencyPoints = computed(() => {
  const arr = latencyHistory.value;
  const n = arr.length;
  if (n < 2) return [];
  const max = Math.max(1, ...arr);
  return arr.map((ms, i) => {
    const x = (i / (n - 1)) * 320;
    const y = 82 - (ms / max) * 74;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });
});
const latencyLinePoints = computed(() => latencyPoints.value.map((p) => p.x + ',' + p.y).join(' '));
const latencyStats = computed(() => {
  const arr = latencyHistory.value;
  if (!arr.length) return { min: 0, max: 0, avg: 0 };
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  return { min, max, avg };
});
const latencyChartAria = computed(() => {
  const s = latencyStats.value;
  return 'Latência das sondas: mínimo ' + s.min + 'ms, médio ' + s.avg + 'ms, máximo ' + s.max + 'ms.';
});

// ===================== Relógio / auto =====================
const autoLabel = computed(() => {
  void tick.value; // depende de tick para reavaliar
  if (!updatedAt.value) return 'Coletando…';
  return 'Última leitura: ' + format.formatDateTime(updatedAt.value);
});

// ===================== Links externos (ExternalLinkCard) =====================
const externalLinks = [
  {
    href: '/grafana',
    icon: '📊',
    tone: 'accent',
    title: 'Grafana',
    desc: 'Dashboards de métricas e logs da plataforma',
  },
  {
    href: '/devops',
    icon: '🛰',
    tone: 'ok',
    title: 'DevOps Console',
    desc: 'Saúde de pods, publicações e logs ao vivo',
  },
  {
    href: API_BASE + '/metrics',
    icon: '🔢',
    tone: 'warn',
    title: 'Métricas Prometheus',
    desc: 'Endpoint /metrics cru exposto pela API',
  },
  {
    href: '/argocd',
    icon: '🚀',
    tone: 'neutral',
    title: 'Argo CD',
    desc: 'Estado de sincronização do GitOps',
  },
];

onMounted(() => {
  load();
  startAuto();
});
onBeforeUnmount(stopAuto);
</script>

<style scoped>
/* ===================== HEALTH PANEL ===================== */
.hf-health {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: var(--ui-space-4);
}
.hf-health-card {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4) var(--ui-space-5);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-top: 3px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-sm);
}
.hf-health-card[data-tone="success"] {
  border-top-color: rgb(var(--ui-ok));
}
.hf-health-card[data-tone="warning"] {
  border-top-color: rgb(var(--ui-warn));
}
.hf-health-card[data-tone="error"] {
  border-top-color: rgb(var(--ui-danger));
}
.hf-health-card[data-tone="neutral"] {
  border-top-color: rgb(var(--ui-faint));
}
.hf-health-top {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}
.hf-health-name {
  font-weight: 700;
  color: rgb(var(--ui-fg));
  margin-right: auto;
}
.hf-health-pulse {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgb(var(--ui-faint));
  flex-shrink: 0;
}
.hf-health-pulse[data-tone="success"] {
  background: rgb(var(--ui-ok));
  box-shadow: 0 0 0 0 rgb(var(--ui-ok) / 0.5);
  animation: hf-pulse 2s infinite;
}
.hf-health-pulse[data-tone="warning"] {
  background: rgb(var(--ui-warn));
}
.hf-health-pulse[data-tone="error"] {
  background: rgb(var(--ui-danger));
  box-shadow: 0 0 0 0 rgb(var(--ui-danger) / 0.5);
  animation: hf-pulse 1.4s infinite;
}
@keyframes hf-pulse {
  0% {
    box-shadow: 0 0 0 0 rgb(var(--ui-ok) / 0.45);
  }
  70% {
    box-shadow: 0 0 0 7px rgb(var(--ui-ok) / 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgb(var(--ui-ok) / 0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .hf-health-pulse {
    animation: none !important;
  }
}
.hf-health-detail {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  min-height: 2.4em;
}
.hf-health-meta {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: var(--ui-space-2);
  border-top: 1px dashed rgb(var(--ui-border));
}
.hf-health-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  font-size: var(--ui-text-xs);
}
.hf-health-row dt {
  color: rgb(var(--ui-muted));
}
.hf-health-row dd {
  margin: 0;
  font-weight: 600;
  color: rgb(var(--ui-fg));
  font-variant-numeric: tabular-nums;
}
.hf-code {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: 1px 6px;
  color: rgb(var(--ui-accent-strong));
}

/* ===================== METRIC TILES ===================== */
.hf-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}

/* ===================== GRID 2 COLUNAS ===================== */
.hf-grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: var(--ui-space-4);
  align-items: start;
}

/* ===================== TOPBAR DA TELA ===================== */
.hf-clock {
  align-self: center;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}
.hf-ico {
  font-weight: 700;
  line-height: 1;
}
.hf-live {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font: inherit;
  font-weight: 600;
  font-size: var(--ui-text-xs);
  padding: 6px 12px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-muted));
  cursor: pointer;
}
.hf-live[data-on="true"] {
  border-color: rgb(var(--ui-ok) / 0.5);
  background: rgb(var(--ui-ok) / 0.12);
  color: rgb(var(--ui-ok));
}
.hf-live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--ui-muted));
}
.hf-live[data-on="true"] .hf-live-dot {
  background: rgb(var(--ui-ok));
  animation: hf-blink 1.6s ease-in-out infinite;
}
@keyframes hf-blink {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.45;
    transform: scale(0.7);
  }
}
@media (prefers-reduced-motion: reduce) {
  .hf-live[data-on="true"] .hf-live-dot {
    animation: none;
  }
}

/* ===================== BANNER ===================== */
.hf-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4) var(--ui-space-5);
  border-radius: var(--ui-radius-lg);
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.1);
}
.hf-banner[data-tone="error"] {
  border-color: rgb(var(--ui-danger) / 0.4);
  background: rgb(var(--ui-danger) / 0.1);
}
.hf-banner-icon {
  font-size: 1.4rem;
}
.hf-banner-body {
  flex: 1;
  min-width: 0;
}
.hf-banner-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.hf-banner-text {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* ===================== ERRO INLINE / EMPTY SUAVE ===================== */
.hf-inline-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4);
  border: 1px dashed rgb(var(--ui-danger) / 0.4);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-danger) / 0.06);
}
.hf-inline-error-text {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-danger));
}
.hf-soft-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-6) var(--ui-space-4);
  text-align: center;
}
.hf-soft-empty-icon {
  font-size: 1.6rem;
  opacity: 0.7;
}
.hf-soft-empty-text {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  max-width: 38ch;
}

/* ===================== GRÁFICOS ===================== */
.hf-chart {
  width: 100%;
  height: 150px;
}
.hf-chart--line {
  height: 150px;
}
.hf-spark {
  width: 100%;
  height: 96px;
}
.hf-chart-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.hf-chart-grid line {
  stroke: rgb(var(--ui-border));
  stroke-width: 1;
  stroke-dasharray: 3 4;
}
.hf-bar {
  transition: opacity 0.15s ease;
}
.hf-bar[data-tone="running"] {
  fill: rgb(var(--ui-warn));
}
.hf-bar[data-tone="accent"] {
  fill: rgb(var(--ui-accent));
}
.hf-bar[data-tone="danger"] {
  fill: rgb(var(--ui-danger));
}
.hf-bar[data-tone="ok"] {
  fill: rgb(var(--ui-ok));
}
.hf-line {
  fill: none;
  stroke: rgb(var(--ui-accent));
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.hf-line--alt {
  stroke: rgb(var(--ui-accent-strong));
}
.hf-area {
  fill: rgb(var(--ui-accent) / 0.12);
  stroke: none;
}
.hf-dot {
  fill: rgb(var(--ui-accent));
  stroke: rgb(var(--ui-surface));
  stroke-width: 1.5;
}
.hf-dot[data-tone="warn"] {
  fill: rgb(var(--ui-warn));
}
.hf-dot[data-tone="danger"] {
  fill: rgb(var(--ui-danger));
}
.hf-dot[data-tone="ok"] {
  fill: rgb(var(--ui-ok));
}
.hf-line-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-4);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.hf-line-foot-now strong {
  color: rgb(var(--ui-fg));
  font-variant-numeric: tabular-nums;
}

/* ===================== LEGENDA ===================== */
.hf-legend {
  list-style: none;
  margin: var(--ui-space-4) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: var(--ui-space-2) var(--ui-space-4);
}
.hf-legend-item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
}
.hf-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--ui-radius-sm);
  flex-shrink: 0;
}
.hf-legend-dot[data-tone="running"] {
  background: rgb(var(--ui-warn));
}
.hf-legend-dot[data-tone="accent"] {
  background: rgb(var(--ui-accent));
}
.hf-legend-dot[data-tone="danger"] {
  background: rgb(var(--ui-danger));
}
.hf-legend-dot[data-tone="ok"] {
  background: rgb(var(--ui-ok));
}
.hf-legend-label {
  color: rgb(var(--ui-muted));
}
.hf-legend-value {
  margin-left: auto;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}

/* ===================== STATS DE LATÊNCIA ===================== */
.hf-stat-row {
  list-style: none;
  margin: var(--ui-space-4) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: var(--ui-space-3);
}
.hf-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.hf-stat-label {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.hf-stat-value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}

/* ===================== LINKS EXTERNOS ===================== */
.hf-links {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--ui-space-3);
}
.hf-link-anchor {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-fg));
  text-decoration: none;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.hf-link-anchor:hover {
  border-color: rgb(var(--ui-accent));
  transform: translateY(-1px);
}
.hf-link-anchor:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.hf-link-icon {
  font-size: 1.3rem;
  flex-shrink: 0;
}
.hf-link-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.hf-link-title {
  font-weight: 600;
}
.hf-link-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.hf-link-arrow {
  margin-left: auto;
  color: rgb(var(--ui-faint));
  font-size: 1.1rem;
}
.hf-link-anchor:hover .hf-link-arrow {
  color: rgb(var(--ui-accent));
}
.hf-links-note {
  margin: var(--ui-space-4) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

@media (max-width: 860px) {
  .hf-grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
