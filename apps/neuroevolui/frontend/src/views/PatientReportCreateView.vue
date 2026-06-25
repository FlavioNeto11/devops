<!--
  PatientReportCreateView — Solicitar Relatório de Paciente
  Rota: /patient-reports/new
  Âncoras: REQ-NEUROEVOLUI-0004, REQ-NEUROEVOLUI-0003

  Formulário de solicitação de relatório consolidado: paciente (seletor com catálogo),
  período (date range), tipo de nota (seletor) e profissional solicitante.
  Enfileira job BullMQ (POST /v1/patient-reports) e exibe polling do status em tempo real.

  Todos os estados: loading (skeleton catálogos), error (retry), normal, job-running, job-done.
  Sem style= inline, sem :style, sem v-html. Tokens --ui-* exclusivos em CSS.
-->
<template>
  <UiPageLayout
    eyebrow="Relatórios de Paciente"
    title="Solicitar Relatório"
    subtitle="Configure o relatório consolidado: selecione o paciente, o período, o tipo de nota e o profissional. A geração roda em segundo plano — o status é acompanhado em tempo real."
    width="narrow"
  >
    <template #actions>
      <UiButton variant="ghost" to="/patient-reports">Voltar aos relatórios</UiButton>
    </template>

    <!-- ── BANNER: acompanhamento do job BullMQ em tempo real ── -->
    <template v-if="job" #banner>
      <div class="prc-job-banner" :data-tone="jobTone" role="status" aria-live="polite" aria-atomic="false">
        <span class="prc-job-dot" aria-hidden="true" />
        <div class="prc-job-body">
          <p class="prc-job-title">{{ jobHeadline }}</p>
          <p class="prc-job-sub">{{ jobSubline }}</p>
        </div>
        <div class="prc-job-aside">
          <UiStatusBadge :status="job.status" :label="statusLabel(job.status)" />
          <UiButton
            v-if="isTerminal && job.status === 'ready'"
            variant="subtle"
            size="sm"
            to="/patients"
          >
            Ver pacientes
          </UiButton>
          <UiButton
            v-else-if="job.status === 'error'"
            variant="subtle"
            size="sm"
            :loading="f.submitting.value"
            :disabled="f.submitting.value"
            @click="retryJob"
          >
            Tentar novamente
          </UiButton>
        </div>
      </div>
    </template>

    <!-- ── ESTADO: carregando catálogos ── -->
    <UiLoadingState
      v-if="bootState === 'loading'"
      variant="skeleton"
      :skeleton-lines="10"
      title="Preparando o formulário…"
    />

    <!-- ── ESTADO: erro no boot (retry disponível) ── -->
    <UiErrorState
      v-else-if="bootState === 'error'"
      message="Não foi possível carregar os dados necessários para o formulário. Verifique a conexão e tente novamente."
      :retryable="true"
      @retry="bootstrap"
    />

    <!-- ── ESTADO: normal — formulário ── -->
    <form v-else class="prc-form" novalidate @submit.prevent="submit">

      <!-- Métricas ao vivo do recorte selecionado -->
      <section class="prc-metrics" aria-label="Resumo da solicitação">
        <UiMetricCard
          label="Paciente"
          :value="patientSummary"
          tone="primary"
          hint="Paciente selecionado para o relatório"
        />
        <UiMetricCard
          label="Período"
          :value="periodSummary"
          tone="neutral"
          hint="Intervalo de datas do relatório"
        />
        <UiMetricCard
          label="Tipo de nota"
          :value="typeSummary"
          tone="running"
          hint="Tipo de evolução incluída"
        />
      </section>

      <!-- ── CARD 1: Paciente ── -->
      <UiCard
        title="Paciente"
        subtitle="Selecione o paciente cujo histórico de evoluções será consolidado."
      >
        <UiFormSection :columns="1">
          <UiFormField
            label="Paciente"
            :required="true"
            :error="f.errors.patient_id"
            :hint="patientHint"
          >
            <template #default="{ id, describedBy, hasError }">
              <select
                v-if="patientOptions.length"
                :id="id"
                class="prc-select"
                :aria-describedby="describedBy || undefined"
                :aria-required="true"
                :aria-invalid="hasError ? 'true' : undefined"
                :value="f.values.patient_id"
                :disabled="formLocked"
                @change="onPatientChange($event.target.value)"
              >
                <option value="" disabled>Selecione o paciente…</option>
                <option v-for="opt in patientOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <UiInput
                v-else
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.patient_id"
                :error="hasError"
                :required="true"
                :disabled="formLocked"
                placeholder="Identificador do paciente (UUID ou código)"
                autocomplete="off"
                @update:model-value="onPatientChange($event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- ── CARD 2: Período e Tipo ── -->
      <UiCard
        title="Filtros do Relatório"
        subtitle="Delimite o período, o tipo de nota e o profissional. Todos os campos são opcionais."
      >
        <UiFormSection :columns="2">

          <!-- Período: Data inicial -->
          <UiFormField
            label="Período de"
            :error="f.errors.date_from"
            hint="Data de início do intervalo (opcional)."
          >
            <template #default="{ id, describedBy, hasError }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="date"
                :model-value="f.values.date_from"
                :max="todayIso"
                :error="hasError"
                :disabled="formLocked"
                @update:model-value="onDateFromChange($event)"
              />
            </template>
          </UiFormField>

          <!-- Período: Data final -->
          <UiFormField
            label="Período até"
            :error="f.errors.date_to"
            :hint="dateToHint"
          >
            <template #default="{ id, describedBy, hasError }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="date"
                :model-value="f.values.date_to"
                :min="f.values.date_from || undefined"
                :max="todayIso"
                :error="hasError"
                :disabled="formLocked"
                @update:model-value="f.setField('date_to', $event)"
              />
            </template>
          </UiFormField>

          <!-- Tipo de nota -->
          <UiFormField
            label="Tipo de nota"
            :error="f.errors.type"
            hint="Filtra pelo tipo de evolução (opcional)."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                class="prc-select"
                :aria-describedby="describedBy || undefined"
                :value="f.values.type"
                :disabled="formLocked"
                @change="f.setField('type', $event.target.value)"
              >
                <option value="">Todos os tipos</option>
                <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </template>
          </UiFormField>

          <!-- Profissional solicitante -->
          <UiFormField
            label="Profissional solicitante"
            :error="f.errors.professional_id"
            :hint="professionalHint"
          >
            <template #default="{ id, describedBy }">
              <select
                v-if="professionalOptions.length"
                :id="id"
                class="prc-select"
                :aria-describedby="describedBy || undefined"
                :value="f.values.professional_id"
                :disabled="formLocked"
                @change="f.setField('professional_id', $event.target.value)"
              >
                <option value="">Todos os profissionais</option>
                <option v-for="opt in professionalOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <UiInput
                v-else
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.professional_id"
                :disabled="formLocked"
                placeholder="Todos os profissionais"
                autocomplete="off"
                @update:model-value="f.setField('professional_id', $event)"
              />
            </template>
          </UiFormField>

        </UiFormSection>

        <!-- Observações -->
        <UiFormSection :columns="1">
          <UiFormField
            label="Observações"
            :error="f.errors.notes"
            hint="Anotações ou instruções adicionais para a geração do relatório (opcional)."
          >
            <template #default="{ id, describedBy, hasError }">
              <textarea
                :id="id"
                class="prc-textarea"
                :aria-describedby="describedBy || undefined"
                :aria-invalid="hasError ? 'true' : undefined"
                :value="f.values.notes"
                :disabled="formLocked"
                rows="3"
                placeholder="Ex.: incluir apenas consultas individuais; excluir avaliações de triagem…"
                @input="f.setField('notes', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- Linha de resumo dos filtros aplicados -->
        <p class="prc-filter-summary" role="note" aria-live="polite">{{ filterSummary }}</p>
      </UiCard>

      <!-- ── Ações do formulário ── -->
      <div class="prc-actions">
        <p class="prc-actions-hint">
          O campo marcado com <span class="prc-req" aria-hidden="true">*</span> é obrigatório.
          A geração é assíncrona — acompanhe o status no banner acima.
        </p>
        <div class="prc-actions-btns">
          <UiButton
            variant="ghost"
            type="button"
            :disabled="f.submitting.value"
            @click="cancel"
          >
            Cancelar
          </UiButton>
          <UiButton
            variant="primary"
            type="submit"
            :loading="f.submitting.value || (!!job && !isTerminal)"
          >
            {{ submitLabel }}
          </UiButton>
        </div>
      </div>
    </form>

    <!-- ── HISTÓRICO recente do paciente selecionado ── -->
    <UiCard
      v-if="f.values.patient_id && bootState === 'ok'"
      title="Relatórios recentes"
      subtitle="Últimas solicitações para este paciente."
    >
      <template #actions>
        <UiButton
          variant="ghost"
          size="sm"
          :loading="history.loading"
          @click="loadHistory"
        >
          Atualizar
        </UiButton>
      </template>

      <!-- Estado: carregando histórico -->
      <UiLoadingState
        v-if="history.loading && !history.items.length"
        variant="skeleton"
        :skeleton-lines="3"
      />

      <!-- Estado: erro no histórico -->
      <UiErrorState
        v-else-if="history.error && !history.items.length"
        :message="history.error"
        :retryable="true"
        @retry="loadHistory"
      />

      <!-- Estado: sem histórico ainda -->
      <UiEmptyState
        v-else-if="!history.loading && !history.items.length"
        title="Nenhum relatório ainda"
        description="Este paciente ainda não possui relatórios. Solicite o primeiro usando o formulário acima."
        icon="document"
      >
        <template #action>
          <UiButton variant="subtle" size="sm" @click="scrollToForm">Ir para o formulário</UiButton>
        </template>
      </UiEmptyState>

      <!-- Estado: normal — lista de relatórios -->
      <ul v-else class="prc-history" aria-label="Histórico de relatórios">
        <li
          v-for="item in history.items"
          :key="item.id"
          class="prc-history-item"
        >
          <div class="prc-history-meta">
            <span class="prc-history-id" aria-label="Relatório número">#{{ item.id }}</span>
            <span class="prc-history-type">{{ typeLabel(item.type) }}</span>
          </div>
          <div class="prc-history-dates">
            <span class="prc-history-when">{{ historyWhen(item) }}</span>
            <span v-if="item.error_message" class="prc-history-err">{{ item.error_message }}</span>
          </div>
          <UiStatusBadge :status="item.status" :label="statusLabel(item.status)" />
        </li>
      </ul>
    </UiCard>
  </UiPageLayout>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiFormSection,
  UiFormField,
  UiInput,
  UiButton,
  UiStatusBadge,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// Recurso REST garantido pelo integrador (POST /v1/patient-reports).
