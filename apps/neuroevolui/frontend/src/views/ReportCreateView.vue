<template>
  <UiPageLayout
    eyebrow="Relatórios"
    title="Gerar relatório"
    subtitle="Solicite um relatório consolidado de evolução de um paciente. A geração roda em segundo plano e o status atualiza automaticamente."
    width="narrow"
  >
    <template #actions>
      <UiButton variant="ghost" to="/patients">Voltar aos pacientes</UiButton>
    </template>

    <!-- Banner de acompanhamento do job (some quando não há job em andamento) -->
    <template v-if="job" #banner>
      <div class="report-job" :data-tone="jobTone" role="status" aria-live="polite">
        <span class="report-job-dot" aria-hidden="true" />
        <div class="report-job-text">
          <p class="report-job-title">{{ jobHeadline }}</p>
          <p class="report-job-sub">{{ jobDetail }}</p>
        </div>
        <div class="report-job-side">
          <UiStatusBadge :status="job.status" :label="statusLabelFor(job.status)" size="sm" />
          <UiButton
            v-if="isTerminal && job.status === 'completed'"
            variant="subtle"
            size="sm"
            to="/patients"
          >Ver pacientes</UiButton>
          <UiButton
            v-else-if="job.status === 'error' || job.status === 'failed'"
            variant="subtle"
            size="sm"
            :disabled="busy"
            @click="retryJob"
          >Tentar de novo</UiButton>
        </div>
      </div>
    </template>

    <form class="report-form" novalidate @submit.prevent="submit">
      <UiCard title="Paciente" subtitle="De quem é este relatório.">
        <UiFormSection :columns="1">
          <UiFormField
            label="Paciente"
            :required="true"
            :error="f.errors.patient_id"
            hint="Identificador do paciente (UUID ou código do prontuário)."
          >
            <template #default="{ id, describedBy, hasError }">
              <input
                :id="id"
                class="report-input"
                type="text"
                inputmode="text"
                autocomplete="off"
                :value="f.values.patient_id"
                :aria-describedby="describedBy || undefined"
                :aria-invalid="hasError || undefined"
                :aria-required="true"
                placeholder="Ex.: a1b2c3d4-…"
                :disabled="formLocked"
                @input="f.setField('patient_id', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <UiCard title="Filtros" subtitle="Recorte o relatório por período, tipo de evolução e profissional.">
        <UiFormSection :columns="2">
          <UiFormField label="Período de" :error="f.errors.date_from" hint="Data inicial das evoluções (opcional).">
            <template #default="{ id, describedBy, hasError }">
              <input
                :id="id"
                class="report-input"
                type="date"
                :value="f.values.date_from"
                :max="todayIso"
                :aria-describedby="describedBy || undefined"
                :aria-invalid="hasError || undefined"
                :disabled="formLocked"
                @input="f.setField('date_from', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Período até" :error="f.errors.date_to" :hint="dateToHint">
            <template #default="{ id, describedBy, hasError }">
              <input
                :id="id"
                class="report-input"
                type="date"
                :value="f.values.date_to"
                :min="f.values.date_from || undefined"
                :max="todayIso"
                :aria-describedby="describedBy || undefined"
                :aria-invalid="hasError || undefined"
                :disabled="formLocked"
                @input="f.setField('date_to', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Tipo de evolução" :error="f.errors.type" hint="Filtra pelo tipo de nota (opcional).">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                class="report-input"
                :value="f.values.type"
                :aria-describedby="describedBy || undefined"
                :disabled="formLocked"
                @change="f.setField('type', $event.target.value)"
              >
                <option value="">Todos os tipos</option>
                <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="Profissional" :error="f.errors.professional_id" hint="Identificador do profissional (opcional).">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                class="report-input"
                type="text"
                autocomplete="off"
                :value="f.values.professional_id"
                :aria-describedby="describedBy || undefined"
                placeholder="Todos os profissionais"
                :disabled="formLocked"
                @input="f.setField('professional_id', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <p class="report-summary">{{ filterSummary }}</p>
      </UiCard>

      <div class="form-actions">
        <p class="form-hint">
          Campos com <span class="req-mark" aria-hidden="true">*</span> são obrigatórios.
          A geração é assíncrona — você pode acompanhar o status acima.
        </p>
        <div class="form-buttons">
          <UiButton variant="ghost" type="button" :disabled="busy" @click="cancel">Cancelar</UiButton>
          <UiButton
            variant="primary"
            type="submit"
            :loading="busy"
          >{{ submitLabel }}</UiButton>
        </div>
      </div>
    </form>

    <!-- Histórico recente do paciente: loading / error / empty / normal -->
    <UiCard v-if="f.values.patient_id" title="Relatórios recentes" subtitle="Últimas solicitações para este paciente.">
      <template #actions>
        <UiButton variant="ghost" size="sm" :loading="history.loading" @click="loadHistory">Atualizar</UiButton>
      </template>

      <UiLoadingState v-if="history.loading && !history.items.length" variant="skeleton" :skeleton-lines="3" />

      <UiErrorState
        v-else-if="history.error"
        :message="history.error"
        :retryable="true"
        @retry="loadHistory"
      />

      <UiEmptyState
        v-else-if="!history.items.length"
        title="Nenhum relatório ainda"
        description="Este paciente ainda não tem relatórios. Gere o primeiro pelo formulário acima."
        icon="document"
      />

      <ul v-else class="report-history">
        <li v-for="item in history.items" :key="item.id" class="report-history-item">
          <div class="report-history-main">
            <span class="report-history-id">#{{ item.id }}</span>
            <span class="report-history-when">{{ formatWhen(item) }}</span>
            <span v-if="item.error_message" class="report-history-err">{{ item.error_message }}</span>
          </div>
          <UiStatusBadge :status="item.status" :label="statusLabelFor(item.status)" size="sm" />
        </li>
      </ul>
    </UiCard>
  </UiPageLayout>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
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

