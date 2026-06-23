<template>
  <UiPageLayout
    width="wide"
    :eyebrow="'HelpFlow · Fila de processamento'"
    :title="pageTitle"
    :subtitle="'Payload, histórico de tentativas, último erro e operação da fila (idempotência + DLQ).'"
    :loading="loading"
    :error="loadErrorMessage"
    @retry="load"
  >
    <!-- ações globais -->
    <template #actions>
      <UiButton variant="ghost" to="/jobs">Voltar para a fila</UiButton>
      <UiButton
        variant="subtle"
        :loading="refreshing"
        :disabled="loading || notFound"
        @click="refresh"
      >Atualizar</UiButton>
      <!-- ReprocessButton: só para jobs na DLQ -->
      <UiButton
        v-if="isDlq"
        variant="primary"
        :loading="requeueing"
        @click="onRequeue"
      >Reprocessar</UiButton>
    </template>

    <!-- Banner operacional de alta visibilidade: job parado na DLQ -->
    <template v-if="!notFound && isDlq" #banner>
      <div class="banner" data-tone="dlq" role="alert">
        <span class="banner-icon" aria-hidden="true">{{ ICON_DLQ }}</span>
        <div class="banner-body">
          <p class="banner-title">Este job está na fila morta (DLQ)</p>
          <p class="banner-desc">
            Esgotou as tentativas e não será reprocessado automaticamente. Reenfileire para
            colocá-lo de volta na fila — a chave de idempotência impede duplicidade.
          </p>
        </div>
        <UiButton
          class="banner-cta"
          variant="primary"
          :loading="requeueing"
          @click="onRequeue"
        >Reprocessar</UiButton>
      </div>
    </template>

    <!-- ESTADO: job não encontrado (404) -->
    <UiCard v-if="notFound" padded>
      <UiEmptyState
        icon="search"
        :title="'Job #' + id + ' não encontrado'"
        description="Este item pode ter sido removido da fila ou o identificador está incorreto."
      >
        <template #action>
          <UiButton variant="primary" to="/jobs">Ver a fila de jobs</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <template v-else>
      <!-- EntityHeader -->
      <UiCard padded>
        <div class="jh">
          <div class="jh-main">
            <div class="jh-badges" role="group" aria-label="Situação do job">
              <UiStatusBadge :status="job.status" size="lg" :label="statusLabelFor(job.status)" />
              <UiStatusBadge
                tone="neutral"
                :with-dot="false"
                :label="'Tipo: ' + (job.type || '—')"
              />
              <UiStatusBadge
                :tone="attemptsBadgeTone"
                :with-dot="false"
                :label="'Tentativas: ' + attemptsText"
              />
              <UiStatusBadge
                v-if="dueLabel"
                :tone="dueTone"
                :with-dot="false"
                :label="dueLabel"
              />
            </div>

            <dl class="jh-meta">
              <div>
                <dt>Chave de idempotência</dt>
                <dd class="ui-mono jh-key">{{ job.job_key || '—' }}</dd>
              </div>
              <div>
                <dt>Identificador</dt>
                <dd class="ui-mono">#{{ id }}</dd>
              </div>
              <div>
                <dt>Criado em</dt>
                <dd>{{ fmtDateTime(job.created_at) }}</dd>
              </div>
              <div>
                <dt>Atualizado</dt>
                <dd>{{ fmtDateTime(job.updated_at) }}</dd>
              </div>
              <div>
                <dt>Executar após</dt>
                <dd>{{ fmtDateTime(job.run_after) }}</dd>
              </div>
              <div>
                <dt>Travado por (worker)</dt>
                <dd class="ui-mono">{{ job.locked_by || '—' }}</dd>
              </div>
            </dl>

            <!-- idempotência explicada -->
            <p class="jh-idem">
              <span class="jh-idem-icon" aria-hidden="true">{{ ICON_IDEMPOTENCY }}</span>
              A chave de idempotência garante que o mesmo trabalho não seja enfileirado duas vezes —
              reenviar a origem reaproveita este job em vez de criar um duplicado.
            </p>
          </div>

          <!-- AttemptMeter: barra de tentativas vs. máximo -->
          <div class="meter" :data-tone="attemptsTone" role="group" aria-label="Tentativas consumidas">
            <span class="meter-cap">Tentativas</span>
            <span class="meter-value">
              <strong>{{ job.attempts ?? 0 }}</strong>
              <span class="meter-sep">/</span>
              {{ maxAttemptsText }}
            </span>
            <div
              class="meter-track"
              role="progressbar"
              :aria-valuenow="job.attempts ?? 0"
              aria-valuemin="0"
              :aria-valuemax="job.max_attempts ?? 0"
              :aria-label="'Tentativas: ' + attemptsText"
            >
              <span class="meter-fill" :data-fill="attemptsPct" />
            </div>
            <span class="meter-hint">{{ attemptsHint }}</span>
          </div>
        </div>
      </UiCard>

      <div class="grid">
        <!-- coluna principal -->
        <div class="col-main">
          <!-- ErrorPanel: último erro -->
          <UiCard
            v-if="job.last_error"
            title="Último erro"
            subtitle="Mensagem registrada na falha mais recente."
          >
            <template #actions>
              <UiStatusBadge :status="job.status" size="sm" :label="statusLabelFor(job.status)" />
            </template>
            <div class="errpanel" :data-tone="isDlq ? 'dlq' : 'retry'" role="group" aria-label="Detalhe do último erro">
              <span class="errpanel-icon" aria-hidden="true">{{ errorIcon }}</span>
              <div class="errpanel-body">
                <p class="errpanel-lead">
                  {{ isDlq
                    ? 'Esgotou as tentativas e foi para a fila morta (DLQ).'
                    : 'Falhou e foi reagendado com backoff exponencial.' }}
                </p>
                <pre class="errpanel-msg ui-mono">{{ job.last_error }}</pre>
              </div>
            </div>
          </UiCard>

          <!-- JsonViewer: payload -->
          <UiCard title="Payload" subtitle="Dados de entrada com que o worker processa este job.">
            <template #actions>
              <UiButton variant="ghost" size="sm" :disabled="!hasPayload" @click="copyPayload">
                Copiar JSON
              </UiButton>
            </template>
            <UiEmptyState
              v-if="!hasPayload"
              icon="doc"
              title="Sem payload"
              description="Este job não carrega dados de entrada."
              compact
            />
            <pre v-else class="json ui-mono" tabindex="0" aria-label="Payload do job em JSON">{{ payloadJson }}</pre>
          </UiCard>

          <!-- AttemptTimeline: histórico de tentativas -->
          <UiCard
            title="Histórico de tentativas"
            :subtitle="timelineSubtitle"
          >
            <UiEmptyState
              v-if="!timeline.length"
              icon="clock"
              title="Sem eventos registrados"
              description="Quando o worker reivindicar este job, os eventos aparecerão aqui."
              compact
            />
            <ol v-else class="timeline">
              <li
                v-for="(ev, i) in timeline"
                :key="i"
                class="tl-item"
                :data-tone="ev.tone"
              >
                <span class="tl-dot" aria-hidden="true" />
                <div class="tl-content">
                  <div class="tl-head">
                    <span class="tl-title">{{ ev.title }}</span>
                    <UiStatusBadge
                      v-if="ev.badge"
                      :tone="badgeToneFor(ev.tone)"
                      size="sm"
                      :with-dot="false"
                      :label="ev.badge"
                    />
                  </div>
                  <p v-if="ev.detail" class="tl-detail">{{ ev.detail }}</p>
                  <p v-if="ev.at" class="tl-when">{{ fmtDateTime(ev.at) }}</p>
                </div>
              </li>
            </ol>
          </UiCard>

          <!-- Log de execução: saída do worker na tentativa mais recente -->
          <UiCard
            title="Log de execução"
            subtitle="Saída registrada pelo worker na tentativa mais recente."
          >
            <UiEmptyState
              v-if="!executionLog"
              icon="doc"
              title="Sem log de execução"
              description="O worker ainda não registrou saída para este job."
              compact
            />
            <pre
              v-else
              class="execlog ui-mono"
              tabindex="0"
              aria-label="Log de execução do job"
            >{{ executionLog }}</pre>
          </UiCard>
        </div>

        <!-- coluna lateral -->
        <aside class="col-side" aria-label="Operação e origem do job">
          <!-- ações de operação -->
          <UiCard title="Operação da fila" subtitle="Ações sobre este job.">
            <div class="ops">
              <p class="ops-line">
                Estado atual:
                <UiStatusBadge :status="job.status" size="sm" :label="statusLabelFor(job.status)" />
              </p>

              <UiButton
                v-if="isDlq"
                variant="primary"
                block
                :loading="requeueing"
                @click="onRequeue"
              >Reprocessar</UiButton>
              <p v-if="isDlq" class="ops-hint">
                Recoloca o job na fila com as tentativas zeradas. A idempotência impede duplicidade.
              </p>

              <p v-else class="ops-hint ops-hint-muted">
                {{ requeueUnavailableHint }}
              </p>
            </div>
          </UiCard>

          <!-- chamado de origem -->
          <UiCard title="Origem" subtitle="De onde este job foi disparado.">
            <div class="origin">
              <dl class="origin-meta">
                <div>
                  <dt>Tipo do job</dt>
                  <dd class="ui-mono">{{ job.type || '—' }}</dd>
                </div>
                <div v-if="sourceLabel">
                  <dt>Referência</dt>
                  <dd class="ui-mono">{{ sourceLabel }}</dd>
                </div>
              </dl>

              <UiButton
                v-if="sourceTicketId"
                variant="subtle"
                block
                :to="'/tickets/' + sourceTicketId"
              >Ver chamado de origem</UiButton>
              <p v-else class="ops-hint ops-hint-muted">
                Este job não referencia um chamado específico no payload — sem origem
                navegável.
              </p>
            </div>
          </UiCard>
        </aside>
      </div>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout, UiCard, UiButton, UiStatusBadge,
  UiEmptyState, useToast, useConfirm, format, resolveGlyph,
} from '../ui/index.js';
import * as api from '../api.js';