// Acesso por colchetes porque o export tem hífen.
const patientReports = api['patient-reports'] || api.resourceFactory('patient-reports');

const router = useRouter();
const toast = useToast();
const askConfirm = useConfirm();

// ── Rótulos de domínio ─────────────────────────────────────────────────────────

const STATUS_LABELS = {
  queued: 'Na fila',
  processing: 'Processando',
  ready: 'Pronto',
  error: 'Erro',
  failed: 'Erro',
};
const statusLabel = (s) => STATUS_LABELS[s] || format.humanize(s || '');

const TYPE_LABELS = {
  session: 'Sessão',
  assessment: 'Avaliação',
  evolution: 'Evolução',
  discharge: 'Alta',
};
const typeOptions = Object.keys(TYPE_LABELS).map((value) => ({ value, label: TYPE_LABELS[value] }));
const typeLabel = (v) => (v ? (TYPE_LABELS[v] || format.humanize(v)) : 'Todos os tipos');

// ── Boot: carrega catálogos de pacientes e profissionais ───────────────────────

const bootState = ref('loading'); // 'loading' | 'ok' | 'error'
const patientOptions = ref([]);
const professionalOptions = ref([]);

function nameOf(row) {
  return (
    row.full_name ||
    row.name ||
    row.display_name ||
    [row.first_name, row.last_name].filter(Boolean).join(' ') ||
    row.email ||
    row.id
  );
}

