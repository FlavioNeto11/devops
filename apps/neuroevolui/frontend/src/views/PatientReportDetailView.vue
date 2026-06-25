<!--
  PatientReportDetailView — Relatório Gerado (REQ-NEUROEVOLUI-0004)
  Rota: /patient-reports/:id    Entidade: patient-reports

  Visualiza um relatório de paciente cujo processamento é assíncrono (job BullMQ). Cobre
  todos os estágios do ciclo de vida:
    - queued     → na fila, aguardando início            → polling automático
    - processing → motor consolidando evoluções          → polling automático
    - ready      → relatório pronto (conteúdo disponível) → render rico + download
    - error      → falhou                                → estado de erro + CTA

  Endpoints REAIS (via ../api.js):
    GET /v1/patient-reports/:id   → relatório completo (inclui content_url/report_data quando pronto)
    GET /v1/patients/:id          → resolve nome do paciente para cabeçalho (fail-soft)

  Kit-only (../ui/index.js) + tokens --ui-* + CSP-safe (sem style inline, :style, v-html).
  Estados: loading (skeleton) · queued/processing (job em andamento) · ready (conteúdo) · error.
-->
<template>
  <UiPageLayout
    eyebrow="NeuroEvolui · Relatórios de Paciente"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="wide"
    :loading="initialLoading"
    :error="fatalError"
    @retry="loadReport"
  >
    <!-- ── AÇÕES DO CABEÇALHO ──────────────────────────────────────────────── -->
    <template #actions>
      <UiButton variant="ghost" :to="backTo">← Voltar</UiButton>
      <UiButton variant="subtle" :loading="refreshing" @click="loadReport">
        Atualizar
      </UiButton>
      <UiButton
        v-if="patientHref"
        variant="ghost"
        :to="patientHref"
      >Ver paciente</UiButton>
      <UiButton
        v-if="isReady && downloadHref"
        variant="primary"
        :href="downloadHref"
        target="_blank"
        rel="noopener noreferrer"
      >Baixar relatório</UiButton>
    </template>

    <!-- ── BANNER DE SITUAÇÃO ─────────────────────────────────────────────── -->
    <!--
      Banner é o único anunciador de mudança de estado (role=status + aria-live).
      UiStatusBadge e spinner são aria-hidden para não anunciar em duplicata.
    -->
    <template v-if="report" #banner>
      <div class="prd-banner" :data-tone="statusTone" role="status" aria-live="polite">
        <span class="prd-banner-indicator" aria-hidden="true">
          <span v-if="isPolling" class="prd-spin ui-spin" />
          <span v-else class="prd-banner-dot" />
        </span>
        <div class="prd-banner-main">
          <p class="prd-banner-title">
            <span aria-hidden="true">
              <UiStatusBadge
                :status="report.status"
                :tone="statusTone"
                :label="statusLabel"
                size="lg"
                with-dot
              />
            </span>
            <strong class="prd-banner-headline">{{ bannerHeadline }}</strong>
          </p>
          <p class="prd-banner-text">{{ bannerText }}</p>
        </div>
        <span v-if="elapsedLabel && isPolling" class="prd-banner-elapsed" aria-hidden="true">
          {{ elapsedLabel }}
        </span>
      </div>
    </template>

    <!-- ════════════════════════════════════════════════════════════════════
         ESTADO: PROCESSANDO (queued / processing)
    ═══════════════════════════════════════════════════════════════════════ -->
    <template v-if="report && isPending">
      <!-- Card de status do job assíncrono -->
      <UiCard title="Status do processamento" subtitle="O motor de relatórios está trabalhando.">
        <div class="prd-job-card">
          <div class="prd-job-icon" aria-hidden="true">
            <span class="prd-job-spin ui-spin" />
          </div>
          <div class="prd-job-body">
            <p class="prd-job-title">{{ bannerHeadline }}</p>
            <p class="prd-job-text">
              O relatório consolida as evoluções clínicas do paciente no período
              selecionado. O processamento ocorre em segundo plano — esta página
              verifica automaticamente a cada {{ POLL_INTERVAL_S }} segundos.
            </p>
            <div class="prd-job-meta">
              <span class="prd-meta-chip">
                <span class="prd-meta-label">Solicitado em</span>
                <span class="prd-meta-value">{{ fmt.formatDateTime(report.created_at) }}</span>
              </span>
              <span v-if="elapsedLabel" class="prd-meta-chip">
                <span class="prd-meta-label">Em processamento há</span>
                <span class="prd-meta-value">{{ elapsedLabel }}</span>
              </span>
              <span class="prd-meta-chip">
                <span class="prd-meta-label">Próxima verificação em</span>
                <span class="prd-meta-value">{{ countdownLabel }}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Resumo dos filtros do relatório -->
        <div class="prd-sep" aria-hidden="true" />
        <dl class="prd-kv prd-kv-2">
          <div class="prd-kv-row">
            <dt>Situação</dt>
            <dd>
              <span aria-hidden="true">
                <UiStatusBadge :status="report.status" :tone="statusTone" :label="statusLabel" />
              </span>
            </dd>
          </div>
          <div class="prd-kv-row">
            <dt>Paciente</dt>
            <dd>{{ patientLabel }}</dd>
          </div>
          <div class="prd-kv-row">
            <dt>Período</dt>
            <dd>{{ periodLabel }}</dd>
          </div>
          <div class="prd-kv-row">
            <dt>Tipo de nota</dt>
            <dd>{{ noteTypeLabel(report.type) }}</dd>
          </div>
          <div class="prd-kv-row">
            <dt>Profissional solicitante</dt>
            <dd>{{ professionalIdLabel }}</dd>
          </div>
          <div class="prd-kv-row">
            <dt>ID do relatório</dt>
            <dd class="prd-mono">#{{ display(report.id) }}</dd>
          </div>
        </dl>

        <template #footer>
          <div class="prd-foot-actions">
            <UiButton variant="subtle" size="sm" :loading="refreshing" @click="loadReport">
              Verificar agora
            </UiButton>
            <UiButton v-if="patientHref" variant="ghost" size="sm" :to="patientHref">
              Abrir ficha do paciente
            </UiButton>
          </div>
        </template>
      </UiCard>

      <!-- Passos do fluxo de geração (progress tracker visual) -->
      <UiCard title="Fluxo de geração" subtitle="Estágios do processamento assíncrono do relatório.">
        <ol class="prd-steps">
          <li
            v-for="step in generationSteps"
            :key="step.key"
            class="prd-step-item"
            :data-state="step.state"
          >
            <span class="prd-step-dot" aria-hidden="true" />
            <div class="prd-step-content">
              <span class="prd-step-label">{{ step.label }}</span>
              <span v-if="step.hint" class="prd-step-hint">{{ step.hint }}</span>
            </div>
            <span v-if="step.state === 'active'" class="prd-step-spin ui-spin" aria-label="em andamento" />
            <span v-else-if="step.state === 'done'" class="prd-step-check" aria-label="concluído">✓</span>
          </li>
        </ol>
      </UiCard>
    </template>

    <!-- ════════════════════════════════════════════════════════════════════
         ESTADO: ERRO
    ═══════════════════════════════════════════════════════════════════════ -->
    <template v-else-if="report && isError">
      <UiCard title="Relatório não pôde ser gerado" subtitle="O processamento encontrou um erro.">
        <UiErrorState
          :message="report.error_message || 'O job de geração falhou. Solicite um novo relatório na ficha do paciente.'"
          :code="'Relatório #' + display(report.id)"
          :retryable="false"
        >
          <template #action>
            <UiButton
              v-if="patientHref"
              variant="subtle"
              size="sm"
              :to="patientHref"
            >Abrir ficha do paciente</UiButton>
            <UiButton variant="ghost" size="sm" :loading="refreshing" @click="loadReport">
              Recarregar
            </UiButton>
          </template>
        </UiErrorState>

        <div class="prd-sep" aria-hidden="true" />
        <dl class="prd-kv prd-kv-2">
          <div class="prd-kv-row">
            <dt>Paciente</dt>
            <dd>{{ patientLabel }}</dd>
          </div>
          <div class="prd-kv-row">
            <dt>Período</dt>
            <dd>{{ periodLabel }}</dd>
          </div>
          <div class="prd-kv-row">
            <dt>Solicitado em</dt>
            <dd>{{ fmt.formatDateTime(report.created_at) }}</dd>
          </div>
          <div class="prd-kv-row">
            <dt>Tipo de nota</dt>
            <dd>{{ noteTypeLabel(report.type) }}</dd>
          </div>
        </dl>
      </UiCard>
    </template>

    <!-- ════════════════════════════════════════════════════════════════════
         ESTADO: PRONTO (ready) — relatório disponível
    ═══════════════════════════════════════════════════════════════════════ -->
    <template v-else-if="report && isReady">
      <!-- Métricas de resumo -->
      <section class="prd-metrics" aria-label="Resumo do relatório">
        <UiMetricCard
          label="Total de evoluções"
          :value="totalNotes"
          tone="primary"
          hint="notas no período"
        />
        <UiMetricCard
          label="Período coberto"
          :value="periodSpanDays"
          tone="neutral"
          :hint="periodLabel"
        />
        <UiMetricCard
          label="Profissionais"
          :value="professionalCount"
          tone="neutral"
          hint="envolvidos no período"
        />
        <UiMetricCard
          label="Tempo de geração"
          :value="generationTimeLabel"
          tone="success"
          hint="fila → pronto"
        />
      </section>

      <!-- Identificação do relatório -->
      <UiCard title="Identificação do relatório" subtitle="Dados completos do relatório consolidado.">
        <template #actions>
          <UiStatusBadge :status="report.status" :tone="statusTone" :label="statusLabel" size="lg" />
        </template>
        <dl class="prd-kv prd-kv-3">
          <div class="prd-kv-row">
            <dt>Relatório</dt>
            <dd class="prd-mono">#{{ display(report.id) }}</dd>
          </div>
          <div class="prd-kv-row">
            <dt>Paciente</dt>
            <dd>
              <RouterLink v-if="patientHref" class="prd-link" :to="patientHref">
                {{ patientLabel }}
              </RouterLink>
              <span v-else>{{ patientLabel }}</span>
            </dd>
          </div>
          <div class="prd-kv-row">
            <dt>Situação</dt>
            <dd>
              <UiStatusBadge :status="report.status" :tone="statusTone" :label="statusLabel" />
            </dd>
          </div>
          <div class="prd-kv-row">
            <dt>Período de</dt>
            <dd>{{ fmt.formatDate(periodFrom) }}</dd>
          </div>
          <div class="prd-kv-row">
            <dt>Período até</dt>
            <dd>{{ fmt.formatDate(periodTo) }}</dd>
          </div>
          <div class="prd-kv-row">
            <dt>Tipo de nota</dt>
            <dd>{{ noteTypeLabel(report.type) }}</dd>
          </div>
          <div class="prd-kv-row">
            <dt>Profissional solicitante</dt>
            <dd>{{ professionalIdLabel }}</dd>
          </div>
          <div class="prd-kv-row">
            <dt>Solicitado em</dt>
            <dd>{{ fmt.formatDateTime(report.created_at) }}</dd>
          </div>
          <div class="prd-kv-row">
            <dt>Concluído em</dt>
            <dd>{{ fmt.formatDateTime(report.completed_at) }}</dd>
          </div>
        </dl>

        <template #footer>
          <div class="prd-foot-actions">
            <UiButton
              v-if="downloadHref"
              variant="primary"
              size="sm"
              :href="downloadHref"
              target="_blank"
              rel="noopener noreferrer"
            >Baixar relatório</UiButton>
            <UiButton v-if="patientHref" variant="ghost" size="sm" :to="patientHref">
              Ficha do paciente
            </UiButton>
          </div>
        </template>
      </UiCard>

      <!-- Visualizador: PDF incorporado ou conteúdo estruturado -->
      <UiCard title="Visualização do relatório" subtitle="Conteúdo consolidado gerado pelo motor de relatórios.">
        <!-- PDF embed quando disponível -->
        <template v-if="pdfUrl">
          <div class="prd-pdf-viewer" role="region" aria-label="Visualizador de PDF do relatório">
            <div class="prd-pdf-toolbar">
              <span class="prd-pdf-label">PDF incorporado</span>
              <UiButton
                variant="ghost"
                size="sm"
                :href="pdfUrl"
                target="_blank"
                rel="noopener noreferrer"
              >Abrir em nova aba</UiButton>
            </div>
            <div class="prd-pdf-frame-wrap">
              <iframe
                class="prd-pdf-frame"
                :src="pdfUrl"
                title="Relatório em PDF"
                aria-label="Documento PDF do relatório de evolução do paciente"
              />
            </div>
          </div>
        </template>

        <!-- Conteúdo estruturado (texto / evoluções) quando não há PDF -->
        <template v-else-if="hasStructuredContent">
          <!-- Sumário executivo -->
          <div v-if="summary" class="prd-summary">
            <p class="prd-summary-label">Sumário executivo</p>
            <p class="prd-summary-text">{{ summary }}</p>
          </div>

          <!-- Linha do tempo de evoluções -->
          <div v-if="timeline.length" class="prd-timeline-wrap">
            <div class="prd-section-head">
              <span class="prd-section-title">Linha do tempo</span>
              <span class="prd-count">{{ totalNotes }} {{ totalNotes === 1 ? 'evolução' : 'evoluções' }}</span>
            </div>
            <ol class="prd-timeline">
              <li
                v-for="item in sortedTimeline"
                :key="item.id || item.note_date"
                class="prd-tl-item"
              >
                <span class="prd-tl-dot" aria-hidden="true" />
                <div class="prd-tl-card">
                  <div class="prd-tl-head">
                    <UiStatusBadge
                      :status="item.type || 'session'"
                      :label="noteTypeLabel(item.type)"
                      tone="running"
                      size="sm"
                    />
                    <time class="prd-tl-date" :datetime="item.note_date">
                      {{ fmt.formatDateTime(item.note_date) }}
                    </time>
                  </div>
                  <p v-if="item.text" class="prd-tl-text">{{ item.text }}</p>
                  <p v-else class="prd-tl-empty">Nota sem descrição textual.</p>
                  <p v-if="resolveNoteAuthor(item)" class="prd-tl-foot">
                    Profissional: {{ resolveNoteAuthor(item) }}
                  </p>
                </div>
              </li>
            </ol>
          </div>

          <!-- Sem timeline e sem sumário (edge case) -->
          <UiEmptyState
            v-else-if="!summary"
            icon="file"
            title="Nenhum conteúdo disponível"
            description="O relatório foi gerado, mas não há dados de evolução no período selecionado."
          >
            <template #action>
              <UiButton v-if="patientHref" variant="subtle" :to="patientHref">
                Abrir ficha do paciente
              </UiButton>
            </template>
          </UiEmptyState>
        </template>

        <!-- Sem conteúdo disponível (pronto mas sem dados) -->
        <template v-else>
          <UiEmptyState
            icon="file"
            title="Conteúdo não disponível"
            description="O relatório foi marcado como pronto, mas o conteúdo ainda não está disponível para visualização."
          >
            <template #action>
              <UiButton variant="subtle" :loading="refreshing" @click="loadReport">
                Verificar novamente
              </UiButton>
            </template>
          </UiEmptyState>
        </template>
      </UiCard>

      <!-- Distribuição por tipo de evolução (tabela) -->
      <UiCard
        v-if="typeBreakdown.length"
        title="Distribuição por tipo de evolução"
        subtitle="Quantidade e participação por categoria de nota clínica."
      >
        <UiDataTable
          :columns="breakdownColumns"
          :rows="typeBreakdown"
          row-key="type"
          density="compact"
          :empty="{ title: 'Sem dados', description: 'Nenhuma evolução para categorizar.' }"
        >
          <template #cell-label="{ row }">{{ noteTypeLabel(row.type) }}</template>
          <template #cell-share="{ value }">
            <div class="prd-bar-wrap">
              <div class="prd-bar" :data-pct="value" aria-hidden="true" />
              <span>{{ value }}%</span>
            </div>
          </template>
        </UiDataTable>
      </UiCard>
    </template>

    <!-- ── FOOTER ──────────────────────────────────────────────────────────── -->
    <template #footer>
      <span>
        Relatório #{{ display(displayId) }} — gerado de forma assíncrona consolidando
        evoluções do paciente.
        <template v-if="isPolling"> A página atualiza automaticamente.</template>
      </span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiDataTable,
  UiButton,
  UiEmptyState,
  UiErrorState,
  useToast,
  format as fmt,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