const props = defineProps({ id: { type: [String, Number], required: true } });
const toast = useToast();
const ask = useConfirm();

// ---- recurso de jobs: contrato real (GET /v1/jobs/:id + POST /v1/jobs/:id/requeue),
// exportado em api.js. Defensivo apenas contra ambientes onde o símbolo não exista. ----
const jobsApi = api.jobs || null;
function hasFn(obj, name) { return obj && typeof obj[name] === 'function'; }

// ---- glifos decorativos estáveis do kit (resolveGlyph) — sem emoji literal no template ----
const ICON_IDEMPOTENCY = resolveGlyph('lock');
const ICON_DLQ = resolveGlyph('ban');

// ---- estado base ----
const loading = ref(true);
const loadError = ref(null);
const notFound = ref(false);
const refreshing = ref(false);
const requeueing = ref(false);
const job = ref({});
const attemptsData = ref([]);
const attemptsError = ref(null);

// UiPageLayout espera string em :error — extraímos a mensagem do erro capturado.
const loadErrorMessage = computed(() => {
  const e = loadError.value;
  if (!e) return null;
  return e.message || 'Não foi possível carregar o job.';
});

// ---- rótulos de status (sem inventar domínio: só os estados declarados da fila) ----
const STATUS_LABELS = {
  queued: 'Na fila',
  running: 'Executando',
  done: 'Concluído',
  dlq: 'Falha (DLQ)',
};
const statusLabelFor = (s) => STATUS_LABELS[s] || (s ? format.humanize(s) : '—');
const fmtDateTime = (v) => format.formatDateTime(v);