async function loadCatalog(resource, target) {
  if (!resource || typeof resource.list !== 'function') {
    target.value = [];
    return;
  }
  try {
    const res = await resource.list({ pageSize: 200, sort: 'name', dir: 'asc' });
    const data = Array.isArray(res) ? res : (res && res.data) ? res.data : [];
    target.value = data
      .map((row) => ({ value: row.id, label: nameOf(row) }))
      .filter((o) => o.value !== undefined && o.value !== null && o.value !== '');
  } catch {
    // Fail-soft: sem catálogo → texto livre (não é erro fatal).
    target.value = [];
  }
}

async function bootstrap() {
  bootState.value = 'loading';
  try {
    await Promise.all([
      loadCatalog(api.patients, patientOptions),
      loadCatalog(api.professionals, professionalOptions),
    ]);
    bootState.value = 'ok';
  } catch {
    bootState.value = 'error';
  }
}

// ── Hints contextuais dos seletores ────────────────────────────────────────────

const patientHint = computed(() =>
  patientOptions.value.length
    ? 'Selecione o paciente do relatório.'
    : 'Identificador do paciente (lista indisponível — informe o ID).',
);

const professionalHint = computed(() =>
  professionalOptions.value.length
    ? 'Profissional solicitante (opcional — filtra o relatório).'
    : 'Identificador do profissional (opcional, lista indisponível).',
);

