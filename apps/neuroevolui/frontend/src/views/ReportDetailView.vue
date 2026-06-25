<!--
  ReportDetailView — Detalhe do relatório consolidado de evolução (REQ-NEUROEVOLUI-0004).

  Visualiza um relatório de paciente cujo processamento é ASSÍNCRONO (job BullMQ). A tela cobre
  todos os estágios do ciclo de vida do relatório:
    - queued     → na fila (ainda não começou)        → polling automático
    - processing → o motor está agregando as evoluções → polling automático
    - completed  → relatório pronto (dados agregados)  → render rico
    - failed/error → falhou                            → estado de erro + tentar de novo

  Só endpoints REAIS (via ../api.js → resourceFactory):
    GET    /v1/patient-reports/:id        (relatório completo, inclui report_data quando concluído)
    DELETE /v1/patient-reports/:id        (excluir relatório — destrutivo, via useConfirm)
    GET    /v1/patients/:id               (resolve o nome do paciente para o cabeçalho)

  Kit-only (../ui/index.js) + tokens --ui-* + CSP-safe (sem style inline / :style / v-html).
  Todos os estados: loading (skeleton) · processando (job em andamento) · error (retry) · normal.
-->
<template>
  <UiPageLayout
    eyebrow="NeuroEvolui · Relatório"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="wide"
    :loading="initialLoading"
    :error="fatalError"
    @retry="loadReport"
  >
    <!-- ── AÇÕES DO CABEÇALHO ──────────────────────────────────────────────── -->
    <template #actions>
      <UiButton variant="ghost" :to="backTo">Voltar</UiButton>
      <UiButton
        variant="subtle"
        :loading="refreshing"
        @click="loadReport"
      >Atualizar</UiButton>
      <UiButton
        v-if="patientHref"
        variant="ghost"
        :to="patientHref"
      >Ver paciente</UiButton>
      <UiButton
        v-if="report"
        variant="danger"
        :loading="deleting"
        @click="removeReport"
      >Excluir relatório</UiButton>
    </template>

    <!-- ── BANNER DE SITUAÇÃO (estado do job) ──────────────────────────────── -->
    <!--
      Banner = ÚNICO anunciador da mudança de estado do job (role=status + aria-live).
      O texto do banner ("{{statusLabel}} — {{bannerHeadline}} {{bannerText}}") já diz a
      situação por extenso, então o UiStatusBadge embutido (que tem role=status próprio no
      kit) e o spinner são marcados aria-hidden para não anunciar duas vezes.
    -->
    <template v-if="report" #banner>
      <div class="rd-banner" :data-tone="statusTone" role="status" aria-live="polite">
        <span class="rd-banner-dot" aria-hidden="true" />
        <div class="rd-banner-main">
          <p class="rd-banner-title">
            <span aria-hidden="true">
              <UiStatusBadge :status="report.status" :tone="statusTone" :label="statusLabel" size="lg" />
            </span>
            <span class="rd-banner-headline">{{ statusLabel }} — {{ bannerHeadline }}</span>
          </p>
          <p class="rd-banner-text">{{ bannerText }}</p>
        </div>
        <span
          v-if="isPolling"
          class="rd-banner-spin ui-spin"
          aria-hidden="true"
        />
      </div>
    </template>

    <!-- ── ESTADO: PROCESSANDO (queued / processing) ───────────────────────── -->
    <template v-if="isPending">
      <UiCard title="Processando relatório" subtitle="Estamos consolidando as evoluções deste paciente.">
        <div class="rd-pending">
          <span class="rd-pending-spin ui-spin" aria-hidden="true" />
          <div class="rd-pending-body">
            <p class="rd-pending-title">{{ bannerHeadline }}</p>
            <p class="rd-pending-text">
              O processamento é assíncrono. Esta página atualiza sozinha assim que o relatório
              ficar pronto — você não precisa recarregar.
            </p>
            <p class="rd-pending-meta">
              <span>Solicitado {{ fmt.formatDateTime(report && report.created_at) }}</span>
              <span v-if="elapsedLabel">· em processamento há {{ elapsedLabel }}</span>
            </p>
          </div>
        </div>

        <dl class="rd-kv">
          <div class="rd-kv-row"><dt>Situação</dt><dd><span aria-hidden="true"><UiStatusBadge :status="report && report.status" :tone="statusTone" :label="statusLabel" /></span></dd></div>
          <div class="rd-kv-row"><dt>Paciente</dt><dd>{{ patientLabel }}</dd></div>
          <div class="rd-kv-row"><dt>Período</dt><dd>{{ periodLabel }}</dd></div>
          <div class="rd-kv-row"><dt>Solicitado por</dt><dd>{{ requestedByLabel }}</dd></div>
        </dl>

        <template #footer>
          <div class="rd-foot-actions">
            <UiButton variant="subtle" size="sm" :loading="refreshing" @click="loadReport">Verificar agora</UiButton>
          </div>
        </template>
      </UiCard>
    </template>

    <!-- ── ESTADO: FALHOU ──────────────────────────────────────────────────── -->
    <template v-else-if="isFailed">
      <UiCard title="Relatório não pôde ser gerado" subtitle="O processamento falhou.">
        <UiErrorState
          :message="report.error_message || 'O job de geração falhou. Você pode solicitar um novo relatório na ficha do paciente.'"
          :code="'#' + display(report.id)"
          :retryable="false"
        >
          <template #action>
            <UiButton v-if="patientHref" variant="subtle" size="sm" :to="patientHref">Abrir ficha do paciente</UiButton>
            <UiButton variant="ghost" size="sm" :loading="refreshing" @click="loadReport">Recarregar</UiButton>
          </template>
        </UiErrorState>

        <dl class="rd-kv">
          <div class="rd-kv-row"><dt>Paciente</dt><dd>{{ patientLabel }}</dd></div>
          <div class="rd-kv-row"><dt>Período</dt><dd>{{ periodLabel }}</dd></div>
          <div class="rd-kv-row"><dt>Solicitado em</dt><dd>{{ fmt.formatDateTime(report.created_at) }}</dd></div>
          <div class="rd-kv-row"><dt>Falhou em</dt><dd>{{ fmt.formatDateTime(report.completed_at) }}</dd></div>
        </dl>
      </UiCard>
    </template>

    <!-- ── ESTADO: CONCLUÍDO (relatório rico) ──────────────────────────────── -->
    <template v-else-if="isCompleted">
      <!-- Métricas / resumo agregado -->
      <section class="rd-metrics" aria-label="Resumo do relatório">
        <UiMetricCard label="Evoluções consolidadas" :value="totalNotes" tone="primary" hint="notas no período" />
        <UiMetricCard label="Período coberto" :value="periodSpanLabel" tone="neutral" :hint="periodLabel" />
        <UiMetricCard label="Profissionais" :value="professionalCount" tone="neutral" hint="envolvidos" />
        <UiMetricCard label="Tempo de geração" :value="generationTimeLabel" tone="success" hint="fila → conclusão" />
      </section>

      <!-- Identificação do relatório -->
      <UiCard title="Identificação" subtitle="Dados do relatório consolidado.">
        <template #actions>
          <UiStatusBadge :status="report.status" :tone="statusTone" :label="statusLabel" size="lg" />
        </template>
        <dl class="rd-kv rd-kv-3">
          <div class="rd-kv-row"><dt>Relatório</dt><dd class="rd-mono">#{{ display(report.id) }}</dd></div>
          <div class="rd-kv-row"><dt>Paciente</dt><dd>
            <RouterLink v-if="patientHref" class="rd-link" :to="patientHref">{{ patientLabel }}</RouterLink>
            <span v-else>{{ patientLabel }}</span>
          </dd></div>
          <div class="rd-kv-row"><dt>Situação</dt><dd><UiStatusBadge :status="report.status" :tone="statusTone" :label="statusLabel" /></dd></div>
          <div class="rd-kv-row"><dt>Período de</dt><dd>{{ fmt.formatDate(periodFrom) }}</dd></div>
          <div class="rd-kv-row"><dt>Período até</dt><dd>{{ fmt.formatDate(periodTo) }}</dd></div>
          <div class="rd-kv-row"><dt>Gerado em</dt><dd>{{ fmt.formatDateTime(generatedAt) }}</dd></div>
          <div class="rd-kv-row"><dt>Solicitado em</dt><dd>{{ fmt.formatDateTime(report.created_at) }}</dd></div>
          <div class="rd-kv-row"><dt>Concluído em</dt><dd>{{ fmt.formatDateTime(report.completed_at) }}</dd></div>
          <div class="rd-kv-row"><dt>Solicitado por</dt><dd>{{ requestedByLabel }}</dd></div>
        </dl>
      </UiCard>

      <!-- Linha do tempo consolidada (dados agregados de evoluções) -->
      <UiCard title="Linha do tempo consolidada" subtitle="Evoluções incluídas no relatório.">
        <template #actions>
          <span class="rd-count">{{ totalNotes }} {{ totalNotes === 1 ? 'evolução' : 'evoluções' }}</span>
        </template>

        <UiEmptyState
          v-if="!timeline.length"
          icon="clock"
          title="Nenhuma evolução no período"
          description="O relatório foi gerado, mas não há evoluções registradas no intervalo selecionado."
        >
          <template #action>
            <UiButton v-if="patientHref" variant="subtle" :to="patientHref">Abrir ficha do paciente</UiButton>
          </template>
        </UiEmptyState>

        <ol v-else class="rd-timeline">
          <li v-for="item in sortedTimeline" :key="item.id" class="rd-tl-item">
            <span class="rd-tl-dot" aria-hidden="true" />
            <div class="rd-tl-card">
              <div class="rd-tl-head">
                <UiStatusBadge :status="item.type" :label="noteTypeLabel(item.type)" tone="running" size="sm" />
                <time class="rd-tl-date">{{ fmt.formatDateTime(item.note_date) }}</time>
              </div>
              <p class="rd-tl-text">{{ item.text || 'Nota sem descrição textual.' }}</p>
              <p v-if="item.professional_id || item.professional_name || item.author_name" class="rd-tl-foot">Profissional: {{ professionalLabel(item) }}</p>
            </div>
          </li>
        </ol>
      </UiCard>

      <!-- Distribuição por tipo de evolução -->
      <UiCard v-if="timeline.length" title="Distribuição por tipo" subtitle="Quantidade de evoluções por categoria.">
        <UiDataTable
          :columns="breakdownColumns"
          :rows="typeBreakdown"
          row-key="type"
          density="compact"
          :empty="{ title: 'Sem dados', description: 'Nenhuma evolução para categorizar.' }"
        >
          <template #cell-label="{ row }">{{ noteTypeLabel(row.type) }}</template>
          <template #cell-share="{ value }">{{ value }}%</template>
        </UiDataTable>
      </UiCard>
    </template>

    <template #footer>
      <span>Relatório #{{ display(displayId) }} — geração assíncrona consolidando as evoluções do paciente.</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import {
  UiPageLayout, UiCard, UiMetricCard, UiStatusBadge, UiDataTable, UiButton,
  UiEmptyState, UiErrorState,
  useToast, useConfirm, format as fmt,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

