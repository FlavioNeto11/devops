<!--
  AsyncJobDetailView — Detalhes do Job (REQ-NEUROEVOLUI-0003)
  Rota: /async-jobs/:id    Entidade: async-jobs

  Exibe o detalhe completo de um job assíncrono BullMQ: cabeçalho, payload JSON formatado,
  histórico de transição de status e link para o recurso originador quando aplicável.

  Ciclo de vida dos status:
    queued     → na fila, aguardando processamento        → polling automático
    processing → executando no worker                    → polling automático
    done       → concluído com sucesso                   → estado final verde
    failed     → falhou                                  → estado final vermelho + detalhe de erro

  Endpoints REAIS (via ../api.js):
    GET /v1/async-jobs/:id  → job completo

  Kit-only (../ui/index.js) + tokens --ui-* + CSP-safe (sem style inline, :style, v-html).
  Estados: loading (skeleton) · queued/processing (polling) · done · failed · error fatal.
-->
<template>
  <UiPageLayout
    eyebrow="NeuroEvolui · Filas Assíncronas"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="wide"
    :loading="initialLoading"
    :error="fatalError"
    @retry="loadJob"
  >
    <!-- ── AÇÕES DO CABEÇALHO ────────────────────────────────────────────────── -->
    <template #actions>
      <UiButton variant="ghost" to="/jobs">← Voltar</UiButton>
      <UiButton variant="subtle" :loading="refreshing" @click="loadJob">
        Atualizar
      </UiButton>
    </template>

    <!-- ── BANNER DE SITUAÇÃO ──────────────────────────────────────────────── -->
    <template v-if="job" #banner>
      <div class="ajd-banner" :data-tone="statusTone" role="status" aria-live="polite">
        <span class="ajd-banner-indicator" aria-hidden="true">
          <span v-if="isPolling" class="ajd-spin ui-spin" />
          <span v-else class="ajd-banner-dot" />
        </span>
        <div class="ajd-banner-main">
          <p class="ajd-banner-title">
            <span aria-hidden="true">
              <UiStatusBadge
                :status="job.status"
                :tone="statusTone"
                :label="statusLabelText"
                size="lg"
                with-dot
              />
            </span>
            <strong class="ajd-banner-headline">{{ bannerHeadline }}</strong>
          </p>
          <p class="ajd-banner-text">{{ bannerText }}</p>
        </div>
        <span v-if="isPolling && elapsedLabel" class="ajd-banner-elapsed" aria-hidden="true">
          {{ elapsedLabel }}
        </span>
      </div>
    </template>

    <!-- ════════════════════════════════════════════════════════════════════
         CONTEÚDO PRINCIPAL (disponível quando job carregado)
    ═══════════════════════════════════════════════════════════════════════ -->
    <template v-if="job">

      <!-- ── MÉTRICAS DE RESUMO ────────────────────────────────────────── -->
      <section class="ajd-metrics" aria-label="Resumo do job">
        <UiMetricCard
          label="Status atual"
          :value="statusLabelText"
          :tone="statusTone"
          hint="estado do job na fila"
        />
        <UiMetricCard
          label="Fila"
          :value="queueLabel"
          tone="neutral"
          hint="nome da fila BullMQ"
        />
        <UiMetricCard
          label="Enfileirado em"
          :value="enqueuedAt"
          tone="neutral"
          hint="data/hora de criação"
        />
        <UiMetricCard
          v-if="processingDuration"
          label="Tempo de processamento"
          :value="processingDuration"
          :tone="isDone ? 'success' : 'neutral'"
          hint="duração do job"
        />
      </section>

      <!-- ── CABEÇALHO DO JOB ──────────────────────────────────────────── -->
      <UiCard title="Identificação do job" subtitle="Dados de identidade e rastreabilidade do job.">
        <template #actions>
          <UiStatusBadge
            :status="job.status"
            :tone="statusTone"
            :label="statusLabelText"
            size="lg"
            with-dot
          />
        </template>

        <dl class="ajd-kv ajd-kv-3">
          <div class="ajd-kv-row">
            <dt>ID do job</dt>
            <dd class="ajd-mono">{{ display(job.job_id || job.id) }}</dd>
          </div>
          <div class="ajd-kv-row">
            <dt>Chave do job</dt>
            <dd class="ajd-mono">{{ display(job.job_key) }}</dd>
          </div>
          <div class="ajd-kv-row">
            <dt>Fila</dt>
            <dd>
              <span class="ajd-queue-chip" :data-queue="norm(job.queue_name)">
                {{ queueLabel }}
              </span>
            </dd>
          </div>
          <div class="ajd-kv-row">
            <dt>Status</dt>
            <dd>
              <span aria-hidden="true">
                <UiStatusBadge :status="job.status" :tone="statusTone" :label="statusLabelText" />
              </span>
            </dd>
          </div>
          <div class="ajd-kv-row">
            <dt>Enfileirado em</dt>
            <dd>{{ fmt.formatDateTime(job.created_at) }}</dd>
          </div>
          <div class="ajd-kv-row">
            <dt>Criado por</dt>
            <dd>{{ display(job.created_by) }}</dd>
          </div>
        </dl>

        <template v-if="isPolling" #footer>
          <div class="ajd-foot-actions">
            <UiButton variant="subtle" size="sm" :loading="refreshing" @click="loadJob">
              Verificar agora
            </UiButton>
            <span class="ajd-countdown-label" aria-live="polite">
              Próxima verificação em {{ countdownLabel }}
            </span>
          </div>
        </template>
      </UiCard>

      <!-- ── PAYLOAD JSON ──────────────────────────────────────────────── -->
      <UiCard
        title="Payload do job"
        subtitle="Dados de entrada enviados para o worker na fila."
      >
        <template v-if="hasPayload">
          <div class="ajd-payload-toolbar">
            <span class="ajd-payload-label">JSON · {{ payloadByteSize }}</span>
            <span class="ajd-payload-hint">somente leitura</span>
          </div>
          <div
            class="ajd-payload-viewer"
            role="region"
            aria-label="Payload JSON do job"
            tabindex="0"
          >
            <pre class="ajd-payload-pre"><code>{{ payloadFormatted }}</code></pre>
          </div>
        </template>
        <template v-else>
          <UiEmptyState
            icon="file"
            title="Sem payload"
            description="Este job não carrega payload de dados ou o campo não foi preenchido."
          />
        </template>
      </UiCard>

      <!-- ── LINHA DO TEMPO DE STATUS ──────────────────────────────────── -->
      <UiCard
        title="Histórico de transições"
        subtitle="Estágios percorridos pelo job desde o enfileiramento."
      >
        <ol class="ajd-timeline" aria-label="Histórico de transições de status">
          <li
            v-for="(step, i) in statusTimeline"
            :key="step.key"
            class="ajd-tl-item"
            :data-state="step.state"
            :aria-current="step.state === 'active' ? 'step' : undefined"
          >
            <!-- conector vertical (exceto no último) -->
            <div class="ajd-tl-track" aria-hidden="true">
              <span class="ajd-tl-dot" />
              <span v-if="i < statusTimeline.length - 1" class="ajd-tl-line" />
            </div>
            <div class="ajd-tl-content">
              <div class="ajd-tl-head">
                <span class="ajd-tl-step-label">{{ step.label }}</span>
                <span v-if="step.state === 'active'" class="ajd-tl-spin ui-spin" aria-label="em andamento" />
                <span v-else-if="step.state === 'done'" class="ajd-tl-check" aria-label="concluído">✓</span>
                <span v-else-if="step.state === 'error'" class="ajd-tl-err" aria-label="falhou">✕</span>
              </div>
              <p class="ajd-tl-hint">{{ step.hint }}</p>
              <p v-if="step.timestamp" class="ajd-tl-time">{{ step.timestamp }}</p>
            </div>
          </li>
        </ol>

        <!-- Estado failed: mensagem de erro detalhada -->
        <template v-if="isFailed && errorMessage">
          <div class="ajd-sep" aria-hidden="true" />
          <div class="ajd-error-box" role="alert">
            <p class="ajd-error-box-title">Detalhes do erro</p>
            <p class="ajd-error-box-msg">{{ errorMessage }}</p>
          </div>
        </template>
      </UiCard>

      <!-- ── RECURSO ORIGINADOR ────────────────────────────────────────── -->
      <UiCard
        v-if="originatorRoute"
        title="Recurso vinculado"
        subtitle="O job foi disparado por este recurso do domínio."
      >
        <div class="ajd-originator">
          <div class="ajd-originator-icon" aria-hidden="true">
            <span class="ajd-orig-glyph">{{ originatorIcon }}</span>
          </div>
          <div class="ajd-originator-body">
            <p class="ajd-originator-type">{{ originatorTypeLabel }}</p>
            <p class="ajd-originator-id">{{ originatorIdLabel }}</p>
          </div>
          <UiButton variant="ghost" size="sm" :to="originatorRoute">
            Ver recurso →
          </UiButton>
        </div>
      </UiCard>

    </template>

    <!-- ── FOOTER ──────────────────────────────────────────────────────────── -->
    <template #footer>
      <span>
        Job {{ display(displayId) }}
        <template v-if="job"> · Fila: {{ queueLabel }}</template>
        <template v-if="isPolling"> · A página atualiza automaticamente.</template>
      </span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiButton,
  UiEmptyState,
  useToast,
  format as fmt,
} from '../ui/index.js';
import { asyncJobs } from '../api.js';