// ── Formulário ─────────────────────────────────────────────────────────────────

const todayIso = new Date().toISOString().slice(0, 10);

const f = useForm({
  initial: {
    patient_id: '',
    date_from: '',
    date_to: '',
    type: '',
    professional_id: '',
    notes: '',
  },
  rules: {
    patient_id: [validators.required('Selecione o paciente.')],
    date_to: [
      (v, all) =>
        v && all.date_from && v < all.date_from
          ? 'A data final não pode ser anterior à data inicial.'
          : '',
    ],
  },
});

const dateToHint = computed(() =>
  f.values.date_from
    ? 'Data de fim do intervalo (deve ser igual ou posterior à data inicial).'
    : 'Data de fim do intervalo (opcional).',
);

// Handlers com limpeza de erros derivados ao mudar datas relacionadas.
function onPatientChange(val) {
  f.setField('patient_id', val);
}

function onDateFromChange(val) {
  f.setField('date_from', val);
  // Re-valida data_to ao mudar data_from (relacionamento entre campos).
  if (f.values.date_to) f.setField('date_to', f.values.date_to);
}

// ── Métricas ao vivo ──────────────────────────────────────────────────────────

const patientSummary = computed(() => {
  if (!f.values.patient_id) return '—';
  const opt = patientOptions.value.find((o) => o.value === f.values.patient_id);
  return opt ? opt.label : f.values.patient_id;
});

const periodSummary = computed(() => {
  const from = f.values.date_from;
  const to = f.values.date_to;
  if (!from && !to) return 'Todo o histórico';
  if (from && !to) return 'A partir de ' + format.formatDate(from);
  if (!from && to) return 'Até ' + format.formatDate(to);
  return format.formatDate(from) + ' – ' + format.formatDate(to);
});

const typeSummary = computed(() =>
  f.values.type ? typeLabel(f.values.type) : 'Todos os tipos',
);

// ── Resumo textual dos filtros ─────────────────────────────────────────────────

const filterSummary = computed(() => {
  const parts = [];
  parts.push('Período: ' + periodSummary.value);
  parts.push('Tipo: ' + typeSummary.value);
  const profId = f.values.professional_id;
  if (profId) {
    const opt = professionalOptions.value.find((o) => o.value === profId);
    parts.push('Profissional: ' + (opt ? opt.label : profId));
  } else {
    parts.push('Profissional: todos');
  }
  return parts.join('  ·  ');
});