const props = defineProps({ id: { type: [String, Number], required: true } });

const router = useRouter();
const toast = useToast();

// ── Clientes de recurso (só endpoints REAIS) ──────────────────────────────────
const reportsApi = resourceFactory('patient-reports');
const patientsApi = resourceFactory('patients');

// ── Estado ────────────────────────────────────────────────────────────────────
const report = ref(null);
const patient = ref(null);
const initialLoading = ref(true);
const refreshing = ref(false);
const fatalError = ref(null);
const now = ref(Date.now());
const countdown = ref(0); // segundos para próxima verificação automática

// ── Constantes de polling ─────────────────────────────────────────────────────
const POLL_MS = 4000;
const POLL_INTERVAL_S = Math.round(POLL_MS / 1000);

let pollTimer = null;
let clockTimer = null;

// ── Helpers de status ─────────────────────────────────────────────────────────
const STATUS_LABELS = {
  queued: 'Na fila',
  processing: 'Processando',
  ready: 'Pronto',
  error: 'Erro',
};
const STATUS_TONES = {
  queued: 'running',
  processing: 'running',
  ready: 'success',
  error: 'error',
};

const norm = (v) => String(v || '').toLowerCase().trim();
const statusKey = computed(() => norm(report.value && report.value.status));
const statusLabel = computed(() =>
  STATUS_LABELS[statusKey.value] || (report.value ? fmt.humanize(report.value.status) : '—')
);
const statusTone = computed(() => STATUS_TONES[statusKey.value] || 'neutral');