const props = defineProps({ id: { type: [String, Number], required: true } });

const toast = useToast();

// ── Estado ────────────────────────────────────────────────────────────────────
const job = ref(null);
const initialLoading = ref(true);
const refreshing = ref(false);
const fatalError = ref(null);
const now = ref(Date.now());
const countdown = ref(0);

// ── Constantes de polling ─────────────────────────────────────────────────────
const POLL_MS = 4000;
const POLL_INTERVAL_S = Math.round(POLL_MS / 1000);
let pollTimer = null;
let clockTimer = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
const norm = (v) => String(v || '').toLowerCase().trim();
const display = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const displayId = computed(() =>
  job.value && job.value.id != null ? job.value.id : props.id
);

// ── Status ────────────────────────────────────────────────────────────────────
const STATUS_LABELS = {
  queued: 'Na fila',
  processing: 'Processando',
  done: 'Concluído',
  failed: 'Falhou',
};
const STATUS_TONES = {
  queued: 'running',
  processing: 'running',
  done: 'success',
  failed: 'error',
};

const statusKey = computed(() => norm(job.value && job.value.status));
const statusLabelText = computed(() =>
  STATUS_LABELS[statusKey.value] || (job.value ? fmt.humanize(job.value.status) : '—')
);
const statusTone = computed(() => STATUS_TONES[statusKey.value] || 'neutral');

