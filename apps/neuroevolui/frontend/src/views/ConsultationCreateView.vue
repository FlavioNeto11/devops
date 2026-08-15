<template>
  <UiPageLayout
    eyebrow="Agenda"
    title="Novo agendamento"
    subtitle="Selecione paciente, profissional, data/hora, duração e valor. Conflitos de horário são detectados automaticamente."
    width="narrow"
  >
    <template #actions>
      <UiButton variant="ghost" to="/consultations">Voltar à agenda</UiButton>
    </template>

    <!-- ESTADO: carregando catálogos (pacientes/profissionais) -->
    <UiLoadingState
      v-if="bootState === 'loading'"
      variant="skeleton"
      :skeleton-lines="8"
      title="Preparando o agendamento…"
    />

    <!-- ESTADO: erro no preparo (com retry) -->
    <UiErrorState
      v-else-if="bootState === 'error'"
      message="Não foi possível preparar a tela de agendamento. Verifique a conexão e tente novamente."
      :retryable="true"
      @retry="bootstrap"
    />

    <!-- ESTADO: sem permissão -->
    <UiCard v-else-if="bootState === 'denied'">
      <UiEmptyState title="Acesso restrito" :description="deniedMessage" icon="lock">
        <template #action>
          <UiButton variant="ghost" to="/consultations">Voltar à agenda</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- ESTADO: normal — formulário de agendamento -->
    <form v-else class="cc-form" novalidate @submit.prevent="submit">

      <!-- Resumo ao vivo (KPIs derivados do que está sendo preenchido) -->
      <section class="cc-metrics" aria-label="Resumo do agendamento">
        <UiMetricCard
          label="Início"
          :value="startSummary"
          tone="primary"
          hint="Data e hora da consulta"
        />
        <UiMetricCard
          label="Término previsto"
          :value="endSummary"
          tone="running"
          :hint="durationSummary"
        />
        <UiMetricCard
          label="Valor"
          :value="amountSummary"
          tone="success"
          hint="Valor da sessão"
        />
      </section>

      <!-- Alerta de conflito de horário (HTTP 409) -->
      <div v-if="conflictAlert" class="cc-conflict-banner" role="alert" aria-live="assertive">
        <span class="cc-conflict-icon" aria-hidden="true">⚠</span>
        <div class="cc-conflict-body">
          <p class="cc-conflict-title">Conflito de horário detectado</p>
          <p class="cc-conflict-desc">{{ conflictAlert }}</p>
        </div>
        <button
          type="button"
          class="cc-conflict-dismiss"
          aria-label="Fechar alerta de conflito"
          @click="conflictAlert = ''"
        >✕</button>
      </div>

      <!-- Participantes -->
      <UiCard title="Participantes" subtitle="Quem será atendido e por quem.">
        <UiFormSection :columns="2">
          <UiFormField
            label="Paciente"
            :required="true"
            :error="f.errors.patient_id"
            :hint="patientHint"
          >
            <template #default="{ id, describedBy }">
              <select
                v-if="patientOptions.length"
                :id="id"
                class="cc-select"
                :aria-describedby="describedBy || undefined"
                :aria-required="true"
                :aria-invalid="f.errors.patient_id ? 'true' : undefined"
                :value="f.values.patient_id"
                @change="f.setField('patient_id', $event.target.value)"
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
                :error="!!f.errors.patient_id"
                :required="true"
                placeholder="Identificador do paciente"
                @update:model-value="f.setField('patient_id', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Profissional"
            :required="true"
            :error="f.errors.professional_id"
            :hint="professionalHint"
          >
            <template #default="{ id, describedBy }">
              <select
                v-if="professionalOptions.length"
                :id="id"
                class="cc-select"
                :aria-describedby="describedBy || undefined"
                :aria-required="true"
                :aria-invalid="f.errors.professional_id ? 'true' : undefined"
                :value="f.values.professional_id"
                @change="f.setField('professional_id', $event.target.value)"
              >
                <option value="" disabled>Selecione o profissional…</option>
                <option v-for="opt in professionalOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <UiInput
                v-else
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.professional_id"
                :error="!!f.errors.professional_id"
                :required="true"
                placeholder="Identificador do profissional"
                @update:model-value="f.setField('professional_id', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Horário -->
      <UiCard title="Horário" subtitle="Quando a consulta acontece e quanto dura.">
        <UiFormSection :columns="2">
          <UiFormField
            label="Início"
            :required="true"
            :error="f.errors.scheduled_at"
            hint="Data e hora de início da consulta."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="datetime-local"
                :model-value="f.values.scheduled_at"
                :error="!!f.errors.scheduled_at"
                :required="true"
                :min="minDateTime"
                @update:model-value="onScheduledAtChange($event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Duração"
            :required="true"
            :error="f.errors.duration_minutes"
            hint="Tempo total reservado na agenda."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                class="cc-select"
                :aria-describedby="describedBy || undefined"
                :aria-required="true"
                :aria-invalid="f.errors.duration_minutes ? 'true' : undefined"
                :value="String(f.values.duration_minutes)"
                @change="f.setField('duration_minutes', $event.target.value)"
              >
                <option v-for="opt in durationOptions" :key="opt.value" :value="String(opt.value)">
                  {{ opt.label }}
                </option>
              </select>
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- Aviso (não destrutivo) sobre horário no passado -->
        <p v-if="startInPast" class="cc-inline-warn" role="status" aria-live="polite">
          ⚠ O horário escolhido está no passado. Confirme antes de agendar.
        </p>
      </UiCard>

      <!-- Cobrança -->
      <UiCard title="Cobrança" subtitle="Valor da consulta e moeda de faturamento.">
        <UiFormSection :columns="2">
          <UiFormField
            label="Valor"
            :required="true"
            :error="f.errors.amount"
            hint="Valor da consulta para o paciente."
          >
            <template #default="{ id, describedBy }">
              <div class="cc-money">
                <span class="cc-money-prefix" aria-hidden="true">{{ currencySymbol }}</span>
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  type="number"
                  :model-value="f.values.amount"
                  :error="!!f.errors.amount"
                  :required="true"
                  inputmode="decimal"
                  placeholder="0,00"
                  @update:model-value="f.setField('amount', $event)"
                />
              </div>
            </template>
          </UiFormField>

          <UiFormField label="Moeda" :error="f.errors.currency" hint="Moeda da cobrança.">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                class="cc-select"
                :aria-describedby="describedBy || undefined"
                :value="f.values.currency"
                @change="f.setField('currency', $event.target.value)"
              >
                <option v-for="opt in currencyOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- Selo de idempotência -->
        <p class="cc-idem" role="note">
          <span class="cc-idem-dot" aria-hidden="true">●</span>
          Cobrança protegida por chave de idempotência — reenvios da mesma tentativa não geram
          cobrança em dobro.
        </p>
      </UiCard>

      <!-- Lembretes — REQ-NEUROEVOLUI-0007 -->
      <UiCard
        title="Lembretes"
        subtitle="Dispare um lembrete automático para o paciente antes da consulta."
      >
        <div class="cc-reminder-grid">
          <!-- Toggle principal: enviar lembrete -->
          <div class="cc-toggle-row">
            <label class="cc-check" for="cc-reminder-toggle">
              <input
                id="cc-reminder-toggle"
                type="checkbox"
                class="cc-checkbox"
                :checked="sendReminder"
                @change="onToggleReminder($event.target.checked)"
              />
              <span class="cc-check-text">
                <span class="cc-check-title">Enviar lembrete de consulta</span>
                <span class="cc-check-hint">
                  Notifica o paciente antecipadamente. O canal depende das preferências cadastradas.
                </span>
              </span>
            </label>
          </div>

          <!-- Opções de antecedência (só visíveis quando toggle ativo) -->
          <div v-if="sendReminder" class="cc-reminder-options" aria-live="polite">
            <UiFormSection :columns="2">
              <UiFormField
                label="Antecedência do lembrete"
                hint="Com quantas horas de antecedência avisar o paciente."
                :error="f.errors.reminder_hours"
              >
                <template #default="{ id, describedBy }">
                  <select
                    :id="id"
                    class="cc-select"
                    :aria-describedby="describedBy || undefined"
                    :value="String(f.values.reminder_hours)"
                    @change="f.setField('reminder_hours', $event.target.value)"
                  >
                    <option v-for="opt in reminderHoursOptions" :key="opt.value" :value="String(opt.value)">
                      {{ opt.label }}
                    </option>
                  </select>
                </template>
              </UiFormField>

              <UiFormField
                label="Canal preferencial"
                hint="Canal de envio do lembrete (quando disponível)."
              >
                <template #default="{ id, describedBy }">
                  <select
                    :id="id"
                    class="cc-select"
                    :aria-describedby="describedBy || undefined"
                    :value="f.values.reminder_channel"
                    @change="f.setField('reminder_channel', $event.target.value)"
                  >
                    <option v-for="opt in reminderChannelOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- Informativo sobre o canal -->
            <p class="cc-reminder-info" role="note">
              <span class="cc-idem-dot" aria-hidden="true">●</span>
              O lembrete será agendado automaticamente após o agendamento ser confirmado.
              Canais indisponíveis são ignorados sem bloquear a criação da consulta.
            </p>
          </div>
        </div>
      </UiCard>

      <!-- Observações -->
      <UiCard title="Observações" subtitle="Notas internas sobre o agendamento (opcional).">
        <UiFormSection :columns="1">
          <UiFormField label="Observações" :error="f.errors.notes" full-width>
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                class="cc-textarea"
                :aria-describedby="describedBy || undefined"
                :value="f.values.notes"
                rows="3"
                placeholder="Preparações, motivo da consulta, alertas…"
                @input="f.setField('notes', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Ações -->
      <div class="cc-actions">
        <p class="cc-actions-hint">
          Os campos marcados com <span class="cc-req">*</span> são obrigatórios.
        </p>
        <div class="cc-actions-buttons">
          <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">
            Cancelar
          </UiButton>
          <UiButton variant="primary" type="submit" :loading="f.submitting.value">
            {{ sendReminder ? 'Agendar e enviar lembrete' : 'Agendar consulta' }}
          </UiButton>
        </div>
      </div>
    </form>
  </UiPageLayout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiFormSection,
  UiFormField,
  UiInput,
  UiButton,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import { consultations, patients, professionals } from '../api.js';