// mapeia o tom interno da timeline (ok/warn/breach/neutral) → tom do UiStatusBadge.
function badgeToneFor(tone) {
  if (tone === 'breach') return 'error';
  if (tone === 'ok') return 'success';
  if (tone === 'warn') return 'warning';
  return 'neutral';
}

const pageTitle = computed(() => {
  const t = job.value.type;
  return t ? ('Job ' + t + ' · #' + props.id) : ('Job #' + props.id);
});

const isDlq = computed(() => job.value.status === 'dlq');

// ícone do ErrorPanel via kit (ban = DLQ definitivo, warn = retry agendado) — sem emoji literal.
const errorIcon = computed(() => resolveGlyph(isDlq.value ? 'ban' : 'warn'));

// ---- tentativas ----
const maxAttemptsText = computed(() => {
  const m = job.value.max_attempts;
  return m != null ? String(m) : '∞';
});
const attemptsText = computed(() => {
  const a = job.value.attempts ?? 0;
  const m = job.value.max_attempts;
  return m != null ? (a + ' de ' + m) : String(a);
});
const attemptsPct = computed(() => {
  const a = Number(job.value.attempts ?? 0);
  const m = Number(job.value.max_attempts ?? 0);
  if (!m || m <= 0) return '0';
  if (a >= m) return '100'; // saturado/esgotado → barra cheia, sem subestimar
  const pct = Math.max(0, Math.min(100, Math.round((a / m) * 100)));
  // quantiza em passos de 10 para casar com classes data-fill (CSP: sem :style)
  return String(Math.round(pct / 10) * 10);
});
// tom do medidor (border-left/fill) — usa o vocabulário do CSS (ok/warn/breach/neutral)
const attemptsTone = computed(() => {
  if (isDlq.value) return 'breach';
  const a = Number(job.value.attempts ?? 0);
  const m = Number(job.value.max_attempts ?? 0);
  if (!m) return 'neutral';
  if (a >= m) return 'breach';
  if (a >= Math.ceil(m * 0.6)) return 'warn';
  return 'ok';
});
// tom do badge (vocabulário do UiStatusBadge: success/warning/error/neutral)
const attemptsBadgeTone = computed(() => badgeToneFor(attemptsTone.value));
const attemptsHint = computed(() => {
  if (isDlq.value) return 'Tentativas esgotadas — movido para a DLQ.';
  const a = Number(job.value.attempts ?? 0);
  const m = Number(job.value.max_attempts ?? 0);
  if (!m) return 'Sem limite de tentativas definido.';
  const left = Math.max(0, m - a);
  if (left === 0) return 'Sem tentativas restantes.';
  return left + (left === 1 ? ' tentativa restante.' : ' tentativas restantes.');
});