const isPolling = computed(() =>
  ['queued', 'processing'].includes(statusKey.value) && !fatalError.value
);
const isDone = computed(() => statusKey.value === 'done' || statusKey.value === 'completed');
const isFailed = computed(() => statusKey.value === 'failed' || statusKey.value === 'error');

// ── Filas ─────────────────────────────────────────────────────────────────────
const QUEUE_LABELS = {
  'consultation-notes': 'Notas de consulta',
  'patient-imports': 'Importação de pacientes',
  notifications: 'Notificações',
  'summaries-ai': 'Resumos por IA',
  'patient-reports': 'Relatórios de paciente',
};

const queueLabel = computed(() => {
  const q = job.value && job.value.queue_name;
  if (!q) return '—';
  return QUEUE_LABELS[norm(q)] || fmt.humanize(q);
});

// ── Cabeçalho ─────────────────────────────────────────────────────────────────
const pageTitle = computed(() => {
  if (!job.value) return 'Detalhes do job #' + display(props.id);
  const key = job.value.job_key || job.value.job_id || job.value.id;
  return 'Job: ' + display(key);
});
const pageSubtitle = computed(() => {
  if (!job.value) return 'Carregando…';
  const q = queueLabel.value !== '—' ? 'Fila: ' + queueLabel.value + ' · ' : '';
  return q + statusLabelText.value;
});