// Recurso REST garantido pelo integrador (resourceFactory('patient-reports') → /v1/patient-reports).
// Acesso por colchetes porque o nome do export tem hífen; fallback defensivo p/ a fábrica
// (api.js não exporta esse membro por padrão) — mesmo padrão das views irmãs (List/Detail).
const reports = api['patient-reports'] || api.resourceFactory('patient-reports');

const router = useRouter();
const toast = useToast();
const askConfirm = useConfirm();

// ── Domínio: rótulos de status (backend escreve 'failed'; o spec prevê 'error') ──
const STATUS_LABELS = {
  queued: 'Na fila',
  processing: 'Processando',
  completed: 'Concluído',
  error: 'Erro',
  failed: 'Erro',
};
const statusLabelFor = (s) => STATUS_LABELS[s] || format.humanize(s);

const TYPE_LABELS = {
  session: 'Sessão',
  assessment: 'Avaliação',
  evolution: 'Evolução',
  discharge: 'Alta',
};
const typeOptions = Object.keys(TYPE_LABELS).map((value) => ({ value, label: TYPE_LABELS[value] }));

// ── Datas ────────────────────────────────────────────────────────────────────
const todayIso = new Date().toISOString().slice(0, 10);

// ── Formulário ─────────────────────────────────────────────────────────────────
const f = useForm({
  initial: { patient_id: '', date_from: '', date_to: '', type: '', professional_id: '' },
  rules: {
    patient_id: [validators.required('Informe o paciente.'), validators.minLen(1)],
    // Coerência do intervalo: "até" não pode ser anterior a "de".
    date_to: [
      (v, all) => (v && all.date_from && v < all.date_from ? 'A data final não pode ser anterior à inicial.' : ''),
    ],
  },
});

const dateToHint = computed(() =>
  f.values.date_from ? 'Data final das evoluções (após a inicial).' : 'Data final das evoluções (opcional).',
);

const filterSummary = computed(() => {
  const parts = [];
  if (f.values.date_from || f.values.date_to) {
    const de = f.values.date_from ? format.formatDate(f.values.date_from) : 'início';
    const ate = f.values.date_to ? format.formatDate(f.values.date_to) : 'hoje';
    parts.push('Período: ' + de + ' até ' + ate);
  } else {
    parts.push('Período: todo o histórico');
  }
  parts.push('Tipo: ' + (f.values.type ? (TYPE_LABELS[f.values.type] || f.values.type) : 'todos'));
  parts.push('Profissional: ' + (f.values.professional_id ? f.values.professional_id : 'todos'));
  return parts.join('  ·  ');
});