// ---- janela de execução (run_after) ----
const dueLabel = computed(() => {
  if (!job.value.run_after) return '';
  const t = new Date(job.value.run_after).getTime();
  if (isNaN(t)) return '';
  if (job.value.status !== 'queued') return '';
  return t > Date.now() ? 'Agendado (backoff)' : 'Pronto para executar';
});
const dueTone = computed(() => {
  if (!job.value.run_after) return 'neutral';
  const t = new Date(job.value.run_after).getTime();
  if (isNaN(t)) return 'neutral';
  return t > Date.now() ? 'warning' : 'success';
});

// ---- payload (JsonViewer) ----
function parsePayload(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;
    try { return JSON.parse(s); } catch { return raw; }
  }
  return raw;
}
const payload = computed(() => parsePayload(job.value.payload));
const hasPayload = computed(() => {
  const p = payload.value;
  if (p == null) return false;
  if (Array.isArray(p)) return p.length > 0;
  if (typeof p === 'object') return Object.keys(p).length > 0;
  return String(p).length > 0;
});
const payloadJson = computed(() => {
  const p = payload.value;
  if (p == null) return '';
  if (typeof p === 'object') {
    try { return JSON.stringify(p, null, 2); } catch { return String(p); }
  }
  return String(p);
});

async function copyPayload() {
  if (!hasPayload.value) return;
  try {
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(payloadJson.value);
      toast.success('Payload copiado para a área de transferência');
    } else {
      toast.info('Cópia automática indisponível neste navegador');
    }
  } catch {
    toast.error('Não foi possível copiar o payload');
  }
}