// ── Banner ────────────────────────────────────────────────────────────────────
const bannerHeadline = computed(() => {
  if (isDone.value) return 'Job concluído com sucesso.';
  if (isFailed.value) return 'O job falhou durante a execução.';
  if (statusKey.value === 'queued') return 'Job aguardando na fila de processamento.';
  if (statusKey.value === 'processing') return 'Worker processando o job agora…';
  return 'Processando.';
});
const bannerText = computed(() => {
  if (isDone.value) return 'O job foi processado e concluído sem erros.';
  if (isFailed.value)
    return errorMessage.value || 'O worker encontrou um erro durante a execução.';
  return 'Esta página verifica automaticamente o status a cada ' + POLL_INTERVAL_S + ' segundos.';
});

// ── Tempos ────────────────────────────────────────────────────────────────────
const enqueuedAt = computed(() => {
  if (!job.value || !job.value.created_at) return '—';
  return fmt.formatDateTime(job.value.created_at);
});

function durationFromMs(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + (s === 1 ? ' segundo' : ' segundos');
  const m = Math.round(s / 60);
  if (m < 60) return m + (m === 1 ? ' minuto' : ' minutos');
  const h = Math.round(m / 60);
  return h + (h === 1 ? ' hora' : ' horas');
}

const elapsedLabel = computed(() => {
  if (!job.value || !job.value.created_at) return '';
  const a = new Date(job.value.created_at).getTime();
  if (!isFinite(a)) return '';
  const ms = now.value - a;
  return ms > 2000 ? durationFromMs(ms) : '';
});

const processingDuration = computed(() => {
  if (!job.value) return null;
  const start = job.value.started_at || job.value.created_at;
  const end = job.value.completed_at || job.value.finished_at;
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!isFinite(a) || !isFinite(b) || b < a) return null;
  return durationFromMs(b - a);
});

const countdownLabel = computed(() => {
  const s = countdown.value;
  return s <= 0 ? 'verificando…' : s + (s === 1 ? ' segundo' : ' segundos');
});

// ── Payload ───────────────────────────────────────────────────────────────────
const rawPayload = computed(() => job.value && job.value.payload);
const hasPayload = computed(() => {
  const p = rawPayload.value;
  return p !== null && p !== undefined && p !== '';
});
const payloadFormatted = computed(() => {
  const p = rawPayload.value;
  if (!hasPayload.value) return '';
  if (typeof p === 'string') {
    try {
      return JSON.stringify(JSON.parse(p), null, 2);
    } catch {
      return p;
    }
  }
  try {
    return JSON.stringify(p, null, 2);
  } catch {
    return String(p);
  }
});
const payloadByteSize = computed(() => {
  const s = payloadFormatted.value;
  if (!s) return '';
  const bytes = new TextEncoder().encode(s).length;
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(1) + ' KB';
});

// ── Mensagem de erro ──────────────────────────────────────────────────────────
const errorMessage = computed(() => {
  if (!job.value) return '';
  return (
    job.value.error_message ||
    job.value.error ||
    (job.value.result && job.value.result.error) ||
    ''
  );
});

// ── Linha do tempo de status ──────────────────────────────────────────────────
/*
  Passos fixos do ciclo de vida. Para cada passo, derivamos seu `state`
  com base no status atual do job:
    done    → passo concluído
    active  → passo em andamento
    error   → passo falhou (só o atual quando failed)
    pending → ainda não chegou aqui
*/
const PIPELINE_STEPS = [
  {
    key: 'queued',
    label: 'Enfileirado',
    hint: 'Job aceito e aguardando um worker disponível.',
    tsField: 'created_at',
  },
  {
    key: 'processing',
    label: 'Em processamento',
    hint: 'Worker recebeu o job e iniciou a execução.',
    tsField: 'started_at',
  },
  {
    key: 'done',
    label: 'Concluído',
    hint: 'Job finalizado com sucesso.',
    tsField: 'completed_at',
  },
];