const isPending = computed(() => ['queued', 'processing'].includes(statusKey.value));
const isReady = computed(() => statusKey.value === 'ready' || statusKey.value === 'completed');
const isError = computed(() => statusKey.value === 'error' || statusKey.value === 'failed');
const isPolling = computed(() => isPending.value && !fatalError.value);

const display = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const displayId = computed(() =>
  report.value && report.value.id != null ? report.value.id : props.id
);

// ── Cabeçalho ─────────────────────────────────────────────────────────────────
const pageTitle = computed(() => 'Relatório #' + display(displayId.value));
const pageSubtitle = computed(() => {
  const who = patientLabel.value;
  const st = statusLabel.value;
  if (who && who !== '—') return 'Paciente: ' + who + ' · ' + st;
  return 'Relatório consolidado de evoluções · ' + st;
});

// ── Paciente vinculado ────────────────────────────────────────────────────────
const patientId = computed(() => report.value && report.value.patient_id);
const patientLabel = computed(() => {
  if (patient.value && patient.value.full_name) return patient.value.full_name;
  if (patient.value && patient.value.name) return patient.value.name;
  return patientId.value ? 'Paciente #' + patientId.value : '—';
});
const patientHref = computed(() => (patientId.value ? '/patients/' + patientId.value : null));
const backTo = computed(() => '/patient-reports');