// ---- chamado de origem (derivado do payload, sem inventar rota) ----
const sourceTicketId = computed(() => {
  const p = payload.value;
  if (!p || typeof p !== 'object') return null;
  const v = p.ticketId ?? p.ticket_id ?? p.ticket ?? null;
  return v != null && v !== '' ? v : null;
});
const sourceLabel = computed(() => {
  const p = payload.value;
  if (!p || typeof p !== 'object') return '';
  if (sourceTicketId.value != null) return 'Chamado #' + sourceTicketId.value;
  const rec = p.recordId ?? p.record_id ?? null;
  if (rec != null && rec !== '') return 'Registro #' + rec;
  return '';
});

// ---- AttemptTimeline ----
// Versão sintética: reconstrói eventos a partir do estado do job (fallback).
const syntheticTimeline = computed(() => {
  const j = job.value;
  if (!j || (j.created_at == null && j.status == null)) return [];
  const items = [];
  items.push({
    title: 'Enfileirado',
    detail: 'Job criado e adicionado à fila' + (j.job_key ? ' (chave ' + j.job_key + ').' : '.'),
    at: j.created_at,
    tone: 'neutral',
    badge: 'queued',
  });
  const a = Number(j.attempts ?? 0);
  if (a > 0) {
    items.push({
      title: a === 1 ? '1 tentativa de execução' : a + ' tentativas de execução',
      detail: j.locked_by ? ('Reivindicado pelo worker ' + j.locked_by + '.') : 'Processado pelo worker.',
      at: j.locked_at,
      tone: 'warn',
      badge: 'running',
    });
  }
  if (j.status === 'done') {
    items.push({
      title: 'Concluído com sucesso',
      detail: 'O worker confirmou (ack) o processamento.',
      at: j.updated_at,
      tone: 'ok',
      badge: 'done',
    });
  } else if (j.status === 'dlq') {
    items.push({
      title: 'Movido para a DLQ',
      detail: j.last_error ? ('Falha final: ' + truncate(j.last_error, 140)) : 'Esgotou as tentativas.',
      at: j.updated_at,
      tone: 'breach',
      badge: 'dlq',
    });
  } else if (j.status === 'queued' && a > 0) {
    items.push({
      title: 'Reagendado com backoff',
      detail: j.run_after ? ('Próxima execução após ' + fmtDateTime(j.run_after) + '.') : 'Aguardando nova janela.',
      at: j.updated_at,
      tone: 'warn',
      badge: 'queued',
    });
  } else if (j.status === 'running') {
    items.push({
      title: 'Em execução',
      detail: j.locked_by ? ('Travado por ' + j.locked_by + '.') : 'Sendo processado agora.',
      at: j.locked_at || j.updated_at,
      tone: 'warn',
      badge: 'running',
    });
  }
  return items;
});

// Versão real: construída a partir de GET /v1/jobs/:id/attempts (preferida).
const attemptsTimeline = computed(() => {
  const items = attemptsData.value;
  if (!Array.isArray(items) || items.length === 0) return null;
  const j = job.value;
  const result = [];
  result.push({
    title: 'Enfileirado',
    detail: 'Job criado e adicionado à fila' + (j.job_key ? ' (chave ' + j.job_key + ').' : '.'),
    at: j.created_at,
    tone: 'neutral',
    badge: 'queued',
  });
  for (const a of items) {
    const num = a.attempt ?? a.attempt_number ?? result.length;
    const st = String(a.status || a.state || '');
    const isOk = st === 'success' || st === 'done' || st === 'ok';
    const isFail = st === 'failed' || st === 'error' || st === 'dlq';
    const detail = a.error || (isOk ? 'Processado com sucesso pelo worker.' : null) ||
      (a.worker_id ? 'Worker: ' + a.worker_id : null) || null;
    result.push({
      title: 'Tentativa ' + num,
      detail,
      at: a.started_at || a.created_at,
      tone: isOk ? 'ok' : isFail ? 'breach' : 'warn',
      badge: isOk ? 'done' : isFail ? 'dlq' : 'running',
    });
  }
  return result;
});

// Timeline exposta ao template: usa dados reais quando disponíveis, sintético como fallback.
const timeline = computed(() => attemptsTimeline.value || syntheticTimeline.value);