const router = useRouter();
const toast = useToast();
const askConfirm = useConfirm();

// ---- Estado de preparo da tela ---------------------------------------------
const bootState = ref('loading'); // loading | ok | denied | error
const deniedMessage = ref(
  'Você não tem permissão para criar agendamentos. Fale com um administrador.',
);
// UX-NEURO-007: sessão expirada (401) ≠ falta de permissão (403). No 401 a faixa global já
// oferece "Entrar novamente"; a mensagem do corpo acompanha, sem mandar "falar com um administrador".
const SESSION_EXPIRED_MESSAGE =
  'Sua sessão expirou. Use "Entrar novamente" na faixa acima para retomar o agendamento.';

// ---- Catálogos (fail-soft) --------------------------------------------------
const patientOptions = ref([]);
const professionalOptions = ref([]);

const patientHint = computed(() =>
  patientOptions.value.length
    ? 'Selecione o paciente da consulta.'
    : 'Identificador do paciente (lista indisponível — informe o ID).',
);
const professionalHint = computed(() =>
  professionalOptions.value.length
    ? 'Selecione o profissional responsável.'
    : 'Identificador do profissional (lista indisponível — informe o ID).',
);

// ---- Opções de domínio ------------------------------------------------------
const durationOptions = [
  { value: 30, label: '30 minutos' },
  { value: 45, label: '45 minutos' },
  { value: 50, label: '50 minutos' },
  { value: 60, label: '1 hora' },
  { value: 90, label: '1 hora e 30 min' },
  { value: 120, label: '2 horas' },
];