// ── Job assíncrono + polling do status ──────────────────────────────────────────
const job = ref(null); // { id, status, created_at, completed_at, error_message }
const isPolling = ref(false);
let pollTimer = null;
let pollAttempts = 0;
const MAX_POLLS = 40; // ~2min a 3s/poll — depois para e mantém o último status conhecido.

const isTerminal = computed(() => {
  const s = job.value && job.value.status;
  return s === 'completed' || s === 'error' || s === 'failed';
});

// Estado único de "em andamento" (envio do form OU polling do status). Evita dois
// spinners simultâneos (banner + botão) ao reenviar — um só indicador visual.
const busy = computed(() => f.submitting.value || isPolling.value);

// Trava o formulário enquanto há um job ativo (não-terminal) para evitar duplicidade.
const formLocked = computed(() => !!job.value && !isTerminal.value);

const submitLabel = computed(() => {
  if (formLocked.value) return 'Gerando…';
  if (job.value && isTerminal.value) return 'Gerar novo relatório';
  return 'Gerar relatório';
});

const jobTone = computed(() => {
  const s = job.value && job.value.status;
  if (s === 'completed') return 'success';
  if (s === 'error' || s === 'failed') return 'error';
  return 'running';
});
const jobHeadline = computed(() => {
  if (!job.value) return '';
  switch (job.value.status) {
    case 'queued': return 'Relatório enfileirado';
    case 'processing': return 'Gerando relatório…';
    case 'completed': return 'Relatório pronto';
    case 'error':
    case 'failed': return 'Falha ao gerar o relatório';
    default: return 'Acompanhando o relatório';
  }
});
const jobDetail = computed(() => {
  if (!job.value) return '';
  if (job.value.status === 'completed') {
    return 'Relatório #' + job.value.id + ' concluído' + (job.value.completed_at ? ' em ' + format.formatDateTime(job.value.completed_at) : '') + '.';
  }
  if (job.value.status === 'error' || job.value.status === 'failed') {
    return job.value.error_message || 'Ocorreu um erro no processamento. Você pode tentar novamente.';
  }
  return 'Solicitação #' + job.value.id + ' em andamento. Atualizamos o status automaticamente.';
});

function stopPolling() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  isPolling.value = false;
}

async function pollOnce(reportId) {
  try {
    const row = await reports.get(reportId);
    job.value = row;
    if (row && (row.status === 'completed' || row.status === 'error' || row.status === 'failed')) {
      stopPolling();
      loadHistory();
      if (row.status === 'completed') toast.success('Relatório #' + row.id + ' gerado com sucesso.');
      else toast.error(row.error_message || 'O relatório falhou ao ser gerado.');
      return;
    }
  } catch (e) {
    // Fail-soft: erro pontual no polling não derruba a tela; tentamos de novo até o teto.
    if (e && (e.status === 401 || e.status === 403)) {
      stopPolling();
      toast.error('Sem permissão para acompanhar este relatório.');
      return;
    }
  }
  pollAttempts += 1;
  if (pollAttempts >= MAX_POLLS) {
    stopPolling();
    toast.error('A geração está demorando mais que o esperado. Atualize o histórico em instantes.');
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
  if (vals.type) payload.type = vals.type;
  if (vals.professional_id) payload.professional_id = String(vals.professional_id).trim();
  return payload;
}

async function submit() {
  if (formLocked.value) return;
  await f.handleSubmit(async (vals) => {
    try {
      const res = await reports.create(buildPayload(vals));
      const reportId = res && (res.report_id || res.id);
      if (!reportId) {
        toast.error('A solicitação foi aceita, mas não retornou um identificador de relatório.');
        return;
      }
      job.value = { id: reportId, status: res.status || 'queued', created_at: new Date().toISOString() };
      toast.success('Relatório solicitado. Gerando em segundo plano…');
      loadHistory();
      // Se o backend processou de forma síncrona (inline), busca o resultado uma vez; senão faz polling.
      startPolling(reportId);
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) {
        toast.error('Você não tem permissão para gerar relatórios.');
        return;
      }
      toast.error(e.message || 'Não foi possível solicitar o relatório.');
    }
  });
}

async function retryJob() {
  // Reusa os filtros atuais do formulário para uma nova solicitação.
  await submit();
}

async function cancel() {
  if (formLocked.value) {
    const ok = await askConfirm({
      title: 'Sair com geração em andamento?',
      message: 'O relatório continuará sendo gerado em segundo plano, mas você deixará de acompanhar o status aqui.',
      confirmLabel: 'Sair mesmo assim',
      danger: true,
    });
    if (!ok) return;
  }
  router.push('/patients');
}