// ── Profissional solicitante ──────────────────────────────────────────────────
const professionalIdLabel = computed(() => {
  if (!report.value) return '—';
  return report.value.professional_id ? '#' + report.value.professional_id : '—';
});

// ── Período ───────────────────────────────────────────────────────────────────
const periodFrom = computed(() => (report.value && report.value.date_from) || null);
const periodTo = computed(() => (report.value && report.value.date_to) || null);
const periodLabel = computed(() => {
  const a = periodFrom.value ? fmt.formatDate(periodFrom.value) : null;
  const b = periodTo.value ? fmt.formatDate(periodTo.value) : null;
  if (a && b) return a + ' — ' + b;
  if (a) return 'A partir de ' + a;
  if (b) return 'Até ' + b;
  return 'Histórico completo';
});

// ── Dados de conteúdo (quando pronto) ────────────────────────────────────────
const reportData = computed(() => (report.value && report.value.report_data) || {});
const summary = computed(() => reportData.value.summary || reportData.value.executive_summary || '');
const pdfUrl = computed(() => {
  const url = report.value && (report.value.pdf_url || report.value.content_url);
  // exibe só se termina em .pdf ou tem /pdf no path (outras URLs apontam conteúdo não-PDF)
  if (!url) return null;
  const lower = url.toLowerCase();
  return lower.includes('.pdf') || lower.includes('/pdf') ? url : null;
});
const downloadHref = computed(() =>
  (report.value && (report.value.pdf_url || report.value.content_url || report.value.download_url)) || null
);
const timeline = computed(() => {
  const t = reportData.value.timeline || reportData.value.notes || reportData.value.evolutions;
  return Array.isArray(t) ? t : [];
});
const sortedTimeline = computed(() =>
  [...timeline.value].sort(
    (a, b) => new Date(b.note_date || b.date || 0) - new Date(a.note_date || a.date || 0)
  )
);
const hasStructuredContent = computed(() => Boolean(summary.value || timeline.value.length));
const totalNotes = computed(() => {
  if (typeof reportData.value.total_notes === 'number') return reportData.value.total_notes;
  return timeline.value.length;
});
const professionalCount = computed(() => {
  const ids = new Set();
  for (const n of timeline.value) {
    const pid = n.professional_id || n.author_id;
    if (pid) ids.add(String(pid));
  }
  return ids.size || (report.value && report.value.professional_id ? 1 : 0);
});

