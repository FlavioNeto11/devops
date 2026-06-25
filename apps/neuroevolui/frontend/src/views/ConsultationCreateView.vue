<template>
  <UiPageLayout
    eyebrow="Agenda"
    title="Novo agendamento"
    subtitle="Selecione paciente, profissional, data/hora, duração e valor. A cobrança é processada pelo gateway de forma idempotente."
    width="narrow"
  >
    <template #actions>
      <UiButton variant="ghost" to="/consultations">Voltar à agenda</UiButton>
    </template>

    <!-- ESTADO: carregando catálogos (pacientes/profissionais) -->
    <UiLoadingState
      v-if="bootState === 'loading'"
      variant="skeleton"
      :skeleton-lines="7"
      title="Preparando o agendamento…"
    />

    <!-- ESTADO: erro no preparo (com retry) -->
    <UiErrorState
      v-else-if="bootState === 'error'"
      message="Não foi possível preparar a tela de agendamento."
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
          :hint="chargeNow ? 'Será cobrado agora' : 'Cobrança pendente'"
        />
      </section>

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
                @update:model-value="f.setField('scheduled_at', $event)"
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
        <p v-if="startInPast" class="cc-inline-warn" role="status">
          O horário escolhido está no passado. Confirme antes de agendar.
        </p>
      </UiCard>

      <!-- Cobrança -->
      <UiCard
        title="Cobrança"
        subtitle="Valor da consulta e processamento do pagamento pelo gateway."
      >
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

        <!-- Toggle: cobrar agora -->
        <div class="cc-charge-toggle">
          <label class="cc-check">
            <input
              type="checkbox"
              class="cc-checkbox"
              :checked="chargeNow"
              @change="onToggleCharge($event.target.checked)"
            />
            <span class="cc-check-text">
              <span class="cc-check-title">Cobrar agora pelo gateway</span>
              <span class="cc-check-hint">
                Quando ativado, é necessário o token de pagamento gerado no checkout do paciente.
              </span>
            </span>
          </label>
        </div>

        <UiFormSection v-if="chargeNow" :columns="1">
          <UiFormField
            label="Token de pagamento"
            :required="true"
            :error="f.errors.payment_token"
            hint="Token retornado pelo gateway (cartão/Pix) que autoriza a cobrança desta consulta."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.payment_token"
                :error="!!f.errors.payment_token"
                :required="chargeNow"
                autocomplete="off"
                placeholder="tok_..."
                @update:model-value="f.setField('payment_token', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- Selo de idempotência (transparência da garantia de cobrança única) -->
        <p class="cc-idem" role="note">
          <span class="cc-idem-dot" aria-hidden="true">●</span>
          Cobrança protegida por chave de idempotência — reenvios da mesma tentativa não geram
          cobrança em dobro.
        </p>
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
            {{ chargeNow ? 'Agendar e cobrar' : 'Agendar consulta' }}
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
import { resourceFactory } from '../api.js';

const router = useRouter();
const toast = useToast();
const askConfirm = useConfirm();

// Clientes REST de domínio (mesmo padrão do DashboardView): cada um aponta para
// /v1/<name> com list/get/create. `consultations` é o recurso principal; patients/
// professionals são best-effort (catálogos) — se a lista falhar, caímos em texto livre.
const consultationsApi = resourceFactory('consultations');
const patientsApi = resourceFactory('patients');
const professionalsApi = resourceFactory('professionals');

// ---- Estado de preparo da tela ---------------------------------------------
// `bootState` é o ÚNICO dono dos estados de boot (loading/ok/denied/error). O
// UiPageLayout NÃO recebe :error — os ramos internos (UiLoadingState/UiErrorState/
// UiEmptyState) renderizam dentro do slot, com retry próprio via @retry="bootstrap".
const bootState = ref('loading'); // loading | ok | denied | error
const deniedMessage = ref(
  'Você não tem permissão para criar agendamentos. Fale com um administrador.',
);

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
  { value: 'EUR', label: 'Euro (EUR)' },
];
const CURRENCY_SYMBOLS = { BRL: 'R$', USD: 'US$', EUR: '€' };

// ---- Formulário -------------------------------------------------------------
const f = useForm({
  initial: {
    patient_id: '',
    professional_id: '',
    scheduled_at: '',
    duration_minutes: 50,
    amount: '',
    currency: 'BRL',
    payment_token: '',
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
    // payment_token tem regra condicional (ver registerPaymentRule).
  },
});