const currencyOptions = [
  { value: 'BRL', label: 'Real (BRL)' },
  { value: 'USD', label: 'Dólar (USD)' },
];

const CURRENCY_SYMBOLS = { BRL: 'R$', USD: 'US$' };

// Lembretes — REQ-NEUROEVOLUI-0007
const reminderHoursOptions = [
  { value: 1,  label: '1 hora antes' },
  { value: 2,  label: '2 horas antes' },
  { value: 6,  label: '6 horas antes' },
  { value: 12, label: '12 horas antes' },
  { value: 24, label: '24 horas antes (1 dia)' },
  { value: 48, label: '48 horas antes (2 dias)' },
];

const reminderChannelOptions = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms',      label: 'SMS' },
  { value: 'email',    label: 'E-mail' },
  { value: 'push',     label: 'Notificação push' },
];

const sendReminder = ref(false);
function onToggleReminder(checked) {
  sendReminder.value = !!checked;
  if (!sendReminder.value) {
    f.setField('reminder_hours', 24);
    f.setField('reminder_channel', 'whatsapp');
  }
}

// ---- Alerta de conflito (HTTP 409) ------------------------------------------
const conflictAlert = ref('');

// ---- Formulário -------------------------------------------------------------
const f = useForm({
  initial: {
    patient_id: '',
    professional_id: '',
    scheduled_at: '',
    duration_minutes: 50,
    amount: '',
    currency: 'BRL',
    reminder_hours: 24,
    reminder_channel: 'whatsapp',
    notes: '',
  },
  rules: {
    patient_id: [validators.required('Selecione o paciente.')],
    professional_id: [validators.required('Selecione o profissional.')],
    scheduled_at: [validators.required('Informe a data e hora de início.')],
    duration_minutes: [
      validators.required('Selecione a duração.'),
      validators.min(1, 'Duração inválida.'),
    ],
    amount: [
      validators.required('Informe o valor.'),
      validators.numeric('Valor inválido.'),
      validators.min(0, 'O valor não pode ser negativo.'),
    ],
    currency: [validators.required('Selecione a moeda.')],
  },
});