// Log de execução: saída do worker na tentativa mais recente que registrou log.
const executionLog = computed(() => {
  const items = attemptsData.value;
  if (!Array.isArray(items) || items.length === 0) return null;
  for (let i = items.length - 1; i >= 0; i--) {
    const a = items[i];
    const log = a.log || a.execution_log || a.output || null;
    if (log && String(log).trim()) return String(log);
  }
  return null;
});
const timelineSubtitle = computed(() => {
  const a = Number(job.value.attempts ?? 0);
  if (!timeline.value.length) return 'Nenhum evento ainda.';
  return a + (a === 1 ? ' tentativa' : ' tentativas') + ' · estado ' + statusLabelFor(job.value.status).toLowerCase();
});

function truncate(s, n) {
  const str = String(s);
  return str.length > n ? (str.slice(0, n) + '…') : str;
}

const requeueUnavailableHint = computed(() => {
  if (job.value.status === 'done') return 'Job concluído — nada a reprocessar.';
  if (job.value.status === 'running') return 'Job em execução — aguarde o término antes de operar.';
  if (job.value.status === 'queued') return 'Job já está na fila para execução.';
  return 'Reenfileiramento disponível apenas para jobs na DLQ.';
});

// ---- carregamento ----
async function loadAttempts() {
  if (!hasFn(jobsApi, 'attempts')) return;
  try {
    const res = await jobsApi.attempts(props.id);
    attemptsData.value = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
    attemptsError.value = null;
  } catch (e) {
    attemptsError.value = e;
  }
}

async function load() {
  loading.value = true;
  loadError.value = null;
  notFound.value = false;
  attemptsData.value = [];
  attemptsError.value = null;
  try {
    if (!hasFn(jobsApi, 'get')) {
      throw new Error('Recurso de jobs indisponível neste ambiente.');
    }
    const [jobRes, _attemptsRes] = await Promise.allSettled([
      jobsApi.get(props.id),
      loadAttempts(),
    ]);
    if (jobRes.status === 'rejected') throw jobRes.reason;
    const data = jobRes.value;
    job.value = data || {};
    if (!job.value || (job.value.id == null && job.value.status == null)) {
      notFound.value = true;
    }
  } catch (e) {
    if (e && e.status === 404) {
      notFound.value = true;
    } else {
      loadError.value = e;
    }
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  refreshing.value = true;
  try {
    if (!hasFn(jobsApi, 'get')) { toast.error('Recurso de jobs indisponível.'); return; }
    const [jobRes] = await Promise.allSettled([
      jobsApi.get(props.id),
      loadAttempts(),
    ]);
    if (jobRes.status === 'fulfilled') job.value = jobRes.value || job.value;
    toast.info('Job atualizado');
  } catch (e) {
    if (e && e.status === 404) { notFound.value = true; }
    else { toast.error(e.message || 'Falha ao atualizar o job'); }
  } finally {
    refreshing.value = false;
  }
}

// ---- reenfileirar da DLQ (ação destrutiva → useConfirm + toast) ----
async function onRequeue() {
  const ok = await ask({
    title: 'Reprocessar job',
    message: 'Recolocar o job #' + props.id + ' na fila? As tentativas serão reiniciadas e o worker tentará processá-lo novamente.',
    confirmLabel: 'Reprocessar',
  });
  if (!ok) return;

  if (!hasFn(jobsApi, 'requeue')) {
    toast.error('Reenfileiramento indisponível neste ambiente.');
    return;
  }
  requeueing.value = true;
  try {
    const res = await jobsApi.requeue(props.id);
    if (res && (res.id != null || res.status)) {
      job.value = { ...job.value, ...res };
    }
    toast.success('Job reenfileirado — voltará a ser processado pelo worker');
    await refresh();
  } catch (e) {
    toast.error(e.message || 'Falha ao reenfileirar o job');
  } finally {
    requeueing.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
/* ---------- Banner operacional (DLQ) ---------- */
.banner {
  display: flex; gap: var(--ui-space-3); align-items: center;
  padding: var(--ui-space-4); border-radius: var(--ui-radius-lg);
  border: 1px solid rgb(var(--ui-danger) / 0.35); background: rgb(var(--ui-danger) / 0.08);
}
.banner-icon { flex: 0 0 auto; font-size: var(--ui-text-xl); line-height: 1; color: rgb(var(--ui-danger)); }
.banner-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.banner-title { margin: 0; font-weight: 700; color: rgb(var(--ui-fg)); }
.banner-desc { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); line-height: 1.5; }
.banner-cta { flex: 0 0 auto; }

/* ---------- EntityHeader ---------- */
.jh { display: flex; gap: var(--ui-space-5); align-items: stretch; flex-wrap: wrap; }
.jh-main { flex: 1 1 380px; min-width: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.jh-badges { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; align-items: center; }
.jh-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: var(--ui-space-3) var(--ui-space-4); margin: var(--ui-space-2) 0 0; }
.jh-meta dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .05em; }
.jh-meta dd { margin: 2px 0 0; font-weight: 600; word-break: break-word; }
.jh-key { font-weight: 600; }
.jh-idem {
  margin: var(--ui-space-2) 0 0; display: flex; gap: var(--ui-space-2); align-items: flex-start;
  padding: var(--ui-space-3); border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.08); border: 1px solid rgb(var(--ui-accent) / 0.25);
  color: rgb(var(--ui-fg)); font-size: var(--ui-text-sm); line-height: 1.5;
}
.jh-idem-icon { flex: 0 0 auto; }