const statusTimeline = computed(() => {
  const sk = statusKey.value;
  // Índice do passo atual no pipeline
  const stepOrder = ['queued', 'processing', 'done'];
  const currentStep = sk === 'failed' ? 'processing' : sk;
  const currentIdx = stepOrder.indexOf(currentStep);

  return PIPELINE_STEPS.map((step, i) => {
    let state;
    if (isFailed.value && i === 1) {
      // processing foi o passo que falhou
      state = 'error';
    } else if (i < currentIdx || (isDone.value && i === 2)) {
      state = 'done';
    } else if (i === currentIdx && !isDone.value) {
      state = 'active';
    } else {
      state = 'pending';
    }

    const tsVal = job.value && job.value[step.tsField];
    const timestamp = tsVal ? fmt.formatDateTime(tsVal) : null;

    return { ...step, state, timestamp };
  });
});

// ── Recurso originador (link para o recurso que disparou o job) ───────────────
/*
  Derivamos a rota e o tipo do recurso originador a partir dos dados do job.
  Mapeamento de fila → rota de domínio real.
*/
const QUEUE_ORIGINATOR = {
  'consultation-notes': { route: '/consultations', label: 'Consulta', icon: '📋' },
  'patient-imports': { route: '/patients', label: 'Importação de paciente', icon: '👤' },
  notifications: { route: '/notifications', label: 'Notificação', icon: '🔔' },
  'summaries-ai': { route: '/evolution-notes', label: 'Evolução clínica', icon: '🧠' },
  'patient-reports': { route: '/patient-reports', label: 'Relatório de paciente', icon: '📄' },
};

const originatorConfig = computed(() => {
  const q = job.value && norm(job.value.queue_name);
  return q ? QUEUE_ORIGINATOR[q] || null : null;
});

const originatorEntityId = computed(() => {
  if (!job.value) return null;
  // Tenta extrair o ID do recurso a partir do payload ou campos do job
  const p = rawPayload.value;
  if (typeof p === 'object' && p !== null) {
    return p.patient_id || p.consultation_id || p.report_id || p.entity_id || p.id || null;
  }
  if (typeof p === 'string') {
    try {
      const parsed = JSON.parse(p);
      return (
        parsed.patient_id ||
        parsed.consultation_id ||
        parsed.report_id ||
        parsed.entity_id ||
        parsed.id ||
        null
      );
    } catch {
      return null;
    }
  }
  return null;
});

const originatorRoute = computed(() => {
  const cfg = originatorConfig.value;
  if (!cfg) return null;
  const eid = originatorEntityId.value;
  return eid ? cfg.route + '/' + eid : cfg.route;
});

const originatorTypeLabel = computed(() => {
  const cfg = originatorConfig.value;
  return cfg ? cfg.label : '—';
});

const originatorIdLabel = computed(() => {
  const eid = originatorEntityId.value;
  return eid ? '#' + eid : 'Ver lista';
});

const originatorIcon = computed(() => {
  const cfg = originatorConfig.value;
  return cfg ? cfg.icon : '📦';
});

// ── Carregamento ──────────────────────────────────────────────────────────────
async function loadJob() {
  if (!initialLoading.value) refreshing.value = true;
  fatalError.value = null;
  countdown.value = 0;
  try {
    const res = await asyncJobs.get(props.id);
    job.value = res && res.data && typeof res.data === 'object' ? res.data : res;
    scheduleNextPoll();
  } catch (e) {
    if (e && e.status === 404) {
      fatalError.value = 'Job não encontrado. Pode ter expirado ou sido removido da fila.';
    } else {
      fatalError.value = e.message || 'Não foi possível carregar o job.';
    }
    stopPolling();
    toast.error(fatalError.value);
  } finally {
    initialLoading.value = false;
    refreshing.value = false;
  }
}