// Span em dias das evoluções no relatório
const periodSpanDays = computed(() => {
  const dates = timeline.value
    .map((n) => new Date(n.note_date || n.date || 0).getTime())
    .filter((t) => isFinite(t) && t > 0);
  if (dates.length < 2) return '—';
  const days = Math.round((Math.max(...dates) - Math.min(...dates)) / 86400000);
  return days + (days === 1 ? ' dia' : ' dias');
});

// Tempo total de geração (fila → ready)
const generationTimeLabel = computed(() => {
  if (!report.value || !report.value.created_at || !report.value.completed_at) return '—';
  const a = new Date(report.value.created_at).getTime();
  const b = new Date(report.value.completed_at).getTime();
  if (!isFinite(a) || !isFinite(b) || b < a) return '—';
  return durationFromMs(b - a);
});

// Tempo decorrido enquanto pendente
const elapsedLabel = computed(() => {
  if (!report.value || !report.value.created_at) return '';
  const a = new Date(report.value.created_at).getTime();
  if (!isFinite(a)) return '';
  const ms = now.value - a;
  return ms > 2000 ? durationFromMs(ms) : '';
});

// Countdown para próxima verificação automática
const countdownLabel = computed(() => {
  const s = countdown.value;
  return s <= 0 ? 'verificando…' : s + (s === 1 ? ' segundo' : ' segundos');
});