const props = defineProps({ id: { type: [String, Number], required: true } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// ── Clientes de recurso (só endpoints REAIS) ───────────────────────────────────
// O integrador garante o recurso 'patient-reports' (→ /v1/patient-reports). O .get(id)
// retorna o relatório COMPLETO, com report_data quando concluído.
const reportsApi = resourceFactory('patient-reports');
const patientsApi = resourceFactory('patients');

// ── Estado ──────────────────────────────────────────────────────────────────────
const report = ref(null);
const patient = ref(null);
const initialLoading = ref(true);   // só no primeiríssimo load (mostra skeleton da página)
const refreshing = ref(false);      // recargas manuais / polling
const fatalError = ref(null);       // erro de carregamento da própria página (não do job)
const deleting = ref(false);
const now = ref(Date.now());        // "relógio" reativo para rótulos de tempo decorrido

// ── Polling enquanto o job não termina ────────────────────────────────────────────
let pollTimer = null;
let clockTimer = null;
const POLL_MS = 4000;

// ── Helpers de status ──────────────────────────────────────────────────────────────
const STATUS_LABELS = {
  queued: 'Na fila',
  processing: 'Processando',
  completed: 'Concluído',
  failed: 'Falhou',
  error: 'Falhou',
};
const STATUS_TONES = {
  queued: 'running',
  processing: 'running',
  completed: 'success',
  failed: 'error',
  error: 'error',
};
const norm = (v) => String(v || '').toLowerCase().trim();
const statusKey = computed(() => norm(report.value && report.value.status));
const statusLabel = computed(() => STATUS_LABELS[statusKey.value] || (report.value ? fmt.humanize(report.value.status) : '—'));
const statusTone = computed(() => STATUS_TONES[statusKey.value] || 'neutral');

const isPending = computed(() => ['queued', 'processing'].includes(statusKey.value));
const isCompleted = computed(() => statusKey.value === 'completed');
const isFailed = computed(() => ['failed', 'error'].includes(statusKey.value));
const isPolling = computed(() => isPending.value && !fatalError.value);

const display = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const displayId = computed(() => (report.value && report.value.id != null ? report.value.id : props.id));

// ── Cabeçalho ──────────────────────────────────────────────────────────────────────
const pageTitle = computed(() => 'Relatório de evolução #' + display(displayId.value));
const pageSubtitle = computed(() => {
  const who = patientLabel.value;
  return who && who !== '—' ? 'Paciente: ' + who : 'Relatório consolidado de evoluções.';
});

// ── Paciente vinculado ───────────────────────────────────────────────────────────
const patientId = computed(() => (report.value ? report.value.patient_id : null));
const patientLabel = computed(() => {
  if (patient.value && patient.value.full_name) return patient.value.full_name;
  return patientId.value ? 'Paciente #' + patientId.value : '—';
});
const patientHref = computed(() => (patientId.value ? '/patients/' + patientId.value : null));
const backTo = computed(() => patientHref.value || '/patients');

// ── Filtros / período ────────────────────────────────────────────────────────────
const filters = computed(() => (report.value && report.value.filters) || {});
const periodFrom = computed(() => filters.value.date_from || filters.value.dateFrom || null);
const periodTo = computed(() => filters.value.date_to || filters.value.dateTo || null);
const periodLabel = computed(() => {
  const a = periodFrom.value ? fmt.formatDate(periodFrom.value) : null;
  const b = periodTo.value ? fmt.formatDate(periodTo.value) : null;
  if (a && b) return a + ' — ' + b;
  if (a) return 'A partir de ' + a;
  if (b) return 'Até ' + b;
  return 'Histórico completo';
});

// ── Dados agregados (report_data, presente quando concluído) ────────────────────────
const reportData = computed(() => (report.value && report.value.report_data) || {});
const timeline = computed(() => {
  const t = reportData.value.timeline;
  return Array.isArray(t) ? t : [];
});
const sortedTimeline = computed(() =>
  [...timeline.value].sort((a, b) => new Date(b.note_date || 0) - new Date(a.note_date || 0))
);
const totalNotes = computed(() => {
  if (typeof reportData.value.total_notes === 'number') return reportData.value.total_notes;
  return timeline.value.length;
});
const generatedAt = computed(() => reportData.value.generated_at || report.value?.completed_at || null);

const professionalCount = computed(() => {
  const set = new Set();
  for (const n of timeline.value) if (n.professional_id) set.add(String(n.professional_id));
  return set.size;
});

// Span do período coberto pelas evoluções (não pelos filtros), em dias.
const periodSpanLabel = computed(() => {
  const dates = timeline.value.map((n) => new Date(n.note_date || 0).getTime()).filter((t) => isFinite(t) && t > 0);
  if (dates.length < 1) return '—';
  const min = Math.min(...dates);
  const max = Math.max(...dates);
  const days = Math.round((max - min) / 86400000);
  if (days <= 0) return '1 dia';
  return days + (days === 1 ? ' dia' : ' dias');
});

const generationTimeLabel = computed(() => {
  if (!report.value || !report.value.created_at || !report.value.completed_at) return '—';
  const a = new Date(report.value.created_at).getTime();
  const b = new Date(report.value.completed_at).getTime();
  if (!isFinite(a) || !isFinite(b) || b < a) return '—';
  return durationFromMs(b - a);
});

// Tempo decorrido enquanto pendente (relógio reativo).
const elapsedLabel = computed(() => {
  if (!report.value || !report.value.created_at) return '';
  const a = new Date(report.value.created_at).getTime();
  if (!isFinite(a)) return '';
  const ms = now.value - a;
  return ms > 1000 ? durationFromMs(ms) : '';
});

function durationFromMs(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + (s === 1 ? ' segundo' : ' segundos');
  const m = Math.round(s / 60);
  if (m < 60) return m + (m === 1 ? ' minuto' : ' minutos');
  const h = Math.round(m / 60);
  return h + (h === 1 ? ' hora' : ' horas');
}

// ── Banner ───────────────────────────────────────────────────────────────────────
const bannerHeadline = computed(() => {
  if (isCompleted.value) return 'Relatório pronto.';
  if (isFailed.value) return 'A geração do relatório falhou.';
  if (statusKey.value === 'queued') return 'Relatório na fila de processamento.';
  if (statusKey.value === 'processing') return 'Consolidando as evoluções…';
  return 'Relatório.';
});
const bannerText = computed(() => {
  if (isCompleted.value) return 'Os dados abaixo consolidam as evoluções do paciente no período.';
  if (isFailed.value) return report.value?.error_message || 'Solicite um novo relatório na ficha do paciente.';
  return 'Atualizamos automaticamente assim que o processamento terminar.';
});

// ── Distribuição por tipo ──────────────────────────────────────────────────────────
const NOTE_TYPE_LABELS = {
  session: 'Sessão',
  assessment: 'Avaliação',
  follow_up: 'Acompanhamento',
  discharge_note: 'Nota de alta',
};
function noteTypeLabel(t) { return NOTE_TYPE_LABELS[norm(t)] || fmt.humanize(t || 'session'); }

// Rótulo de profissional para leitura humana: prefere o nome agregado em report_data
// (professional_name / author_name, se o motor já trouxer) e cai para "Profissional #<id>".
// Não abrimos requests por nota — usamos só o que vier no próprio item do relatório.
function professionalLabel(item) {
  if (!item) return '—';
  const name = item.professional_name || item.author_name;
  if (name) return String(name);
  return item.professional_id ? 'Profissional #' + item.professional_id : '—';
}

// Mesma ideia para quem solicitou o relatório (created_by costuma ser id/uuid cru).
const requestedByLabel = computed(() => {
  if (!report.value) return '—';
  const name = report.value.created_by_name || reportData.value.created_by_name;
  if (name) return String(name);
  const id = report.value.created_by;
  return id ? 'Profissional #' + id : '—';
});

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

// ── Carregamento ────────────────────────────────────────────────────────────────────
async function loadReport() {
  if (initialLoading.value) { /* skeleton já visível */ } else { refreshing.value = true; }
  fatalError.value = null;
  try {
    const res = await reportsApi.get(props.id);
    report.value = res && res.data && typeof res.data === 'object' ? res.data : res;
    // resolve o nome do paciente (fail-soft — o relatório vale sem o nome)
    if (patientId.value && (!patient.value || String(patient.value.id) !== String(patientId.value))) {
      loadPatient(patientId.value);
    }
    scheduleNextPoll();
  } catch (e) {
    if (e && e.status === 404) {
      fatalError.value = 'Relatório não encontrado. Ele pode ter sido excluído.';
    } else {
      fatalError.value = e.message || 'Não foi possível carregar o relatório.';
    }
    stopPolling();
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
    // fail-soft: mantém o rótulo "Paciente #id"
    patient.value = null;
  }
}

// ── Polling: agenda a próxima checagem só enquanto pendente ──────────────────────────
function scheduleNextPoll() {
  stopPolling();
  if (isPolling.value) {
    pollTimer = setTimeout(() => { refreshing.value = false; loadReport(); }, POLL_MS);
  }
}
function stopPolling() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
}

// ── Ação destrutiva: excluir relatório ──────────────────────────────────────────────
async function removeReport() {
  const ok = await confirm({
    title: 'Excluir relatório',
    message: 'Esta ação remove o relatório #' + display(displayId.value) + ' permanentemente. Não pode ser desfeita. Confirmar?',
    confirmLabel: 'Excluir',
    cancelLabel: 'Voltar',
    danger: true,
  });
  if (!ok) return;
  deleting.value = true;
  try {
    await reportsApi.remove(props.id);
    toast.success('Relatório excluído.');
    stopPolling();
    router.push(backTo.value);
  } catch (e) {
    if (e && e.status === 403) { toast.error('Você não tem permissão para excluir relatórios.'); return; }
    toast.error(e.message || 'Não foi possível excluir o relatório.');
  } finally {
    deleting.value = false;
  }
}

// ── Ciclo de vida ─────────────────────────────────────────────────────────────────
watch(() => props.id, () => {
  initialLoading.value = true;
  report.value = null;
  patient.value = null;
  loadReport();
});

onMounted(() => {
  loadReport();
  clockTimer = setInterval(() => { now.value = Date.now(); }, 1000);
});

onBeforeUnmount(() => {
  stopPolling();
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
});
</script>

<style scoped>
/* ── Banner de situação ─────────────────────────────────────────────────────────── */
.rd-banner {
  display: flex; align-items: center; gap: var(--ui-space-3);
  padding: var(--ui-space-4) var(--ui-space-5);
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
}
.rd-banner[data-tone="success"] { border-left-color: rgb(var(--ui-ok)); background: rgb(var(--ui-ok) / 0.06); }
.rd-banner[data-tone="error"] { border-left-color: rgb(var(--ui-danger)); background: rgb(var(--ui-danger) / 0.06); }
.rd-banner[data-tone="running"] { border-left-color: rgb(var(--ui-accent)); background: rgb(var(--ui-accent) / 0.06); }
.rd-banner-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: rgb(var(--ui-muted)); }
.rd-banner[data-tone="success"] .rd-banner-dot { background: rgb(var(--ui-ok)); }
.rd-banner[data-tone="error"] .rd-banner-dot { background: rgb(var(--ui-danger)); }
.rd-banner[data-tone="running"] .rd-banner-dot { background: rgb(var(--ui-accent)); }
.rd-banner-main { flex: 1 1 auto; min-width: 0; }
.rd-banner-title { margin: 0; display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap; }
.rd-banner-headline { font-weight: 600; }
.rd-banner-text { margin: var(--ui-space-1) 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.rd-banner-spin { color: rgb(var(--ui-accent)); font-size: 1.1rem; flex-shrink: 0; }

/* ── Métricas ──────────────────────────────────────────────────────────────────── */
.rd-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--ui-space-4); }