// ── Histórico recente do paciente ───────────────────────────────────────────────
const history = reactive({ items: [], loading: false, error: null });
let historyToken = 0;

async function loadHistory() {
  const pid = String(f.values.patient_id || '').trim();
  if (!pid) { history.items = []; history.error = null; return; }
  const token = ++historyToken;
  history.loading = true;
  history.error = null;
  try {
    const res = await reports.list({ patient_id: pid, pageSize: 10, sort: 'created_at', dir: 'desc' });
    if (token !== historyToken) return; // resposta obsoleta — paciente mudou.
    history.items = (res && res.data) || [];
  } catch (e) {
    if (token !== historyToken) return;
    history.error = e.message || 'Não foi possível carregar o histórico de relatórios.';
  } finally {
    if (token === historyToken) history.loading = false;
  }
}

function formatWhen(item) {
  if (item.status === 'completed' && item.completed_at) return 'Concluído em ' + format.formatDateTime(item.completed_at);
  if (item.created_at) return 'Solicitado em ' + format.formatDateTime(item.created_at);
  return '—';
}

// Recarrega o histórico (debounced) quando o paciente muda.
let historyDebounce = null;
watch(
  () => f.values.patient_id,
  () => {
    if (historyDebounce) clearTimeout(historyDebounce);
    historyDebounce = setTimeout(loadHistory, 350);
  },
);

onMounted(() => {
  if (f.values.patient_id) loadHistory();
});

onBeforeUnmount(() => {
  stopPolling();
  if (historyDebounce) clearTimeout(historyDebounce);
});
</script>

<style scoped>
.report-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}

.report-input {
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
.report-input:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.report-input:disabled {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  cursor: not-allowed;
}
.report-input::placeholder {
  color: rgb(var(--ui-faint));
}

.report-summary {
  margin: var(--ui-space-3) 0 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}

/* Banner de acompanhamento do job */
.report-job {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
}
.report-job[data-tone="running"] { border-color: rgb(var(--ui-accent) / 0.45); background: rgb(var(--ui-accent) / 0.06); }
.report-job[data-tone="success"] { border-color: rgb(var(--ui-ok) / 0.45); background: rgb(var(--ui-ok) / 0.07); }
.report-job[data-tone="error"] { border-color: rgb(var(--ui-danger) / 0.45); background: rgb(var(--ui-danger) / 0.06); }

.report-job-dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
  background: rgb(var(--ui-muted));
}
.report-job[data-tone="running"] .report-job-dot {
  background: rgb(var(--ui-accent));
  animation: report-pulse 1.4s ease-in-out infinite;
}
.report-job[data-tone="success"] .report-job-dot { background: rgb(var(--ui-ok)); }
.report-job[data-tone="error"] .report-job-dot { background: rgb(var(--ui-danger)); }

@keyframes report-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.7); }
}
@media (prefers-reduced-motion: reduce) {
  .report-job[data-tone="running"] .report-job-dot { animation: none; }
}

.report-job-text { flex: 1 1 auto; min-width: 0; }
.report-job-title { margin: 0; font-weight: 600; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }
.report-job-sub { margin: 2px 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.report-job-side {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-shrink: 0;
}

/* Histórico */
.report-history {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.report-history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.report-history-item:last-child { border-bottom: none; }
.report-history-main {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  min-width: 0;
}
.report-history-id { font-weight: 700; color: rgb(var(--ui-fg)); font-size: var(--ui-text-sm); }
.report-history-when { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.report-history-err { color: rgb(var(--ui-danger)); font-size: var(--ui-text-xs); }

/* Ações do formulário */
.form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding-top: var(--ui-space-2);
}
.form-hint { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); max-width: 60ch; }
.req-mark { color: rgb(var(--ui-danger)); font-weight: 700; }
.form-buttons { display: flex; gap: var(--ui-space-2); }

@media (max-width: 860px) {
  .report-job { flex-wrap: wrap; }
  .report-job-side { width: 100%; justify-content: flex-end; }
}
@media (max-width: 640px) {
  .form-actions { align-items: stretch; }
  .form-buttons { width: 100%; }
  .form-buttons :deep(.ui-btn) { flex: 1 1 auto; }
}
</style>