/* ---------- AttemptMeter ---------- */
.meter {
  flex: 0 0 auto; width: 240px; display: flex; flex-direction: column; gap: 6px;
  padding: var(--ui-space-4); border-radius: var(--ui-radius-lg);
  border: 1px solid rgb(var(--ui-border)); background: rgb(var(--ui-surface-2));
  border-left: 4px solid rgb(var(--ui-faint));
}
.meter[data-tone="ok"] { border-left-color: rgb(var(--ui-ok)); }
.meter[data-tone="warn"] { border-left-color: rgb(var(--ui-warn)); background: rgb(var(--ui-warn) / 0.08); }
.meter[data-tone="breach"] { border-left-color: rgb(var(--ui-danger)); background: rgb(var(--ui-danger) / 0.08); }
.meter-cap { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .06em; }
.meter-value { font-family: var(--ui-font-display); font-size: var(--ui-text-xl); line-height: 1.05; color: rgb(var(--ui-fg)); }
.meter-value strong { font-weight: 800; }
.meter[data-tone="warn"] .meter-value strong { color: rgb(var(--ui-warn)); }
.meter[data-tone="breach"] .meter-value strong { color: rgb(var(--ui-danger)); }
.meter[data-tone="ok"] .meter-value strong { color: rgb(var(--ui-ok)); }
.meter-sep { color: rgb(var(--ui-faint)); margin: 0 2px; }
.meter-track { height: 8px; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-faint) / 0.4); overflow: hidden; }
.meter-fill { display: block; height: 100%; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-accent)); transition: width .25s ease; }
.meter[data-tone="warn"] .meter-fill { background: rgb(var(--ui-warn)); }
.meter[data-tone="breach"] .meter-fill { background: rgb(var(--ui-danger)); }
.meter[data-tone="ok"] .meter-fill { background: rgb(var(--ui-ok)); }
/* largura da barra via classes (CSP: sem :style inline) */
.meter-fill[data-fill="0"] { width: 0; }
.meter-fill[data-fill="10"] { width: 10%; }
.meter-fill[data-fill="20"] { width: 20%; }
.meter-fill[data-fill="30"] { width: 30%; }
.meter-fill[data-fill="40"] { width: 40%; }
.meter-fill[data-fill="50"] { width: 50%; }
.meter-fill[data-fill="60"] { width: 60%; }
.meter-fill[data-fill="70"] { width: 70%; }
.meter-fill[data-fill="80"] { width: 80%; }
.meter-fill[data-fill="90"] { width: 90%; }
.meter-fill[data-fill="100"] { width: 100%; }
.meter-hint { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* ---------- layout 2 colunas ---------- */
.grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: var(--ui-space-4); align-items: start; }
.col-main { display: flex; flex-direction: column; gap: var(--ui-space-4); min-width: 0; }
.col-side { display: flex; flex-direction: column; gap: var(--ui-space-4); position: sticky; top: var(--ui-space-4); }