// ── Job assíncrono BullMQ + polling do status ──────────────────────────────────

const job = ref(null); // null | { id, status, created_at, completed_at, error_message }
const isPolling = ref(false);
let pollTimer = null;
let pollAttempts = 0;
const MAX_POLLS = 40; // ~2 min a 3s/poll

const isTerminal = computed(() => {
  const s = job.value && job.value.status;
  return s === 'ready' || s === 'completed' || s === 'error' || s === 'failed';
});

const formLocked = computed(() => !!job.value && !isTerminal.value);

const submitLabel = computed(() => {
  if (formLocked.value) return 'Gerando…';
  if (job.value && isTerminal.value) return 'Solicitar novo relatório';
  return 'Solicitar relatório';
});

const jobTone = computed(() => {
  if (!job.value) return 'neutral';
  switch (job.value.status) {
    case 'ready':
    case 'completed': return 'success';
    case 'error':
    case 'failed': return 'error';
    default: return 'running';
  }
});

const jobHeadline = computed(() => {
  if (!job.value) return '';
  switch (job.value.status) {
    case 'queued': return 'Relatório enfileirado — aguardando processamento';
    case 'processing': return 'Gerando o relatório em segundo plano…';
    case 'ready':
    case 'completed': return 'Relatório pronto';
    case 'error':
    case 'failed': return 'Falha ao gerar o relatório';
    default: return 'Acompanhando o relatório';
  }
});

const jobSubline = computed(() => {
  if (!job.value) return '';
  const id = job.value.id ? '#' + job.value.id : '';
  if (job.value.status === 'ready' || job.value.status === 'completed') {
    const when = job.value.completed_at
      ? ' em ' + format.formatDateTime(job.value.completed_at)
      : '';
    return 'Relatório ' + id + ' concluído' + when + '. O arquivo está disponível.';
  }
  if (job.value.status === 'error' || job.value.status === 'failed') {
    return (
      job.value.error_message ||
      'Ocorreu um erro no processamento. Ajuste os parâmetros e tente novamente.'
    );
  }
  return 'Solicitação ' + id + ' em andamento. O status é atualizado automaticamente a cada 3 segundos.';
});

// Polling: fail-soft — erros pontuais não derrubam o ciclo até o teto MAX_POLLS.
function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  isPolling.value = false;
}

async function pollOnce(reportId) {
  try {
    const row = await patientReports.get(reportId);
    job.value = row;
    const terminal = row && (row.status === 'ready' || row.status === 'completed' || row.status === 'error' || row.status === 'failed');
    if (terminal) {
      stopPolling();
      loadHistory();
      if (row.status === 'ready' || row.status === 'completed') {
        toast.success('Relatório #' + row.id + ' gerado com sucesso.');
      } else {
        toast.error(row.error_message || 'O relatório falhou ao ser gerado.');
      }
      return;
    }
  } catch (e) {
    if (e && (e.status === 401 || e.status === 403)) {
      stopPolling();
      toast.error('Sem permissão para acompanhar este relatório.');
      return;
    }
    // Erros de rede são silenciosos — tentamos de novo no próximo ciclo.
  }
  pollAttempts += 1;
  if (pollAttempts >= MAX_POLLS) {
    stopPolling();
    toast.error('A geração está demorando mais que o esperado. Verifique o histórico em instantes.');
    return;
  }
  pollTimer = setTimeout(() => pollOnce(reportId), 3000);
}

function startPolling(reportId) {
  stopPolling();
  pollAttempts = 0;
  isPolling.value = true;
  pollOnce(reportId);
}

// ── Submit ─────────────────────────────────────────────────────────────────────