// ── Polling ───────────────────────────────────────────────────────────────────
function scheduleNextPoll() {
  stopPolling();
  if (isPolling.value) {
    countdown.value = POLL_INTERVAL_S;
    pollTimer = setTimeout(() => {
      refreshing.value = false;
      loadJob();
    }, POLL_MS);
  }
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

// ── Ciclo de vida ─────────────────────────────────────────────────────────────
watch(
  () => props.id,
  () => {
    initialLoading.value = true;
    job.value = null;
    loadJob();
  }
);

onMounted(() => {
  loadJob();
  clockTimer = setInterval(() => {
    now.value = Date.now();
    if (countdown.value > 0) countdown.value -= 1;
  }, 1000);
});

onBeforeUnmount(() => {
  stopPolling();
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
});
</script>

<style scoped>
/* ── Banner de situação ───────────────────────────────────────────────────── */
.ajd-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4) var(--ui-space-5);
  border: 1px solid rgb(var(--ui-border));
  border-left: 4px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
}
.ajd-banner[data-tone="success"] {
  border-left-color: rgb(var(--ui-ok));
  background: rgb(var(--ui-ok) / 0.05);
}
.ajd-banner[data-tone="error"] {
  border-left-color: rgb(var(--ui-danger));
  background: rgb(var(--ui-danger) / 0.05);
}
.ajd-banner[data-tone="running"] {
  border-left-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.05);
}
.ajd-banner[data-tone="neutral"] {
  border-left-color: rgb(var(--ui-muted));
}
.ajd-banner-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ajd-banner-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgb(var(--ui-muted));
}
.ajd-banner[data-tone="success"] .ajd-banner-dot { background: rgb(var(--ui-ok)); }
.ajd-banner[data-tone="error"] .ajd-banner-dot { background: rgb(var(--ui-danger)); }
.ajd-banner[data-tone="running"] .ajd-banner-dot { background: rgb(var(--ui-accent)); }
.ajd-spin { color: rgb(var(--ui-accent)); font-size: 1.1rem; }
.ajd-banner-main { flex: 1 1 auto; min-width: 0; }
.ajd-banner-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.ajd-banner-headline { font-weight: 600; color: rgb(var(--ui-fg)); }
.ajd-banner-text {
  margin: var(--ui-space-1) 0 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.ajd-banner-elapsed {
  flex-shrink: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  font-variant-numeric: tabular-nums;
}

/* ── Métricas ─────────────────────────────────────────────────────────────── */
.ajd-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(195px, 1fr));
  gap: var(--ui-space-4);
}

/* ── Pares chave-valor ────────────────────────────────────────────────────── */
.ajd-kv {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-space-4);
  margin: 0;
}
.ajd-kv-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.ajd-kv-row { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ajd-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
}
.ajd-kv dd {
  margin: 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-md);
  overflow-wrap: anywhere;
}
.ajd-mono {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-sm);
}

/* ── Chip de fila ─────────────────────────────────────────────────────────── */
.ajd-queue-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.ajd-queue-chip[data-queue="summaries-ai"],
.ajd-queue-chip[data-queue="consultation-notes"] {
  background: rgb(var(--ui-accent) / 0.10);
  border-color: rgb(var(--ui-accent) / 0.25);
  color: rgb(var(--ui-accent-strong));
}
.ajd-queue-chip[data-queue="patient-reports"] {
  background: rgb(var(--ui-ok) / 0.10);
  border-color: rgb(var(--ui-ok) / 0.25);
  color: rgb(var(--ui-ok));
}
.ajd-queue-chip[data-queue="notifications"] {
  background: rgb(var(--ui-warn) / 0.10);
  border-color: rgb(var(--ui-warn) / 0.25);
  color: rgb(var(--ui-warn));
}

/* ── Footer de card ───────────────────────────────────────────────────────── */
.ajd-foot-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.ajd-countdown-label {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}

/* ── Payload viewer ───────────────────────────────────────────────────────── */
.ajd-payload-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--ui-space-2) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-bottom: none;
  border-radius: var(--ui-radius-md) var(--ui-radius-md) 0 0;
}
.ajd-payload-label {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
}
.ajd-payload-hint {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-style: italic;
}
.ajd-payload-viewer {
  border: 1px solid rgb(var(--ui-border));
  border-radius: 0 0 var(--ui-radius-md) var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  overflow: auto;
  max-height: 420px;
  outline: none;
}
.ajd-payload-viewer:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 1px;
}
.ajd-payload-pre {
  margin: 0;
  padding: var(--ui-space-4) var(--ui-space-5);
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-sm);
  line-height: 1.6;
  color: rgb(var(--ui-fg));
  white-space: pre;
  tab-size: 2;
}