/* ---------- ErrorPanel ---------- */
.errpanel {
  display: flex; gap: var(--ui-space-3); align-items: flex-start;
  padding: var(--ui-space-4); border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-danger) / 0.3); background: rgb(var(--ui-danger) / 0.07);
}
.errpanel[data-tone="retry"] { border-color: rgb(var(--ui-warn) / 0.4); background: rgb(var(--ui-warn) / 0.08); }
.errpanel-icon { flex: 0 0 auto; font-size: var(--ui-text-xl); line-height: 1; }
.errpanel[data-tone="dlq"] .errpanel-icon { color: rgb(var(--ui-danger)); }
.errpanel[data-tone="retry"] .errpanel-icon { color: rgb(var(--ui-warn)); }
.errpanel-body { min-width: 0; flex: 1 1 auto; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.errpanel-lead { margin: 0; font-weight: 700; }
.errpanel-msg {
  margin: 0; white-space: pre-wrap; word-break: break-word; line-height: 1.5;
  font-size: var(--ui-text-sm); color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface)); border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm); padding: var(--ui-space-3); max-height: 240px; overflow: auto;
}

/* ---------- JsonViewer ---------- */
.json {
  margin: 0; white-space: pre; overflow: auto; max-height: 420px; line-height: 1.55;
  font-size: var(--ui-text-sm); color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md); padding: var(--ui-space-4);
}
.json:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }

/* ---------- AttemptTimeline ---------- */
.timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-4); }
.tl-item { display: flex; gap: var(--ui-space-3); position: relative; }
.tl-item::before {
  content: ""; position: absolute; left: 5px; top: 16px; bottom: -16px; width: 2px;
  background: rgb(var(--ui-border));
}
.tl-item:last-child::before { display: none; }
.tl-dot {
  flex: 0 0 auto; width: 12px; height: 12px; border-radius: 50%; margin-top: 4px; z-index: 1;
  background: rgb(var(--ui-faint)); border: 2px solid rgb(var(--ui-surface));
  box-shadow: 0 0 0 1px rgb(var(--ui-border));
}
.tl-item[data-tone="ok"] .tl-dot { background: rgb(var(--ui-ok)); }
.tl-item[data-tone="warn"] .tl-dot { background: rgb(var(--ui-warn)); }
.tl-item[data-tone="breach"] .tl-dot { background: rgb(var(--ui-danger)); }
.tl-content { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.tl-head { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.tl-title { font-weight: 700; font-size: var(--ui-text-md); }
.tl-detail { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); line-height: 1.5; word-break: break-word; }
.tl-when { margin: 0; color: rgb(var(--ui-faint)); font-size: var(--ui-text-xs); }

/* ---------- coluna lateral ---------- */
.ops { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.ops-line { margin: 0; display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.ops-hint { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); line-height: 1.5; }
.ops-hint-muted { font-style: italic; }
.origin { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.origin-meta { display: flex; flex-direction: column; gap: var(--ui-space-3); margin: 0; }
.origin-meta dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .05em; }
.origin-meta dd { margin: 2px 0 0; font-weight: 600; word-break: break-word; }

/* ---------- Log de execução ---------- */
.execlog {
  margin: 0; white-space: pre-wrap; overflow: auto; max-height: 360px; line-height: 1.55;
  font-size: var(--ui-text-sm); color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md); padding: var(--ui-space-4); word-break: break-word;
}
.execlog:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }

/* ---------- responsivo ---------- */
@media (max-width: 980px) {
  .grid { grid-template-columns: 1fr; }
  .col-side { position: static; }
  .meter { width: 100%; }
  .banner { flex-direction: column; align-items: flex-start; }
  .banner-cta { align-self: stretch; }
}
</style>