function buildPayload(vals) {
  const payload = { patient_id: String(vals.patient_id).trim() };
  if (vals.date_from) payload.date_from = vals.date_from;
  if (vals.date_to) payload.date_to = vals.date_to;
  if (vals.type) payload.report_type = vals.type;
  if (vals.professional_id) payload.professional_id = String(vals.professional_id).trim();
  if (vals.notes && vals.notes.trim()) payload.notes = vals.notes.trim();
  return payload;
}

async function submit() {
  if (formLocked.value) return;
  await f.handleSubmit(async (vals) => {
    try {
      const res = await patientReports.create(buildPayload(vals));
      const reportId = res && (res.report_id || res.id);
      if (!reportId) {
        toast.error(
          'A solicitação foi aceita, mas não retornou um identificador de relatório.',
        );
        return;
      }
      job.value = {
        id: reportId,
        status: res.status || 'queued',
        created_at: new Date().toISOString(),
      };
      toast.success('Relatório solicitado. Gerando em segundo plano…');
      loadHistory();
      startPolling(reportId);
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) {
        toast.error('Você não tem permissão para gerar relatórios de paciente.');
        return;
      }
      if (e && e.status === 422) {
        toast.error((e.message) || 'Dados inválidos. Revise os campos e tente novamente.');
        return;
      }
      toast.error((e && e.message) || 'Não foi possível solicitar o relatório. Tente novamente.');
    }
  });
}

async function retryJob() {
  job.value = null;
  await submit();
}

// ── Cancelar (confirmar descarte se formulário sujo) ───────────────────────────

function isDirty() {
  const v = f.values;
  return Boolean(v.patient_id || v.date_from || v.date_to || v.type || v.professional_id || v.notes);
}

async function cancel() {
  if (formLocked.value) {
    const ok = await askConfirm({
      title: 'Sair com geração em andamento?',
      message:
        'O relatório continuará sendo gerado em segundo plano, mas você deixará de acompanhar o status aqui.',
      confirmLabel: 'Sair mesmo assim',
      danger: true,
    });
    if (!ok) return;
  } else if (isDirty()) {
    const ok = await askConfirm({
      title: 'Descartar solicitação?',
      message: 'Os dados preenchidos serão perdidos.',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
  }
  router.push('/patient-reports');
}

// ── Histórico recente do paciente ──────────────────────────────────────────────

const history = reactive({ items: [], loading: false, error: null });
let historyToken = 0;

async function loadHistory() {
  const pid = String(f.values.patient_id || '').trim();
  if (!pid) {
    history.items = [];
    history.error = null;
    return;
  }
  const token = ++historyToken;
  history.loading = true;
  history.error = null;
  try {
    const res = await patientReports.list({
      patient_id: pid,
      pageSize: 8,
      sort: 'created_at',
      dir: 'desc',
    });
    if (token !== historyToken) return;
    history.items = (res && res.data) || [];
  } catch (e) {
    if (token !== historyToken) return;
    history.error = (e && e.message) || 'Não foi possível carregar o histórico de relatórios.';
  } finally {
    if (token === historyToken) history.loading = false;
  }
}

function historyWhen(item) {
  if ((item.status === 'ready' || item.status === 'completed') && item.completed_at) {
    return 'Concluído em ' + format.formatDateTime(item.completed_at);
  }
  if (item.created_at) return 'Solicitado em ' + format.formatDateTime(item.created_at);
  return '—';
}

// Atalho de foco para o CTA da empty state do histórico.
function scrollToForm() {
  const el = document.querySelector('.prc-form');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Recarrega o histórico (debounce) quando o paciente muda.
let historyDebounce = null;
watch(
  () => f.values.patient_id,
  () => {
    if (historyDebounce) clearTimeout(historyDebounce);
    historyDebounce = setTimeout(loadHistory, 350);
  },
);

onMounted(bootstrap);
onBeforeUnmount(() => {
  stopPolling();
  if (historyDebounce) clearTimeout(historyDebounce);
});
</script>

<style scoped>
/* ── Layout do formulário ─────────────────────────────────────────────────── */
.prc-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}

/* ── Métricas ao vivo ────────────────────────────────────────────────────── */
.prc-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
}

/* ── Select compartilhado ────────────────────────────────────────────────── */
.prc-select {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 8px 11px;
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.prc-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.prc-select:disabled {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  cursor: not-allowed;
}
.prc-select[aria-invalid="true"] {
  border-color: rgb(var(--ui-danger));
}

/* ── Textarea de observações ─────────────────────────────────────────────── */
.prc-textarea {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 8px 11px;
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  resize: vertical;
  min-height: 72px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.prc-textarea:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.prc-textarea:disabled {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  cursor: not-allowed;
}
.prc-textarea[aria-invalid="true"] {
  border-color: rgb(var(--ui-danger));
}

/* ── Resumo de filtros ───────────────────────────────────────────────────── */
.prc-filter-summary {
  margin: var(--ui-space-3) 0 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  line-height: 1.5;
}

/* ── Banner do job BullMQ ────────────────────────────────────────────────── */
.prc-job-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
}
.prc-job-banner[data-tone="running"] {
  border-color: rgb(var(--ui-accent) / 0.4);
  background: rgb(var(--ui-accent) / 0.06);
}
.prc-job-banner[data-tone="success"] {
  border-color: rgb(var(--ui-ok) / 0.4);
  background: rgb(var(--ui-ok) / 0.07);
}
.prc-job-banner[data-tone="error"] {
  border-color: rgb(var(--ui-danger) / 0.4);
  background: rgb(var(--ui-danger) / 0.06);
}

.prc-job-dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
  background: rgb(var(--ui-muted));
}
.prc-job-banner[data-tone="running"] .prc-job-dot {
  background: rgb(var(--ui-accent));
  animation: prc-pulse 1.4s ease-in-out infinite;
}
.prc-job-banner[data-tone="success"] .prc-job-dot { background: rgb(var(--ui-ok)); }
.prc-job-banner[data-tone="error"] .prc-job-dot { background: rgb(var(--ui-danger)); }

@keyframes prc-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.65); }
}
@media (prefers-reduced-motion: reduce) {
  .prc-job-banner[data-tone="running"] .prc-job-dot { animation: none; }
}