function durationFromMs(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + (s === 1 ? ' segundo' : ' segundos');
  const m = Math.round(s / 60);
  if (m < 60) return m + (m === 1 ? ' minuto' : ' minutos');
  const h = Math.round(m / 60);
  return h + (h === 1 ? ' hora' : ' horas');
}

// ── Banner ────────────────────────────────────────────────────────────────────
const bannerHeadline = computed(() => {
  if (isReady.value) return 'Relatório pronto para visualização e download.';
  if (isError.value) return 'A geração do relatório falhou.';
  if (statusKey.value === 'queued') return 'Relatório aguardando na fila de processamento.';
  if (statusKey.value === 'processing') return 'Consolidando evoluções clínicas…';
  return 'Processando relatório.';
});
const bannerText = computed(() => {
  if (isReady.value)
    return 'Os dados abaixo consolidam as evoluções do paciente no período selecionado.';
  if (isError.value)
    return (
      (report.value && report.value.error_message) ||
      'Solicite um novo relatório na ficha do paciente.'
    );
  return 'Esta página verifica automaticamente o status a cada ' + POLL_INTERVAL_S + ' segundos.';
});

// ── Passos do fluxo de geração ───────────────────────────────────────────────
const STEPS = [
  { key: 'queued', label: 'Relatório enfileirado', hint: 'Aguardando slot no motor de jobs' },
  { key: 'processing', label: 'Agregando evoluções', hint: 'Consultando notas no período' },
  { key: 'rendering', label: 'Renderizando documento', hint: 'Compilando o conteúdo final' },
  { key: 'ready', label: 'Relatório disponível', hint: 'Pronto para visualização e download' },
];
const generationSteps = computed(() => {
  const sk = statusKey.value;
  const order = ['queued', 'processing', 'rendering', 'ready'];
  const currentIdx = sk === 'processing' ? 1 : sk === 'ready' || sk === 'completed' ? 3 : 0;
  return STEPS.map((step, i) => ({
    ...step,
    state:
      isError.value
        ? (i <= currentIdx ? 'error' : 'pending')
        : i < currentIdx
          ? 'done'
          : i === currentIdx
            ? 'active'
            : 'pending',
  }));
});

// ── Tipo de nota ──────────────────────────────────────────────────────────────
const NOTE_TYPE_LABELS = {
  session: 'Sessão',
  assessment: 'Avaliação',
  follow_up: 'Acompanhamento',
  discharge_note: 'Nota de alta',
  evolution: 'Evolução',
  prescription: 'Prescrição',
  referral: 'Encaminhamento',
};
function noteTypeLabel(t) {
  if (!t) return 'Todos os tipos';
  return NOTE_TYPE_LABELS[norm(t)] || fmt.humanize(t);
}

function resolveNoteAuthor(item) {
  if (!item) return '';
  const name = item.professional_name || item.author_name;
  if (name) return String(name);
  const id = item.professional_id || item.author_id;
  return id ? 'Profissional #' + id : '';
}

// ── Tabela de distribuição ────────────────────────────────────────────────────
const breakdownColumns = [
  { key: 'label', label: 'Tipo de evolução' },
  { key: 'count', label: 'Quantidade', align: 'right' },
  { key: 'share', label: 'Participação', align: 'right' },
];
const typeBreakdown = computed(() => {
  const counts = new Map();
  for (const n of timeline.value) {
    const k = norm(n.type) || 'session';
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const total = timeline.value.length || 1;
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count, share: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);
});

// ── Carregamento ──────────────────────────────────────────────────────────────
async function loadReport() {
  if (!initialLoading.value) refreshing.value = true;
  fatalError.value = null;
  countdown.value = 0;
  try {
    const res = await reportsApi.get(props.id);
    report.value = res && res.data && typeof res.data === 'object' ? res.data : res;
    if (patientId.value && (!patient.value || String(patient.value.id) !== String(patientId.value))) {
      loadPatient(patientId.value);
    }
    scheduleNextPoll();
  } catch (e) {
    if (e && e.status === 404) {
      fatalError.value = 'Relatório não encontrado. Pode ter sido excluído.';
    } else {
      fatalError.value = e.message || 'Não foi possível carregar o relatório.';
    }
    stopPolling();
    toast.error(fatalError.value);
  } finally {
    initialLoading.value = false;
    refreshing.value = false;
  }
}

async function loadPatient(id) {
  try {
    const res = await patientsApi.get(id);
    patient.value = res && res.data && typeof res.data === 'object' ? res.data : res;
  } catch {
    patient.value = null; // fail-soft
  }
}