// Limpa conflito ao mudar horário ou profissional (o usuário está corrigindo)
function onScheduledAtChange(val) {
  f.setField('scheduled_at', val);
  if (conflictAlert.value) conflictAlert.value = '';
}

// ---- Derivados de exibição --------------------------------------------------
const currencySymbol = computed(() => CURRENCY_SYMBOLS[f.values.currency] || 'R$');

const startDate = computed(() => {
  const raw = f.values.scheduled_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
});

const endDate = computed(() => {
  if (!startDate.value) return null;
  const mins = Number(f.values.duration_minutes);
  if (!isFinite(mins) || mins <= 0) return null;
  return new Date(startDate.value.getTime() + mins * 60000);
});

const startSummary = computed(() =>
  startDate.value ? format.formatDateTime(startDate.value.toISOString()) : '—',
);
const endSummary = computed(() =>
  endDate.value ? format.formatDateTime(endDate.value.toISOString()) : '—',
);
const durationSummary = computed(() => {
  const opt = durationOptions.find((o) => String(o.value) === String(f.values.duration_minutes));
  return opt ? opt.label : f.values.duration_minutes + ' min';
});

const amountCents = computed(() => {
  const n = Number(String(f.values.amount).replace(',', '.'));
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
});

const amountSummary = computed(() => {
  if (amountCents.value === null) return '—';
  return format.formatCurrency(amountCents.value / 100, f.values.currency);
});

const startInPast = computed(() => !!startDate.value && startDate.value.getTime() < Date.now());

// `min` do datetime-local: agora (truncado ao minuto, formato local sem timezone).
const minDateTime = computed(() => {
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  );
});

// ---- Idempotency-Key (1 por montagem; renovada só após conflito 409) --------
function newIdempotencyKey() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return 'consultation-' + crypto.randomUUID();
    }
  } catch (_e) {
    /* fallback abaixo */
  }
  return 'consultation-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
const idempotencyKey = ref(newIdempotencyKey());

// ---- Sujeira do formulário (para confirmar descarte) ------------------------
function isDirty() {
  const v = f.values;
  return Boolean(
    v.patient_id ||
      v.professional_id ||
      v.scheduled_at ||
      v.amount ||
      v.notes ||
      Number(v.duration_minutes) !== 50 ||
      v.currency !== 'BRL',
  );
}