// Cobrança agora (exige token). Registra/retira a regra do token dinamicamente.
const chargeNow = ref(false);
function onToggleCharge(checked) {
  chargeNow.value = !!checked;
  registerPaymentRule();
  if (!chargeNow.value) {
    f.setField('payment_token', '');
    delete f.errors.payment_token;
  }
}
function registerPaymentRule() {
  f.rules.payment_token = chargeNow.value
    ? [validators.required('Informe o token de pagamento para cobrar agora.')]
    : [];
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
      v.payment_token ||
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

    const payload = {
      patient_id: vals.patient_id,
      professional_id: vals.professional_id,
      scheduled_at: startDate.value ? startDate.value.toISOString() : vals.scheduled_at,
      duration_minutes: Number(vals.duration_minutes),
      amount_cents: cents,
      currency: vals.currency || 'BRL',
      notes: vals.notes ? vals.notes.trim() : null,
    };
    if (chargeNow.value && vals.payment_token) {
      payload.payment_token = vals.payment_token.trim();
    }

    try {
      // create(body, { idempotencyKey }) → api.js injeta o header Idempotency-Key
      // (cobrança/criação única; a MESMA chave é reusada em retries, renovada só no 409).
      const created = await consultationsApi.create(payload, {
        idempotencyKey: idempotencyKey.value,
      });
      toast.success(
        chargeNow.value
          ? 'Consulta agendada e cobrança enviada ao gateway.'
          : 'Consulta agendada com sucesso.',
      );
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
    deniedMessage.value = (e && e.message) || deniedMessage.value;
    toast.error('Sem permissão para agendar.');
    return;
  }
  if (status === 409) {
    // Conflito de horário (ou idempotência) — renova a chave para a próxima tentativa.
    idempotencyKey.value = newIdempotencyKey();
    f.errors.scheduled_at = 'Horário indisponível para este profissional.';
    toast.error(
      (e && e.message) ||
        'Conflito de horário: o profissional já tem uma consulta nesse intervalo. Escolha outro horário.',
    );
    return;
  }
  if (status === 402 || status === 422) {
    // Falha de pagamento informada pelo gateway.
    toast.error((e && e.message) || 'Não foi possível processar o pagamento. Verifique o token.');
    return;
  }
  toast.error((e && e.message) || 'Não foi possível agendar a consulta.');
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
  try {
    const res = await resource.list({ pageSize: 200 });
    const data = Array.isArray(res) ? res : res && res.data ? res.data : [];
    target.value = data
      .map((row) => ({ value: row.id, label: nameOf(row) }))
      .filter((o) => o.value !== undefined && o.value !== null && o.value !== '');
  } catch (_e) {
    // Sem catálogo → texto livre (não é erro fatal da tela).
    target.value = [];
  }
}

async function bootstrap() {
  bootState.value = 'loading';
  try {
    registerPaymentRule();
    // Catálogos são best-effort (loadOptions engole falhas → texto livre). O boot só
    // entra em 'error' se algo realmente inesperado quebrar aqui.
    await Promise.all([
      loadOptions(patientsApi, patientOptions),
      loadOptions(professionalsApi, professionalOptions),
    ]);
    bootState.value = 'ok';
  } catch (_e) {
    bootState.value = 'error';
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

.cc-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
}

.cc-select {
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
.cc-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.cc-select[aria-invalid='true'] {
  border-color: rgb(var(--ui-danger));
}

.cc-textarea {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 8px 11px;
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  min-height: 84px;
  resize: vertical;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.cc-textarea:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.cc-textarea::placeholder {
  color: rgb(var(--ui-faint));
}

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

.cc-inline-warn {
  margin: var(--ui-space-3) 0 0;
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-warning) / 0.1);
  border: 1px solid rgb(var(--ui-warning) / 0.3);
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}

.cc-charge-toggle {
  margin-top: var(--ui-space-4);
}
.cc-check {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  cursor: pointer;
}
.cc-checkbox {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  accent-color: rgb(var(--ui-accent));
  cursor: pointer;
}
.cc-check-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
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
  font-size: 0.7em;
}

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

@media (max-width: 860px) {
  .cc-metrics {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--ui-space-3);
  }
}

@media (max-width: 640px) {
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