.prc-job-body {
  flex: 1 1 auto;
  min-width: 0;
}
.prc-job-title {
  margin: 0;
  font-size: var(--ui-text-sm);
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.prc-job-sub {
  margin: 2px 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.prc-job-aside {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-shrink: 0;
}

/* ── Ações do formulário ─────────────────────────────────────────────────── */
.prc-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding-top: var(--ui-space-2);
}
.prc-actions-hint {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  max-width: 60ch;
  line-height: 1.5;
}
.prc-req {
  color: rgb(var(--ui-danger));
  font-weight: 700;
}
.prc-actions-btns {
  display: flex;
  gap: var(--ui-space-2);
}

/* ── Histórico recente ───────────────────────────────────────────────────── */
.prc-history {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.prc-history-item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.prc-history-item:last-child { border-bottom: none; }
.prc-history-meta {
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-2);
  min-width: 0;
}
.prc-history-id {
  font-size: var(--ui-text-sm);
  font-weight: 700;
  color: rgb(var(--ui-fg));
  white-space: nowrap;
}
.prc-history-type {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface-2));
  padding: 1px 6px;
  border-radius: var(--ui-radius-sm);
  white-space: nowrap;
}
.prc-history-dates {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.prc-history-when {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.prc-history-err {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-danger));
}

/* ── Responsividade ──────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .prc-metrics {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--ui-space-3);
  }
  .prc-job-banner { flex-wrap: wrap; }
  .prc-job-aside { width: 100%; justify-content: flex-end; }
}

@media (max-width: 640px) {
  .prc-actions { align-items: stretch; }
  .prc-actions-btns { width: 100%; }
  .prc-actions-btns :deep(.ui-btn) { flex: 1 1 auto; }
  .prc-history-item { flex-wrap: wrap; }
}
</style>