// ── Polling ───────────────────────────────────────────────────────────────────
function scheduleNextPoll() {
  stopPolling();
  if (isPolling.value) {
    countdown.value = POLL_INTERVAL_S;
    pollTimer = setTimeout(() => {
      refreshing.value = false;
      loadReport();
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
    report.value = null;
    patient.value = null;
    loadReport();
  }
);

onMounted(() => {
  loadReport();
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
.prd-banner {
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
.prd-banner[data-tone="success"] {
  border-left-color: rgb(var(--ui-ok));
  background: rgb(var(--ui-ok) / 0.05);
}
.prd-banner[data-tone="error"] {
  border-left-color: rgb(var(--ui-danger));
  background: rgb(var(--ui-danger) / 0.05);
}
.prd-banner[data-tone="running"] {
  border-left-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.05);
}
.prd-banner-indicator { display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.prd-banner-dot { width: 10px; height: 10px; border-radius: 50%; background: rgb(var(--ui-muted)); }
.prd-banner[data-tone="success"] .prd-banner-dot { background: rgb(var(--ui-ok)); }
.prd-banner[data-tone="error"] .prd-banner-dot { background: rgb(var(--ui-danger)); }
.prd-banner[data-tone="running"] .prd-banner-dot { background: rgb(var(--ui-accent)); }
.prd-spin { color: rgb(var(--ui-accent)); font-size: 1.1rem; }
.prd-banner-main { flex: 1 1 auto; min-width: 0; }
.prd-banner-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.prd-banner-headline { font-weight: 600; color: rgb(var(--ui-fg)); }
.prd-banner-text {
  margin: var(--ui-space-1) 0 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.prd-banner-elapsed {
  flex-shrink: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  font-variant-numeric: tabular-nums;
}

/* ── Métricas ─────────────────────────────────────────────────────────────── */
.prd-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(195px, 1fr));
  gap: var(--ui-space-4);
}

/* ── Card de job assíncrono ──────────────────────────────────────────────── */
.prd-job-card {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-4);
  margin-bottom: var(--ui-space-5);
}
.prd-job-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-accent) / 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.prd-job-spin { color: rgb(var(--ui-accent)); font-size: 1.5rem; }
.prd-job-body { min-width: 0; }
.prd-job-title { margin: 0; font-weight: 700; font-size: var(--ui-text-lg); color: rgb(var(--ui-fg)); }
.prd-job-text {
  margin: var(--ui-space-2) 0 0;
  color: rgb(var(--ui-muted));
  line-height: 1.6;
  max-width: 64ch;
}
.prd-job-meta {
  margin: var(--ui-space-3) 0 0;
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.prd-meta-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  padding: 3px 10px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
  font-size: var(--ui-text-xs);
}
.prd-meta-label { color: rgb(var(--ui-muted)); }
.prd-meta-value { color: rgb(var(--ui-fg)); font-weight: 600; font-variant-numeric: tabular-nums; }

/* ── Separador ────────────────────────────────────────────────────────────── */
.prd-sep {
  height: 1px;
  background: rgb(var(--ui-border));
  margin: var(--ui-space-5) 0;
}

/* ── Pares chave-valor ────────────────────────────────────────────────────── */
.prd-kv {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-4);
  margin: 0;
}
.prd-kv-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.prd-kv-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.prd-kv-row { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.prd-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
}
.prd-kv dd {
  margin: 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-md);
  overflow-wrap: anywhere;
}
.prd-mono { font-family: var(--ui-font-mono, monospace); font-size: var(--ui-text-sm); }
.prd-link {
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  font-weight: 500;
}
.prd-link:hover { text-decoration: underline; }

/* ── Passos de geração ────────────────────────────────────────────────────── */
.prd-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.prd-step-item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
  position: relative;
}
.prd-step-item:last-child { border-bottom: none; }
.prd-step-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
  transition: background 0.2s, border-color 0.2s;
}
.prd-step-item[data-state="done"] .prd-step-dot {
  background: rgb(var(--ui-ok));
  border-color: rgb(var(--ui-ok));
}
.prd-step-item[data-state="active"] .prd-step-dot {
  background: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.2);
}
.prd-step-item[data-state="error"] .prd-step-dot {
  background: rgb(var(--ui-danger));
  border-color: rgb(var(--ui-danger));
}
.prd-step-content { flex: 1 1 auto; min-width: 0; }
.prd-step-label { display: block; font-weight: 600; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }
.prd-step-item[data-state="pending"] .prd-step-label { color: rgb(var(--ui-muted)); }
.prd-step-hint { display: block; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); margin-top: 2px; }
.prd-step-spin { color: rgb(var(--ui-accent)); font-size: 0.95rem; }
.prd-step-check {
  color: rgb(var(--ui-ok));
  font-weight: 700;
  font-size: var(--ui-text-sm);
  flex-shrink: 0;
}