/* ── Estado processando ──────────────────────────────────────────────────────────── */
.rd-pending { display: flex; align-items: flex-start; gap: var(--ui-space-4); margin-bottom: var(--ui-space-5); }
.rd-pending-spin { color: rgb(var(--ui-accent)); font-size: 1.6rem; flex-shrink: 0; margin-top: 2px; }
.rd-pending-body { min-width: 0; }
.rd-pending-title { margin: 0; font-weight: 600; font-size: var(--ui-text-lg); }
.rd-pending-text { margin: var(--ui-space-2) 0 0; color: rgb(var(--ui-muted)); line-height: 1.55; max-width: 60ch; }
.rd-pending-meta { margin: var(--ui-space-2) 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }

/* ── Listas de chave/valor (dt/dd) ───────────────────────────────────────────────── */
.rd-kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-space-4); margin: 0; }
.rd-kv-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.rd-kv-row { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rd-kv dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
.rd-kv dd { margin: 0; color: rgb(var(--ui-fg)); font-size: var(--ui-text-md); overflow-wrap: anywhere; }
.rd-mono { font-family: var(--ui-font-mono, monospace); font-size: var(--ui-text-sm); }
.rd-link { color: rgb(var(--ui-accent-strong)); text-decoration: none; font-weight: 500; }
.rd-link:hover { text-decoration: underline; }

.rd-count { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; }
.rd-foot-actions { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }

/* ── Linha do tempo consolidada ──────────────────────────────────────────────────── */
.rd-timeline { list-style: none; margin: 0; padding: 0 0 0 var(--ui-space-4); position: relative; display: flex; flex-direction: column; gap: var(--ui-space-4); }
.rd-timeline::before { content: ""; position: absolute; left: 4px; top: 6px; bottom: 6px; width: 2px; background: rgb(var(--ui-border)); }
.rd-tl-item { position: relative; }
.rd-tl-dot { position: absolute; left: calc(-1 * var(--ui-space-4)); top: 6px; width: 10px; height: 10px; border-radius: 50%; background: rgb(var(--ui-accent)); box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15); }
.rd-tl-card { background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-md); padding: var(--ui-space-3) var(--ui-space-4); }
.rd-tl-head { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-2); flex-wrap: wrap; }
.rd-tl-date { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }
.rd-tl-text { margin: var(--ui-space-2) 0 0; color: rgb(var(--ui-fg)); line-height: 1.5; white-space: pre-wrap; }
.rd-tl-foot { margin: var(--ui-space-2) 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }

/* ── Responsivo ──────────────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .rd-kv, .rd-kv-3 { grid-template-columns: minmax(0, 1fr); }
  .rd-metrics { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
  .rd-pending { flex-direction: column; }
}
</style>