// ---- Submit -----------------------------------------------------------------
async function submit() {
  await f.handleSubmit(async (vals) => {
    const cents = amountCents.value;
    if (cents === null) {
      f.errors.amount = 'Valor inválido.';
      toast.error('Revise o valor da consulta.');
      return;
    }

    // Calcula scheduled_end_at a partir do início + duração
    const endDt = endDate.value;

    const payload = {
      patient_id: vals.patient_id,
      professional_id: vals.professional_id,
      scheduled_at: startDate.value ? startDate.value.toISOString() : vals.scheduled_at,
      scheduled_end_at: endDt ? endDt.toISOString() : null,
      duration_minutes: Number(vals.duration_minutes),
      amount_cents: cents,
      currency: vals.currency || 'BRL',
      notes: vals.notes ? vals.notes.trim() : null,
    };

    // Lembrete (REQ-NEUROEVOLUI-0007): inclui no payload se toggle ativo
    if (sendReminder.value) {
      payload.reminder = {
        send: true,
        hours_before: Number(vals.reminder_hours),
        channel: vals.reminder_channel,
      };
    }

    try {
      // consultations.schedule() → POST /v1/consultations/schedule (valida conflito de horário)
      // Idempotência: api.js injeta o header Idempotency-Key; mesma chave p/ retries.
      const created = await consultations.schedule(payload, {
        idempotencyKey: idempotencyKey.value,
      });

      const reminderMsg = sendReminder.value
        ? ' Lembrete agendado para ' + vals.reminder_hours + 'h antes.'
        : '';
      toast.success('Consulta agendada com sucesso.' + reminderMsg);

      const id = created && (created.id || (created.data && created.data.id));
      router.push(id ? '/consultations/' + id : '/consultations');
    } catch (e) {
      handleSubmitError(e);
    }
  });
}

function handleSubmitError(e) {
  const status = e && e.status;

  if (status === 401 || status === 403) {
    bootState.value = 'denied';
    deniedMessage.value = status === 401
      ? SESSION_EXPIRED_MESSAGE
      : (e && e.message) || deniedMessage.value;
    toast.error(status === 401 ? 'Sessão expirada. Entre novamente.' : 'Sem permissão para agendar.');
    return;
  }

  // HTTP 409 — conflito de horário na agenda do profissional (REQ-NEUROEVOLUI-0005)
  if (status === 409) {
    idempotencyKey.value = newIdempotencyKey(); // renova para próxima tentativa
    f.errors.scheduled_at = 'Horário indisponível para este profissional.';
    conflictAlert.value =
      (e && e.message) ||
      'O profissional já possui uma consulta nesse intervalo. Escolha outro horário ou profissional.';
    toast.error('Conflito de horário detectado. Escolha outro horário.');
    return;
  }

  if (status === 422) {
    toast.error((e && e.message) || 'Dados inválidos. Revise o formulário.');
    return;
  }

  toast.error((e && e.message) || 'Não foi possível agendar a consulta. Tente novamente.');
}

// ---- Cancelar (destrutivo se houver dados) ----------------------------------
async function cancel() {
  if (isDirty()) {
    const ok = await askConfirm({
      title: 'Descartar agendamento?',
      message: 'As informações preenchidas serão perdidas.',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
  }
  router.push('/consultations');
}

// ---- Bootstrap (carrega catálogos de domínio, fail-soft) --------------------
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

async function loadOptions(resource, target) {
  if (!resource || typeof resource.list !== 'function') {
    target.value = [];
    return;
  }
  // Deixa o erro propagar para bootstrap() setar bootState='error'.
  const res = await resource.list({ pageSize: 200 });
  const data = Array.isArray(res) ? res : res && res.data ? res.data : [];
  target.value = data
    .map((row) => ({ value: row.id, label: nameOf(row) }))
    .filter((o) => o.value !== undefined && o.value !== null && o.value !== '');
}

async function bootstrap() {
  bootState.value = 'loading';
  try {
    await Promise.all([
      loadOptions(patients, patientOptions),
      loadOptions(professionals, professionalOptions),
    ]);
    bootState.value = 'ok';
  } catch (e) {
    // Sem permissão para listar os catálogos → 'denied' (o retry não resolve).
    // 'error' fica reservado a falhas de rede/5xx, onde tentar de novo faz sentido.
    const status = e && e.status;
    if (status === 401 || status === 403) {
      bootState.value = 'denied';
      deniedMessage.value = status === 401
        ? SESSION_EXPIRED_MESSAGE
        : (e && e.message) || deniedMessage.value;
    } else {
      bootState.value = 'error';
    }
  }
}

onMounted(bootstrap);
</script>

<style scoped>
.cc-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}

/* Resumo ao vivo */
.cc-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
}