/* ── Linha do tempo de status ─────────────────────────────────────────────── */
.ajd-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.ajd-tl-item {
  display: flex;
  gap: var(--ui-space-3);
}
.ajd-tl-track {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 20px;
}
.ajd-tl-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
  flex-shrink: 0;
  margin-top: 3px;
  transition: background 0.2s, border-color 0.2s;
}
.ajd-tl-item[data-state="done"] .ajd-tl-dot {
  background: rgb(var(--ui-ok));
  border-color: rgb(var(--ui-ok));
}
.ajd-tl-item[data-state="active"] .ajd-tl-dot {
  background: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.2);
}
.ajd-tl-item[data-state="error"] .ajd-tl-dot {
  background: rgb(var(--ui-danger));
  border-color: rgb(var(--ui-danger));
}
.ajd-tl-line {
  flex: 1 1 auto;
  width: 2px;
  background: rgb(var(--ui-border));
  min-height: var(--ui-space-5);
}
.ajd-tl-item[data-state="done"] + .ajd-tl-item .ajd-tl-line,
.ajd-tl-item[data-state="done"] .ajd-tl-line {
  background: rgb(var(--ui-ok) / 0.35);
}
.ajd-tl-content {
  flex: 1 1 auto;
  padding: 0 0 var(--ui-space-5);
  min-width: 0;
}
.ajd-tl-head {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}
.ajd-tl-step-label {
  font-weight: 700;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.ajd-tl-item[data-state="pending"] .ajd-tl-step-label {
  color: rgb(var(--ui-muted));
  font-weight: 500;
}
.ajd-tl-spin { color: rgb(var(--ui-accent)); font-size: 0.9rem; }
.ajd-tl-check {
  color: rgb(var(--ui-ok));
  font-weight: 800;
  font-size: var(--ui-text-sm);
}
.ajd-tl-err {
  color: rgb(var(--ui-danger));
  font-weight: 800;
  font-size: var(--ui-text-sm);
}
.ajd-tl-hint {
  margin: 3px 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.ajd-tl-item[data-state="pending"] .ajd-tl-hint { color: rgb(var(--ui-faint)); }
.ajd-tl-time {
  margin: 4px 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}

/* ── Caixa de erro ────────────────────────────────────────────────────────── */
.ajd-sep {
  height: 1px;
  background: rgb(var(--ui-border));
  margin: var(--ui-space-5) 0;
}
.ajd-error-box {
  border-left: 4px solid rgb(var(--ui-danger));
  background: rgb(var(--ui-danger) / 0.06);
  border-radius: 0 var(--ui-radius-md) var(--ui-radius-md) 0;
  padding: var(--ui-space-4) var(--ui-space-5);
}
.ajd-error-box-title {
  margin: 0 0 var(--ui-space-2);
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 800;
  color: rgb(var(--ui-danger));
}
.ajd-error-box-msg {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* ── Recurso originador ───────────────────────────────────────────────────── */
.ajd-originator {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
}
.ajd-originator-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-accent) / 0.1);
  border: 1px solid rgb(var(--ui-accent) / 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ajd-orig-glyph { font-size: 1.4rem; line-height: 1; }
.ajd-originator-body { flex: 1 1 auto; min-width: 0; }
.ajd-originator-type {
  margin: 0;
  font-weight: 700;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
}
.ajd-originator-id {
  margin: 3px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  font-family: var(--ui-font-mono, monospace);
}

/* ── Responsivo ───────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .ajd-kv-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ajd-metrics { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
  .ajd-banner { flex-wrap: wrap; }
  .ajd-originator { flex-wrap: wrap; }
  .ajd-payload-viewer { max-height: 280px; }
}
@media (max-width: 560px) {
  .ajd-kv-3 { grid-template-columns: minmax(0, 1fr); }
}
</style>