/* ── PDF viewer ───────────────────────────────────────────────────────────── */
.prd-pdf-viewer {
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  overflow: hidden;
}
.prd-pdf-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--ui-space-2) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border-bottom: 1px solid rgb(var(--ui-border));
}
.prd-pdf-label { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.prd-pdf-frame-wrap { position: relative; width: 100%; height: 640px; background: rgb(var(--ui-surface-2)); }
.prd-pdf-frame { width: 100%; height: 100%; border: none; display: block; }

/* ── Conteúdo estruturado ─────────────────────────────────────────────────── */
.prd-summary {
  background: rgb(var(--ui-surface-2));
  border-left: 3px solid rgb(var(--ui-accent));
  border-radius: 0 var(--ui-radius-md) var(--ui-radius-md) 0;
  padding: var(--ui-space-4) var(--ui-space-5);
  margin-bottom: var(--ui-space-5);
}
.prd-summary-label {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
  margin: 0 0 var(--ui-space-2);
}
.prd-summary-text {
  margin: 0;
  color: rgb(var(--ui-fg));
  line-height: 1.65;
  white-space: pre-wrap;
}

/* ── Linha do tempo ───────────────────────────────────────────────────────── */
.prd-timeline-wrap { margin-top: var(--ui-space-4); }
.prd-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--ui-space-4);
}
.prd-section-title { font-weight: 700; font-size: var(--ui-text-md); color: rgb(var(--ui-fg)); }
.prd-count { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; }

.prd-timeline {
  list-style: none;
  margin: 0;
  padding: 0 0 0 var(--ui-space-5);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.prd-timeline::before {
  content: "";
  position: absolute;
  left: 5px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: linear-gradient(
    to bottom,
    rgb(var(--ui-accent) / 0.3),
    rgb(var(--ui-border))
  );
}
.prd-tl-item { position: relative; }
.prd-tl-dot {
  position: absolute;
  left: calc(-1 * var(--ui-space-5));
  top: 8px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgb(var(--ui-accent));
  border: 2px solid rgb(var(--ui-surface));
  box-shadow: 0 0 0 2px rgb(var(--ui-accent) / 0.25);
}
.prd-tl-card {
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
  box-shadow: var(--ui-shadow-sm);
  transition: box-shadow 0.15s;
}
.prd-tl-card:hover {
  box-shadow: var(--ui-shadow-md);
}
.prd-tl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.prd-tl-date { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); font-variant-numeric: tabular-nums; }
.prd-tl-text { margin: var(--ui-space-2) 0 0; color: rgb(var(--ui-fg)); line-height: 1.55; white-space: pre-wrap; }
.prd-tl-empty { margin: var(--ui-space-2) 0 0; color: rgb(var(--ui-muted)); font-style: italic; font-size: var(--ui-text-sm); }
.prd-tl-foot { margin: var(--ui-space-2) 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }

/* ── Barra de participação ────────────────────────────────────────────────── */
.prd-bar-wrap { display: flex; align-items: center; gap: var(--ui-space-2); }
.prd-bar {
  height: 6px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.25);
  flex: 1 1 auto;
  max-width: 80px;
  position: relative;
  overflow: hidden;
}
.prd-bar::after {
  content: "";
  position: absolute;
  inset-block: 0;
  left: 0;
  border-radius: inherit;
  background: rgb(var(--ui-accent));
  /* width driven by CSS custom property set via data-pct attribute simulation */
}
/* Use attr() fallback approximation — each 10% step */
.prd-bar[data-pct="100"]::after { width: 100%; }
.prd-bar[data-pct="90"]::after { width: 90%; }
.prd-bar[data-pct="80"]::after { width: 80%; }
.prd-bar[data-pct="70"]::after { width: 70%; }
.prd-bar[data-pct="60"]::after { width: 60%; }
.prd-bar[data-pct="50"]::after { width: 50%; }
.prd-bar[data-pct="40"]::after { width: 40%; }
.prd-bar[data-pct="30"]::after { width: 30%; }
.prd-bar[data-pct="20"]::after { width: 20%; }
.prd-bar[data-pct="10"]::after { width: 10%; }
.prd-bar[data-pct="0"]::after { width: 0%; }

/* ── Ações de footer de card ──────────────────────────────────────────────── */
.prd-foot-actions { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }

/* ── Responsivo ───────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .prd-kv-2,
  .prd-kv-3 { grid-template-columns: minmax(0, 1fr); }
  .prd-metrics { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
  .prd-job-card { flex-direction: column; }
  .prd-pdf-frame-wrap { height: 420px; }
  .prd-banner { flex-wrap: wrap; }
}
</style>