/* Alerta de conflito de horário (HTTP 409) — REQ-NEUROEVOLUI-0005 */
.cc-conflict-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-danger) / 0.08);
  border: 1px solid rgb(var(--ui-danger) / 0.3);
}
.cc-conflict-icon {
  flex: 0 0 auto;
  font-size: var(--ui-text-lg);
  color: rgb(var(--ui-danger));
  margin-top: var(--ui-space-1);
}
.cc-conflict-body {
  flex: 1 1 auto;
  min-width: 0;
}
.cc-conflict-title {
  margin: 0 0 var(--ui-space-1);
  font-size: var(--ui-text-sm);
  font-weight: 700;
  color: rgb(var(--ui-danger));
}
.cc-conflict-desc {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.cc-conflict-dismiss {
  flex: 0 0 auto;
  background: none;
  border: none;
  cursor: pointer;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  padding: 0;
  line-height: 1;
  transition: color 0.15s ease;
}
.cc-conflict-dismiss:hover {
  color: rgb(var(--ui-danger));
}
.cc-conflict-dismiss:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
  border-radius: var(--ui-radius-sm);
}

/* Select compartilhado — estilizado exclusivamente com tokens --ui-* */
.cc-select {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.cc-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.cc-select:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.cc-select[aria-invalid='true'] {
  border-color: rgb(var(--ui-danger));
}
.cc-select[aria-invalid='true']:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}

/* Textarea — estilizada exclusivamente com tokens --ui-* */
.cc-textarea {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  min-height: calc(var(--ui-space-5) * 3);
  resize: vertical;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.cc-textarea:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.cc-textarea:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.cc-textarea[aria-invalid='true'] {
  border-color: rgb(var(--ui-danger));
}
.cc-textarea[aria-invalid='true']:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}
.cc-textarea::placeholder {
  color: rgb(var(--ui-faint));
}

/* Valor monetário */
.cc-money {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}
.cc-money-prefix {
  flex: 0 0 auto;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.cc-money :deep(.ui-input) {
  font-variant-numeric: tabular-nums;
}

/* Aviso inline de horário no passado */
.cc-inline-warn {
  margin: var(--ui-space-3) 0 0;
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-warning) / 0.1);
  border: 1px solid rgb(var(--ui-warning) / 0.3);
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}

/* Seção de lembretes — REQ-NEUROEVOLUI-0007 */
.cc-reminder-grid {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.cc-toggle-row {
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface));
}
.cc-check {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  cursor: pointer;
}
.cc-checkbox {
  flex: 0 0 auto;
  width: var(--ui-space-4);
  height: var(--ui-space-4);
  margin-top: var(--ui-space-1);
  accent-color: rgb(var(--ui-accent));
  cursor: pointer;
}
.cc-check-text {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}
.cc-check-title {
  font-size: var(--ui-text-md);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.cc-check-hint {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.cc-reminder-options {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.cc-reminder-info {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  margin: 0;
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-accent) / 0.06);
  border: 1px solid rgb(var(--ui-accent) / 0.18);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* Idempotência */
.cc-idem {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: var(--ui-space-4) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.cc-idem-dot {
  color: rgb(var(--ui-success));
  font-size: var(--ui-text-xs);
}

/* Ações do formulário */
.cc-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding-top: var(--ui-space-2);
}
.cc-actions-hint {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.cc-req {
  color: rgb(var(--ui-danger));
  font-weight: 700;
}
.cc-actions-buttons {
  display: flex;
  gap: var(--ui-space-2);
}

/* Responsividade */
@media (max-width: 860px) {
  .cc-metrics {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--ui-space-3);
  }
}

@media (max-width: 640px) {
  .cc-conflict-banner {
    flex-wrap: wrap;
  }
  .cc-actions {
    align-items: stretch;
  }
  .cc-actions-buttons {
    width: 100%;
  }
  .cc-actions-buttons :deep(.ui-btn) {
    flex: 1 1 auto;
  }
}
</style>
